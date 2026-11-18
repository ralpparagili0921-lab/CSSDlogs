// ============================================================
// OFFLINE WRITE QUEUE (backlog item #11)
// Scoped to the core logbook submissions only — RO, Equipment,
// Cycle Log, QA, Brush, Instrument Maintenance. These are the
// time-critical writes a shift actually depends on (someone needs
// to log at 7am with no connection). Admin/config actions (staff,
// machines, thresholds, exceptions) still require a live connection —
// nobody's doing machine setup mid-outage, and keeping those simple
// and always-online avoids a much larger restructure for no real gain.
//
// db.js calls into this for its logbook write functions. main.js
// (js/main.js) subscribes via onChange() to show a persistent
// "Offline — N changes queued" banner, and drives flush() on the
// 'online' event, a ~30s interval, and once at boot.
// ============================================================

const PENDING_WRITES_KEY = 'cssd_pending_writes';

const OfflineQueue = {
  _listeners: [],

  onChange(fn) { this._listeners.push(fn); },
  _notify() {
    const list = this.list();
    this._listeners.forEach(fn => { try { fn(list); } catch (e) {} });
  },

  list() {
    try { return JSON.parse(localStorage.getItem(PENDING_WRITES_KEY) || '[]'); }
    catch (e) { return []; }
  },
  _save(q) {
    try { localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(q)); return true; }
    catch (e) { console.error('OfflineQueue: could not persist queue', e); return false; }
  },

  enqueue(task) {
    const q = this.list();
    q.push(Object.assign({}, task, {
      _id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random()),
      _queuedAt: new Date().toISOString()
    }));
    // If the browser cannot store the queue (private mode, storage full)
    // the entry would be lost silently while the screen said "saved".
    // Throw instead so the caller shows a real error and the person
    // keeps what they typed.
    if (!this._save(q)) throw new Error('This device could not store the entry for later sync (storage full or blocked). Keep this screen open and try again when online.');
    this._notify();
  },

  // Network failures from a fetch (offline, DNS, timeout) never carry a
  // Postgres error code; a real rejection from Supabase (check constraint,
  // RLS, bad column) always does. supabase-js hands a network failure back
  // as { code:'', details:'TypeError: Failed to fetch ...', message:... },
  // so details/hint are NOT a sign of a server rejection — only the code is.
  // Queuing a genuinely invalid entry would fail again forever on flush.
  isLikelyNetworkError(err) {
    return !err || !err.code;
  },

  // Entries made while offline get a provisional number like "RO-PENDING-3FA9C2D1"
  // (see DB.generateSerialNumber). Real numbers are handed out at sync time, so
  // two devices that were both offline can never end up with the same one.
  _pendingSerialFields(task) {
    const p = task.payload;
    if (task.op !== 'insert' || !p || Array.isArray(p)) return [];
    return ['serial_number', 'cycle_number'].filter(k => typeof p[k] === 'string' && /^[A-Z]+-PENDING-/.test(p[k]));
  },
  async _assignSerials(task) {
    for (const k of this._pendingSerialFields(task)) {
      const prefix = task.payload[k].split('-')[0];
      const next = await DB.generateSerialNumber(task.table, k, prefix);
      // The lookup itself may have failed for lack of a connection, in which
      // case it hands back another provisional number: treat as still offline.
      if (/-PENDING-/.test(next)) throw new TypeError('Failed to fetch');
      task.payload[k] = next;
    }
  },

  async _runTask(task) {
    if (task.op === 'insert') {
      await this._assignSerials(task);
      let { error } = await supabaseClient.from(task.table).insert(task.payload);
      if (error && error.code === '23505' && !this._isIdConflict(error) && !Array.isArray(task.payload)) {
        // Someone else took this serial number meanwhile. Get a fresh one
        // and try once more rather than losing the entry.
        for (const k of ['serial_number', 'cycle_number']) {
          if (task.payload[k] && String(error.message + error.details).includes(k)) {
            const next = await DB.generateSerialNumber(task.table, k, String(task.payload[k]).split('-')[0]);
            if (/-PENDING-/.test(next)) throw new TypeError('Failed to fetch');
            task.payload[k] = next;
          }
        }
        ({ error } = await supabaseClient.from(task.table).insert(task.payload));
      }
      // 23505 on the entry's own id means an earlier attempt already reached
      // the server (the reply was lost): the entry is there, count it as done.
      if (error && !(error.code === '23505' && this._isIdConflict(error) && this._hasClientId(task))) throw error;
    } else if (task.op === 'update') {
      const { error } = await supabaseClient.from(task.table).update(task.payload).eq(task.matchCol || 'id', task.matchId);
      if (error) throw error;
    } else if (task.op === 'delete') {
      const { error } = await supabaseClient.from(task.table).delete().eq(task.matchCol || 'id', task.matchId);
      if (error) throw error;
    }
  },

  _isIdConflict(err) {
    const text = (err.message || '') + ' ' + (err.details || '');
    return /_pkey/.test(text) || /Key \(id\)=/.test(text);
  },

  _hasClientId(task) {
    const p = task.payload;
    if (Array.isArray(p)) return p.length > 0 && p.every(r => r && r.id);
    return !!(p && p.id);
  },

  // A request that hangs on a dead connection (browser still says "online")
  // must not freeze the screen: give up after a while and queue instead.
  // If the server did receive it, the replay is harmless (see 23505 above;
  // updates and deletes are idempotent).
  _withTimeout(promise, ms) {
    let t;
    const timeout = new Promise((_, reject) => {
      t = setTimeout(() => reject(new TypeError('Request timed out')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  },

  // The single entry point db.js's write functions call through.
  // Returns { queued: true } if it went to the offline queue instead of
  // the server, so calling UI code can show "saved — will sync" instead
  // of a plain "saved". matchCol defaults to 'id' — pass a different
  // column name for tables matched some other way (e.g. brushes by brush_id).
  async submit(op, table, payload, matchId, matchCol) {
    // Every insert carries its own id, so a retry after a lost reply cannot
    // create a duplicate row.
    if (op === 'insert' && payload && !Array.isArray(payload) && !payload.id) payload = Object.assign({ id: generateUUID() }, payload);
    const task = { op, table, payload, matchId, matchCol };
    // Offline, or older entries are still waiting: go to the back of the
    // line so writes reach the server in the order they were made (an
    // update must never overtake the insert it belongs to).
    if (navigator.onLine === false || this.list().length > 0) {
      this.enqueue(task);
      if (navigator.onLine !== false) this.flush();
      return { queued: true };
    }
    try {
      await this._withTimeout(this._runTask(task), 15000);
      return { queued: false };
    } catch (err) {
      if (this.isLikelyNetworkError(err)) {
        this.enqueue(task);
        return { queued: true };
      }
      throw err;
    }
  },

  _flushing: false,

  // Replays queued writes oldest-first. On a network failure it STOPS and
  // keeps that entry and everything after it (order matters). A real
  // server rejection is moved to the failed list so it can't block the
  // queue forever. Entries added while a flush is running are preserved.
  async flush() {
    if (this._flushing) return { flushed: 0, remaining: this.list().length };
    if (this.list().length === 0) return { flushed: 0, remaining: 0 };
    if (navigator.onLine === false) return { flushed: 0, remaining: this.list().length };
    this._flushing = true;
    let flushed = 0;
    try {
      const batch = this.list();
      for (const task of batch) {
        try {
          await this._withTimeout(this._runTask(task), 15000);
          flushed++;
          this._remove(task._id);
        } catch (err) {
          if (this.isLikelyNetworkError(err)) break;     // still offline: keep this and the rest
          this._recordFailed(task, err);                 // server said no: don't retry forever, don't hide it
          this._remove(task._id);
        }
      }
    } finally {
      this._flushing = false;
    }
    const remaining = this.list().length;
    this._notify();
    return { flushed, remaining };
  },

  // Removes one entry by its id, re-reading the queue so anything added
  // in the meantime stays.
  _remove(id) {
    this._save(this.list().filter(t => t._id !== id));
  },

  _recordFailed(task, err) {
    try {
      const key = 'cssd_failed_writes';
      const failed = JSON.parse(localStorage.getItem(key) || '[]');
      failed.push(Object.assign({}, task, { _failedAt: new Date().toISOString(), _error: err && err.message }));
      localStorage.setItem(key, JSON.stringify(failed));
    } catch (e) {}
  },
  listFailed() {
    try { return JSON.parse(localStorage.getItem('cssd_failed_writes') || '[]'); }
    catch (e) { return []; }
  },
  clearFailed() {
    try { localStorage.removeItem('cssd_failed_writes'); } catch (e) {}
  }
};

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
    try { localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(q)); }
    catch (e) { console.error('OfflineQueue: could not persist queue', e); }
  },

  enqueue(task) {
    const q = this.list();
    q.push(Object.assign({}, task, {
      _id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random()),
      _queuedAt: new Date().toISOString()
    }));
    this._save(q);
    this._notify();
  },

  // Network failures from a fetch (offline, DNS, timeout) don't carry a
  // Postgres error code; a real rejection from Supabase (check constraint,
  // RLS, bad column) does. Only queue on what looks like connectivity —
  // queuing a genuinely invalid entry would just fail again forever on flush.
  isLikelyNetworkError(err) {
    return !err || (!err.code && !err.details && !err.hint);
  },

  async _runTask(task) {
    if (task.op === 'insert') {
      const { error } = await supabaseClient.from(task.table).insert(task.payload);
      if (error) throw error;
    } else if (task.op === 'update') {
      const { error } = await supabaseClient.from(task.table).update(task.payload).eq(task.matchCol || 'id', task.matchId);
      if (error) throw error;
    } else if (task.op === 'delete') {
      const { error } = await supabaseClient.from(task.table).delete().eq(task.matchCol || 'id', task.matchId);
      if (error) throw error;
    }
  },

  // The single entry point db.js's write functions call through.
  // Returns { queued: true } if it went to the offline queue instead of
  // the server, so calling UI code can show "saved — will sync" instead
  // of a plain "saved". matchCol defaults to 'id' — pass a different
  // column name for tables matched some other way (e.g. brushes by brush_id).
  async submit(op, table, payload, matchId, matchCol) {
    const task = { op, table, payload, matchId, matchCol };
    if (navigator.onLine === false) {
      this.enqueue(task);
      return { queued: true };
    }
    try {
      await this._runTask(task);
      return { queued: false };
    } catch (err) {
      if (this.isLikelyNetworkError(err)) {
        this.enqueue(task);
        return { queued: true };
      }
      throw err;
    }
  },

  async flush() {
    let q = this.list();
    if (q.length === 0) return { flushed: 0, remaining: 0 };
    if (navigator.onLine === false) return { flushed: 0, remaining: q.length };
    let flushed = 0;
    const stillPending = [];
    for (const task of q) {
      try {
        await this._runTask(task);
        flushed++;
      } catch (err) {
        // A real (non-network) rejection on flush would just loop forever —
        // drop it rather than retry indefinitely, but never silently: keep
        // it visible via the failed list so a superuser can see what didn't
        // make it, instead of it vanishing.
        if (this.isLikelyNetworkError(err)) {
          stillPending.push(task);
        } else {
          this._recordFailed(task, err);
        }
      }
    }
    this._save(stillPending);
    this._notify();
    return { flushed, remaining: stillPending.length };
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

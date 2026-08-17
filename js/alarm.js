// ============================================================
// ALARM — audible alerts for time-critical states (exposure time
// elapsed, BI incubation complete). A short attention tone, followed
// by a spoken announcement naming exactly what happened and where —
// clearer than trying to memorize different tone patterns per
// scenario, and needs no external audio files (tone via Web Audio
// API, voice via the browser's built-in speech synthesis).
//
// Browsers require a user gesture somewhere on the page before audio
// or speech will actually play — attach() below primes both on the
// first click/touch of a session so alarms fire reliably once
// someone's actually used the app, which covers real usage (staff
// are clicking things throughout their shift). If literally zero
// interaction has happened yet, the sound may be silently blocked —
// a real browser limitation, not something any web app can override.
// ============================================================

const Alarm = {
  _audioCtx: null,
  _unlocked: false,
  _repeatTimers: {},

  attach() {
    const unlock = () => {
      this._getContext();
      if (window.speechSynthesis) window.speechSynthesis.getVoices();
      if (window.Notification && Notification.permission === 'default') {
        Notification.requestPermission(); // same first-interaction moment as audio priming — one ask, not repeated
      }
      this._unlocked = true;
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
  },

  _getContext() {
    if (!this._audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._audioCtx = new AC();
    }
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
    return this._audioCtx;
  },

  _tone() {
    const ctx = this._getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.22].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.18, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  },

  _speak(message) {
    if (!message || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // don't stack up overlapping announcements
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    utterance.volume = 1;
    // Fire the spoken part slightly after the tone so they don't overlap
    setTimeout(() => window.speechSynthesis.speak(utterance), 500);
  },

  _notify(title, message) {
    if (!window.Notification || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body: message, tag: title }); // tag replaces any existing notification with the same title instead of stacking duplicates
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) { /* some browsers restrict this outside certain contexts — non-fatal, other channels still fire */ }
  },

  _vibrate() {
    // Android Chrome supports this; iOS Safari has never implemented the
    // Vibration API at all — this is a real platform gap, not a bug here,
    // so it silently does nothing on iOS rather than erroring.
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  },

  // Per-device, not per-account — deliberately localStorage, not a DB
  // field, since the same superuser might want alarms audible on their
  // workstation but muted on a separate device used only for
  // monitoring. Only ever surfaced to superusers in the UI (Admin),
  // but the flag itself just lives on whichever device toggles it.
  isMuted() {
    try { return localStorage.getItem('cssd_alarm_muted') === 'true'; } catch (e) { return false; }
  },

  setMuted(muted) {
    try { localStorage.setItem('cssd_alarm_muted', muted ? 'true' : 'false'); } catch (e) {}
  },

  // Plays the tone + spoken message once, right now, plus a system
  // notification and (where supported) vibration — several channels
  // since no single one is guaranteed to get through (muted device,
  // notifications denied, iOS not supporting vibration, etc.). Muting
  // silences all of these — the visual glow and the alarm panel box
  // are unaffected, so a muted device still shows what's happening,
  // just without sound/vibration/notification interrupting.
  announce(message, title = 'CSSD Alert') {
    if (this.isMuted()) return;
    this._tone();
    this._speak(message);
    this._notify(title, message);
    this._vibrate();
  },

  // Starts repeating announce() every intervalMs under `key`, until
  // stop(key) is called — a one-time alert is too easy to miss if
  // nobody's looking right at that second.
  start(key, message, title = 'CSSD Alert', intervalMs = 30000) {
    if (this._repeatTimers[key]) return; // already alarming for this one
    this.announce(message, title);
    this._repeatTimers[key] = setInterval(() => this.announce(message, title), intervalMs);
  },

  stop(key) {
    if (this._repeatTimers[key]) {
      clearInterval(this._repeatTimers[key]);
      delete this._repeatTimers[key];
    }
  },

  stopAll() {
    Object.keys(this._repeatTimers).forEach(k => this.stop(k));
  },

  // Keys of every alarm currently repeating — lets a view stop
  // whichever of its own alarms are no longer relevant (e.g. a cycle
  // that completed) without reaching into this module's internals.
  activeKeys() {
    return Object.keys(this._repeatTimers);
  },

  // ---------------- Stacking alarm panel ----------------
  // A persistent, non-blocking panel (not a modal) that can hold one
  // box per active alarm at once, across the whole app — Cycle Log's
  // exposure alarms and QA's BI alarms both add to the SAME panel, so
  // if AC-01's exposure timer and a BI incubation both go off, they
  // show as two separate boxes stacked in one place rather than
  // competing pop-ups. Each box has its own Acknowledge button and
  // clears independently of the others.
  _ensurePanel() {
    let panel = document.getElementById('alarm-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'alarm-panel';
      document.body.appendChild(panel);
    }
    return panel;
  },

  hasBox(key) {
    return !!document.getElementById(`alarm-box-${key}`);
  },

  // title/message describe what happened; onAcknowledge runs when the
  // box's own Acknowledge button is clicked (should persist whatever
  // the caller needs — e.g. the DB timestamp — then call removeBox).
  showBox(key, title, message, onAcknowledge) {
    if (this.hasBox(key)) return; // already showing this one
    const panel = this._ensurePanel();
    const box = document.createElement('div');
    box.className = 'alarm-box';
    box.id = `alarm-box-${key}`;
    box.innerHTML = `
      <div class="alarm-box-title">⚠ ${UI.escapeHtml(title)}</div>
      <div class="alarm-box-message">${UI.escapeHtml(message)}</div>
      <button class="btn btn-sm btn-primary alarm-box-ack">Acknowledge</button>
    `;
    box.querySelector('.alarm-box-ack').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await onAcknowledge();
      } finally {
        this.removeBox(key);
      }
    });
    panel.appendChild(box);
  },

  removeBox(key) {
    const box = document.getElementById(`alarm-box-${key}`);
    if (box) box.remove();
    const panel = document.getElementById('alarm-panel');
    if (panel && panel.children.length === 0) panel.remove();
  }
};

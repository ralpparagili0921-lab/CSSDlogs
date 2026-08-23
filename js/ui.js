// ============================================================
// UI — small shared helpers used across every view
// ============================================================

const UI = {
  toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = isError ? 'error show' : 'show';
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => { el.className = el.className.replace('show', ''); }, 3200);
  },
  // Every logbook write now goes through the offline queue (backlog #11) and
  // resolves to { queued: true } instead of throwing when there's no
  // connection. Call sites pass that result straight through here so the
  // toast always tells the truth about whether it actually reached the
  // server yet, instead of a plain "saved" that could be misleading offline.
  writeResultToast(result, savedMsg, isError = false) {
    if (result && result.queued) {
      this.toast(`${savedMsg} — offline, saved on this device and will sync automatically`, isError);
    } else {
      this.toast(savedMsg, isError);
    }
  },

  showModal(html) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'active-modal';
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) UI.closeModal(); });
    document.body.appendChild(backdrop);
    return backdrop;
  },
  closeModal() {
    const el = document.getElementById('active-modal');
    if (el) el.remove();
  },

  // Backlog item #13 — a soft warning, not a block. Resolves true if the
  // person picks "Continue Anyway", false if they cancel.
  confirmDuplicate(message) {
    return new Promise((resolve) => {
      const modal = this.showModal(`
        <h3>Already logged</h3>
        <div class="modal-desc">${message}</div>
        <div class="modal-actions">
          <button class="btn" id="dup-cancel">Cancel</button>
          <button class="btn btn-danger" id="dup-continue">Continue Anyway</button>
        </div>
      `);
      modal.querySelector('#dup-cancel').addEventListener('click', () => { UI.closeModal(); resolve(false); });
      modal.querySelector('#dup-continue').addEventListener('click', () => { UI.closeModal(); resolve(true); });
    });
  },

  fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  },
  fmtDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
  fmtTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  },
  // Formats any Date object as a LOCAL YYYY-MM-DD string — same safe
  // pattern as todayStr()/daysAgoStr() above, generalized for a
  // caller-supplied date (e.g. a loop cursor) rather than "now."
  // NEVER use d.toISOString().slice(0,10) for this — that's UTC, and
  // for a Philippines user (UTC+8) it silently shifts every date back
  // by one calendar day.
  dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  todayStr() {
    // Built from local date components, not toISOString() (which is
    // UTC) — using UTC here meant a Philippines user logging something
    // in the early morning hours could get yesterday's date, since
    // UTC is still on the previous calendar day at that point locally.
    const d = TrueTime.now();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  nowTimeStr() {
    const d = TrueTime.now();
    return d.toTimeString().slice(0, 5);
  },
  daysAgoStr(n) {
    const d = TrueTime.now();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  durationHM(mins) {
    if (mins == null || isNaN(mins)) return '—';
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  },
  minutesBetween(a, b) {
    if (!a || !b) return null;
    return (new Date(b) - new Date(a)) / 60000;
  },
  daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
  },
  escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  async withLoading(btn, fn) {
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Working…';
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
};

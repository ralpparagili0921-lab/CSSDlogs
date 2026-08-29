// ============================================================
// ERROR REPORTER — catches errors that slip through uncaught (a real
// JS crash, or a promise rejection nobody handled) and shows a clear
// popup with a "Report to Superuser Ralp" button, so staff have a
// direct way to flag something broken instead of it just silently
// failing. Reports land in error_reports, visible to admin/superuser
// in a new Admin sidebar section.
//
// Deliberately scoped to genuinely uncaught errors, not every
// already-handled "Could not save" toast throughout the app — those
// already give the user a clear, specific message and a chance to
// retry. This is for the cases that would otherwise just look like
// nothing happened at all.
// ============================================================

const ErrorReporter = {
  _recentMessages: [], // { message, at } — for de-duplication, not persisted

  init() {
    window.addEventListener('error', (e) => {
      this._handle(e.message, e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason;
      this._handle(
        (reason && reason.message) || String(reason),
        reason && reason.stack
      );
    });
  },

  _handle(message, stack) {
    if (!message) return;
    // Suppress showing the exact same message again within 30s — a
    // broken repeating action (a loop, a periodic check) shouldn't
    // flood the screen with identical popups.
    const now = Date.now();
    this._recentMessages = this._recentMessages.filter(m => now - m.at < 30000);
    if (this._recentMessages.some(m => m.message === message)) return;
    this._recentMessages.push({ message, at: now });
    this.show(message, stack);
  },

  show(message, stack) {
    const viewContext = document.querySelector('[id^="view-"]:not(.hidden)')?.id || 'unknown';
    const modal = UI.showModal(`
      <h3 style="color:var(--red);">⚠ Something went wrong</h3>
      <div class="modal-desc">${UI.escapeHtml(message)}</div>
      <div class="hint" style="margin-top:10px;">If this is stopping you from finishing something, reporting it lets Ralp know exactly what happened and where — otherwise it might go unnoticed.</div>
      <div class="modal-actions">
        <button class="btn" id="err-dismiss">Dismiss</button>
        <button class="btn btn-primary" id="err-report">Report to Superuser Ralp</button>
      </div>
    `);
    modal.querySelector('#err-dismiss').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#err-report').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await DB.reportError({
          error_message: message,
          error_stack: stack || null,
          view_context: viewContext,
          staff_id: (window.Auth && Auth.currentStaff && Auth.currentStaff.id) || null,
          staff_name: (window.Auth && Auth.currentStaff && Auth.currentStaff.name) || null,
          user_agent: navigator.userAgent
        });
        modal.querySelector('.modal-desc').insertAdjacentHTML('afterend', `<div class="hint" style="color:var(--green);margin-top:8px;">✓ Reported — thank you.</div>`);
        btn.remove();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Report to Superuser Ralp';
        UI.toast('Could not send the report — check your connection and try again.', true);
      }
    });
  }
};

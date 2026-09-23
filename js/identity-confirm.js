// ============================================================
// IDENTITY CONFIRM — shared across every logbook's recording points.
// CSSD staff tend to leave the app logged in on a shared device, and
// whoever's physically there just logs the next entry without
// re-authenticating — so the staff_id/staff_name a record ends up
// with is only as reliable as who happened to be logged in, not who
// actually did the thing. This asks "who are you, right now" at the
// moment of the action itself — name-select, then that person's own
// PIN — and returns THAT confirmed identity, deliberately independent
// of whatever Auth.currentStaff currently says. Used everywhere a
// recordable action happens, not just the primary log-entry saves —
// captured broadly and consistently so it's usable for KPI analysis
// later, per the user's explicit call.
//
// Usage, right before the actual DB write, replacing a direct
// Auth.currentStaff.id/.name:
//   const who = await IdentityConfirm.confirm('Save Reading');
//   if (!who) return; // cancelled
//   ... staff_id: who.id, staff_name: who.name ...
// ============================================================

const IdentityConfirm = {
  // actionLabel appears in the modal ("Confirm your identity to
  // Save Reading"). Resolves to {id, name} once a real PIN match
  // succeeds, or null if the person cancels — always check for null
  // before proceeding with the write it's guarding.
  async confirm(actionLabel) {
    let staff;
    try { staff = await DB.listActiveStaff(); } catch (e) {
      UI.toast('Could not load staff — offline or unreachable', true);
      return null;
    }
    return new Promise((resolve) => {
      const modal = UI.showModal(`
        <div class="pin-label" style="margin-bottom:8px;">Confirm your identity to ${UI.escapeHtml(actionLabel)}</div>
        <div class="staff-grid" id="ic-name-grid">
          ${staff.map(s => `<button class="staff-btn" data-id="${s.id}">${UI.escapeHtml(s.name)}</button>`).join('')}
        </div>
        <div style="text-align:center;margin-top:12px;"><button class="btn btn-sm" id="ic-cancel">Cancel</button></div>
      `);
      let settled = false;
      const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
      modal.querySelector('#ic-cancel').addEventListener('click', () => { UI.closeModal(); finish(null); });
      modal.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => {
        const s = staff.find(x => x.id === btn.dataset.id);
        UI.closeModal();
        this._renderPinPad(s, actionLabel, (confirmed) => finish(confirmed));
      }));
    });
  },

  _renderPinPad(s, actionLabel, onDone) {
    const modal = UI.showModal(`
      <div class="pin-label" style="margin-bottom:10px;">Enter PIN for ${UI.escapeHtml(s.name)}</div>
      <div class="pin-dots" id="ic-pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>
      <div class="pin-pad" id="ic-pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <button class="pin-key func" data-key="back">←</button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key func" data-key="clear">C</button>
      </div>
      <div id="ic-pin-error" class="hint" style="color:var(--red);min-height:16px;margin-top:8px;text-align:center;"></div>
      <div style="text-align:center;margin-top:8px;"><button class="btn btn-sm" id="ic-pin-cancel">Cancel</button></div>
    `);
    let buf = '';
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; onDone(result); } };
    modal.querySelector('#ic-pin-cancel').addEventListener('click', () => { UI.closeModal(); finish(null); });
    const dots = () => modal.querySelectorAll('#ic-pin-dots .pin-dot').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
    modal.querySelectorAll('#ic-pin-pad .pin-key').forEach(k => k.addEventListener('click', () => {
      const key = k.dataset.key;
      if (key === 'clear') { buf = ''; dots(); return; }
      if (key === 'back') { buf = buf.slice(0, -1); dots(); return; }
      if (buf.length >= 4) return;
      buf += key;
      dots();
      if (buf.length === 4) {
        const entered = buf;
        buf = '';
        if (entered === s.pin) {
          UI.closeModal();
          finish({ id: s.id, name: s.name });
        } else {
          dots();
          modal.querySelector('#ic-pin-error').textContent = 'Incorrect PIN — try again.';
        }
      }
    }));
  }
};

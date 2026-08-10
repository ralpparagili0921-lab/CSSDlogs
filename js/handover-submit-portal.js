// ============================================================
// HANDOVER SUBMISSION PORTAL — no login required. This is how ER,
// OPD, OR, and Ward staff submit items for sterilization; they are
// NOT CSSD staff and don't have PIN accounts in this system. CSSD
// staff never see this form when logged in normally — their side of
// Instrument Handover (js/handover.js) is release-only. Both submission
// and release are timestamped automatically.
// ============================================================

const HandoverSubmitPortal = {
  show() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-public-dashboard').classList.add('hidden');
    document.getElementById('view-main').classList.add('hidden');
    document.getElementById('view-handover-submit').classList.remove('hidden');
    this._render();
  },
  hide() {
    document.getElementById('view-handover-submit').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    Auth.renderLogin();
  },

  _render() {
    const el = document.getElementById('view-handover-submit');
    el.innerHTML = `
      <div style="max-width:560px;margin:0 auto;padding:48px 20px 60px;">
        <button class="btn" id="hsp-back" style="margin-bottom:20px;">← Back</button>
        <div class="login-brand" style="margin-bottom:20px;">
          <div class="mark">C</div>
          <div class="title">Submit Items for Sterilization</div>
          <div class="subtitle">Tebow CURE Children's Hospital — CSSD</div>
        </div>
        <div class="card card-pad">
          <form id="hsp-form">
            <div class="form-grid">
              <div class="field">
                <label>Department</label>
                <select id="hsp-department" required>
                  <option value="ER">ER</option>
                  <option value="OPD">OPD</option>
                  <option value="OR">OR</option>
                  <option value="WARD 2nd Floor">WARD 2nd Floor</option>
                  <option value="WARD 3rd Floor">WARD 3rd Floor</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="field hidden" id="hsp-other-wrap">
                <label>Department (specify)</label>
                <input type="text" id="hsp-department-other">
              </div>
              <div class="field">
                <label>Your name</label>
                <input type="text" id="hsp-name" required placeholder="Who's submitting this?">
              </div>
              <div class="field field-full">
                <label>Items being submitted <span class="hint">type an item, press Enter to start a new line, then type the next one — one item per line</span></label>
                <textarea id="hsp-contents" rows="4" placeholder="e.g.&#10;2x Minor Surgery Set&#10;5x Gauze pack&#10;Basin" required></textarea>
              </div>
              <div class="field field-full"><label>Remarks <span class="hint">optional</span></label><textarea id="hsp-remarks"></textarea></div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="hsp-submit" style="width:100%;padding:14px;font-size:14px;">Submit for Sterilization</button>
            </div>
          </form>
        </div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:16px;text-align:center;">The date and time are recorded automatically the moment you submit.</div>
      </div>
    `;
    document.getElementById('hsp-back').addEventListener('click', () => this.hide());
    document.getElementById('hsp-department').addEventListener('change', (e) => {
      document.getElementById('hsp-other-wrap').classList.toggle('hidden', e.target.value !== 'Other');
    });
    document.getElementById('hsp-form').addEventListener('submit', (e) => this._submit(e));
  },

  async _submit(e) {
    e.preventDefault();
    const dept = document.getElementById('hsp-department').value;
    const name = document.getElementById('hsp-name').value.trim();
    if (!name) { UI.toast('Enter your name', true); return; }
    const entry = {
      department: dept,
      department_other: dept === 'Other' ? (document.getElementById('hsp-department-other').value || null) : null,
      submitted_by_name: name,
      load_contents: document.getElementById('hsp-contents').value || null,
      remarks: document.getElementById('hsp-remarks').value || null,
      status: 'Processing'
      // received_at defaults to now() in the database — timestamped automatically
    };
    const btn = document.getElementById('hsp-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addHandoverIntake(entry);
        if (result && result.queued) {
          UI.toast('Submitted — offline, saved on this device and will sync automatically once back online.');
        } else {
          UI.toast('Submitted to CSSD for sterilization');
        }
        document.getElementById('hsp-form').reset();
        document.getElementById('hsp-other-wrap').classList.add('hidden');
      } catch (err) {
        UI.toast('Could not submit: ' + err.message, true);
      }
    });
  }
};

// ============================================================
// DEPARTMENT PORTAL — for external department staff (ER/OPD/OR/Ward).
// Two entry points from the login screen: Submit Items, and Releasing
// of Items (verify receipt). Both require a department account —
// same PIN/security-question machinery as CSSD staff (default PIN,
// personalize on first use, 2 security questions), but scoped to only
// these two functions. CSSD staff never see this; department accounts
// never see the 9 CSSD logbooks.
// ============================================================

const DEPARTMENTS = ['ER', 'OPD', 'OR', 'WARD 2nd Floor', 'WARD 3rd Floor', 'Other'];

const DepartmentPortal = {
  _session: null,   // { id, name, department, department_other }
  _mode: 'submit',  // which function they entered through — 'submit' or 'release'

  show(mode) {
    this._mode = mode || 'submit';
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-public-dashboard').classList.add('hidden');
    document.getElementById('view-main').classList.add('hidden');
    document.getElementById('view-handover-submit').classList.remove('hidden');
    this._session = null;
    this._renderLogin();
  },
  hide() {
    document.getElementById('view-handover-submit').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    this._session = null;
    Auth.renderLogin();
  },

  _shell(inner) {
    const el = document.getElementById('view-handover-submit');
    el.innerHTML = `
      <div style="max-width:560px;margin:0 auto;padding:40px 20px 60px;">
        <button class="btn" id="dp-back">← Back</button>
        <div class="login-brand" style="margin:20px 0;">
          <div class="mark">C</div>
          <div class="title">${this._mode === 'release' ? 'Releasing of Items' : 'Submit Items for Sterilization'}</div>
          <div class="subtitle">Tebow CURE Children's Hospital — CSSD</div>
        </div>
        ${inner}
      </div>
    `;
    document.getElementById('dp-back').addEventListener('click', () => this._session ? this.show(this._mode) : this.hide());
  },

  // ---------------- LOGIN / REGISTER ----------------
  async _renderLogin() {
    this._shell(`<div class="card card-pad" id="dp-login-card">Loading…</div>`);
    document.getElementById('dp-back').addEventListener('click', () => this.hide());
    const card = document.getElementById('dp-login-card');
    card.innerHTML = `
      <div class="field" style="margin-bottom:14px;">
        <label>Department</label>
        <select id="dp-dept">${DEPARTMENTS.map(d => `<option>${d}</option>`).join('')}</select>
      </div>
      <div class="field hidden" id="dp-dept-other-wrap" style="margin-bottom:14px;"><label>Department (specify)</label><input type="text" id="dp-dept-other"></div>
      <div id="dp-names">Loading staff…</div>
    `;
    document.getElementById('dp-dept').addEventListener('change', (e) => {
      document.getElementById('dp-dept-other-wrap').classList.toggle('hidden', e.target.value !== 'Other');
      this._loadDeptNames();
    });
    this._loadDeptNames();
  },

  async _loadDeptNames() {
    const dept = document.getElementById('dp-dept').value;
    const wrap = document.getElementById('dp-names');
    try {
      const accounts = await DB.listDepartmentAccounts(dept);
      wrap.innerHTML = `
        <div class="pin-label" style="margin-bottom:8px;">Who's this?</div>
        <div class="staff-grid" id="dp-name-grid">
          ${accounts.map(a => `<button class="staff-btn" data-id="${a.id}">${UI.escapeHtml(a.name)}</button>`).join('')}
        </div>
        <button class="btn btn-sm" id="dp-register-new" style="width:100%;margin-top:14px;">+ I'm new — register me</button>
      `;
      wrap.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => {
        const acct = accounts.find(a => a.id === btn.dataset.id);
        this._renderPinEntry(acct);
      }));
      document.getElementById('dp-register-new').addEventListener('click', () => this._renderRegister(dept));
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  _renderPinEntry(account) {
    const card = document.getElementById('dp-login-card');
    card.innerHTML = `
      <div class="pin-label" style="margin-bottom:10px;">Enter PIN for ${UI.escapeHtml(account.name)}</div>
      ${!account.pin_changed ? `<div class="default-pin-hint">Default PIN is <strong>${DEFAULT_PIN}</strong> — you'll set your own right after.</div>` : ''}
      <div class="pin-dots" id="dp-pin-dots"><span></span><span></span><span></span><span></span></div>
      <div class="pin-pad" id="dp-pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <button class="pin-key func" data-key="back">←</button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key func" data-key="clear">C</button>
      </div>
      <div id="dp-pin-error" class="hint" style="color:var(--red);min-height:16px;margin-top:8px;text-align:center;"></div>
    `;
    let buf = '';
    const dots = () => card.querySelectorAll('#dp-pin-dots span').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
    card.querySelectorAll('#dp-pin-pad .pin-key').forEach(k => k.addEventListener('click', async () => {
      const key = k.dataset.key;
      if (key === 'clear') { buf = ''; dots(); return; }
      if (key === 'back') { buf = buf.slice(0, -1); dots(); return; }
      if (buf.length >= 4) return;
      buf += key;
      dots();
      if (buf.length === 4) {
        if (buf === account.pin) {
          if (!account.pin_changed) { this._renderSetPin(account, buf); return; }
          this._session = { id: account.id, name: account.name, department: account.department, department_other: account.department_other };
          this._enterPortal();
        } else {
          document.getElementById('dp-pin-error').textContent = 'Incorrect PIN — try again.';
          buf = ''; dots();
        }
      }
    }));
  },

  _renderSetPin(account, stage1, firstPin) {
    const card = document.getElementById('dp-login-card');
    card.innerHTML = `
      <div class="pin-label" style="margin-bottom:10px;">${firstPin ? 'Confirm your new PIN' : 'Choose a new PIN'}</div>
      <div class="pin-dots" id="dp-pin-dots"><span></span><span></span><span></span><span></span></div>
      <div class="pin-pad" id="dp-pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <button class="pin-key func" data-key="back">←</button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key func" data-key="clear">C</button>
      </div>
      <div id="dp-pin-error" class="hint" style="color:var(--red);min-height:16px;margin-top:8px;text-align:center;"></div>
    `;
    let buf = '';
    const dots = () => card.querySelectorAll('#dp-pin-dots span').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
    card.querySelectorAll('#dp-pin-pad .pin-key').forEach(k => k.addEventListener('click', async () => {
      const key = k.dataset.key;
      if (key === 'clear') { buf = ''; dots(); return; }
      if (key === 'back') { buf = buf.slice(0, -1); dots(); return; }
      if (buf.length >= 4) return;
      buf += key;
      dots();
      if (buf.length === 4) {
        if (!firstPin) { this._renderSetPin(account, null, buf); return; }
        if (buf !== firstPin) {
          document.getElementById('dp-pin-error').textContent = "Didn't match — let's try again.";
          setTimeout(() => this._renderSetPin(account, stage1), 900);
          return;
        }
        try {
          if (await DB.isPinTaken(buf, account.id)) {
            document.getElementById('dp-pin-error').textContent = 'That PIN is already in use — pick a different one.';
            setTimeout(() => this._renderSetPin(account, stage1), 1200);
            return;
          }
        } catch (e) { /* offline — proceed, uniqueness isn't safety-critical */ }
        this._pendingPin = buf;
        this._renderSecurityQuestions(account);
      }
    }));
  },

  _renderSecurityQuestions(account) {
    const card = document.getElementById('dp-login-card');
    card.innerHTML = `
      <div class="pin-label" style="margin-bottom:10px;">Set 2 security questions <span class="hint">used only to recover your PIN later</span></div>
      <div class="field" style="margin-bottom:12px;"><label>Question 1</label>
        <select id="dp-sq1">${SECURITY_QUESTIONS.map(q => `<option>${UI.escapeHtml(q)}</option>`).join('')}</select>
        <input type="text" id="dp-sa1" placeholder="Your answer" style="margin-top:6px;">
      </div>
      <div class="field" style="margin-bottom:12px;"><label>Question 2</label>
        <select id="dp-sq2">${SECURITY_QUESTIONS.map(q => `<option>${UI.escapeHtml(q)}</option>`).join('')}</select>
        <input type="text" id="dp-sa2" placeholder="Your answer" style="margin-top:6px;">
      </div>
      <div id="dp-sq-error" class="hint" style="color:var(--red);min-height:16px;"></div>
      <button class="btn btn-primary" id="dp-sq-save" style="width:100%;">Save and continue</button>
    `;
    const sq1 = document.getElementById('dp-sq1'), sq2 = document.getElementById('dp-sq2');
    const sync = () => {
      [[sq1, sq2], [sq2, sq1]].forEach(([self, other]) => {
        Array.from(self.options).forEach(opt => { opt.hidden = opt.value === other.value; });
      });
    };
    sq1.addEventListener('change', sync); sq2.addEventListener('change', sync);
    document.getElementById('dp-sq-save').addEventListener('click', async () => {
      const a1 = document.getElementById('dp-sa1').value.trim();
      const a2 = document.getElementById('dp-sa2').value.trim();
      if (!a1 || !a2) { document.getElementById('dp-sq-error').textContent = 'Answer both questions.'; return; }
      try {
        await DB.updateStaff(account.id, {
          pin: this._pendingPin, pin_changed: true,
          security_question_1: sq1.value, security_answer_1: a1.toLowerCase(),
          security_question_2: sq2.value, security_answer_2: a2.toLowerCase()
        });
        this._session = { id: account.id, name: account.name, department: account.department, department_other: account.department_other };
        this._enterPortal();
      } catch (e) { document.getElementById('dp-sq-error').textContent = 'Could not save: ' + e.message; }
    });
  },

  _renderRegister(dept) {
    const card = document.getElementById('dp-login-card');
    card.innerHTML = `
      <div class="pin-label" style="margin-bottom:10px;">Register — ${dept}</div>
      <div class="field" style="margin-bottom:14px;"><label>Your name</label><input type="text" id="dp-reg-name"></div>
      ${dept === 'Other' ? `<div class="field" style="margin-bottom:14px;"><label>Department (specify)</label><input type="text" id="dp-reg-dept-other"></div>` : ''}
      <div id="dp-reg-error" class="hint" style="color:var(--red);min-height:16px;"></div>
      <button class="btn btn-primary" id="dp-reg-save" style="width:100%;">Create account</button>
      <div class="hint" style="margin-top:8px;text-align:center;">Starts on the default PIN (${DEFAULT_PIN}) — you'll set your own right after.</div>
    `;
    document.getElementById('dp-reg-save').addEventListener('click', async () => {
      const name = document.getElementById('dp-reg-name').value.trim();
      if (!name) { document.getElementById('dp-reg-error').textContent = 'Enter your name.'; return; }
      const deptOther = dept === 'Other' ? (document.getElementById('dp-reg-dept-other').value.trim() || null) : null;
      try {
        const account = await DB.addStaff({
          name, role: 'department', department: dept, department_other: deptOther,
          pin: DEFAULT_PIN, pin_changed: false, active: true
        });
        this._renderPinEntry(account);
      } catch (e) { document.getElementById('dp-reg-error').textContent = 'Could not register: ' + e.message; }
    });
  },

  // ---------------- LOGGED IN — dispatch to submit or release ----------------
  _enterPortal() {
    if (this._mode === 'release') this._renderRelease();
    else this._renderSubmit();
  },

  _sessionBar() {
    const deptLabel = this._session.department === 'Other' ? (this._session.department_other || 'Other') : this._session.department;
    return `
      <div class="hint" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <span>${UI.escapeHtml(this._session.name)} · ${UI.escapeHtml(deptLabel)}</span>
        <span style="display:flex;gap:10px;">
          <a href="#" id="dp-switch" style="color:var(--brand);">${this._mode === 'release' ? 'Submit items instead' : 'Verify released items instead'}</a>
          <a href="#" id="dp-logout" style="color:var(--red);">Log out</a>
        </span>
      </div>
    `;
  },
  _wireSessionBar() {
    document.getElementById('dp-switch').addEventListener('click', (e) => { e.preventDefault(); this._mode = this._mode === 'release' ? 'submit' : 'release'; this._enterPortal(); });
    document.getElementById('dp-logout').addEventListener('click', (e) => { e.preventDefault(); this.hide(); });
  },

  // ---------------- SUBMIT ----------------
  _renderSubmit() {
    this._shell(`
      ${this._sessionBar()}
      <div class="card card-pad">
        <form id="hsp-form">
          <div class="form-grid">
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
    `);
    this._wireSessionBar();
    document.getElementById('hsp-form').addEventListener('submit', (e) => this._submit(e));
  },

  async _submit(e) {
    e.preventDefault();
    const entry = {
      department: this._session.department,
      department_other: this._session.department_other,
      submitted_by_id: this._session.id,
      submitted_by_name: this._session.name,
      load_contents: document.getElementById('hsp-contents').value || null,
      remarks: document.getElementById('hsp-remarks').value || null,
      status: 'Processing'
    };
    const btn = document.getElementById('hsp-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addHandoverIntake(entry);
        UI.toast(result && result.queued ? 'Submitted — offline, will sync once back online.' : 'Submitted to CSSD for sterilization');
        this._renderSubmit();
      } catch (err) { UI.toast('Could not submit: ' + err.message, true); }
    });
  },

  // ---------------- RELEASING OF ITEMS (verify receipt) ----------------
  async _renderRelease() {
    this._shell(`${this._sessionBar()}<div id="dp-release-list">Loading…</div>`);
    this._wireSessionBar();
    const wrap = document.getElementById('dp-release-list');
    try {
      const dept = this._session.department;
      const rows = await DB.listReleasedForDepartment(dept);
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state">Nothing released and waiting for verification right now.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;">
          <div style="white-space:pre-line;font-weight:700;">${UI.escapeHtml(r.load_contents) || '(no items listed)'}</div>
          <div class="hint" style="margin-top:4px;">Released ${UI.fmtDateTime(r.released_at)} by ${UI.escapeHtml(r.released_by_name)}</div>
          <button class="btn btn-sm btn-primary" data-verify="${r.id}" style="margin-top:10px;">Verify Received</button>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-verify]').forEach(btn => btn.addEventListener('click', () => this._openVerifyModal(rows.find(r => r.id === btn.dataset.verify))));
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  _openVerifyModal(row) {
    const modal = UI.showModal(`
      <h3>Verify Received</h3>
      <div class="modal-desc" style="white-space:pre-line;">${UI.escapeHtml(row.load_contents) || '(no items listed)'}</div>
      <div class="field" style="margin:14px 0;"><label>Remarks <span class="hint">optional — note any pending items or issues</span></label><textarea id="dp-verify-remarks"></textarea></div>
      <div class="field" style="margin-bottom:14px;">
        <label>Confirm with your PIN</label>
        <div class="pin-dots" id="dp-verify-dots"><span></span><span></span><span></span><span></span></div>
        <div class="pin-pad" id="dp-verify-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" class="pin-key" data-key="${n}">${n}</button>`).join('')}
          <button type="button" class="pin-key func" data-key="back">←</button>
          <button type="button" class="pin-key" data-key="0">0</button>
          <button type="button" class="pin-key func" data-key="clear">C</button>
        </div>
      </div>
      <div id="dp-verify-error" class="hint" style="color:var(--red);min-height:16px;"></div>
      <div class="modal-actions"><button class="btn" id="dp-verify-cancel">Cancel</button></div>
    `);
    modal.querySelector('#dp-verify-cancel').addEventListener('click', () => UI.closeModal());
    let buf = '';
    const dots = () => modal.querySelectorAll('#dp-verify-dots span').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
    modal.querySelectorAll('#dp-verify-pad .pin-key').forEach(k => k.addEventListener('click', async () => {
      const key = k.dataset.key;
      if (key === 'clear') { buf = ''; dots(); return; }
      if (key === 'back') { buf = buf.slice(0, -1); dots(); return; }
      if (buf.length >= 4) return;
      buf += key;
      dots();
      if (buf.length === 4) {
        try {
          const fresh = await DB.listDepartmentAccounts(this._session.department);
          const me = fresh.find(a => a.id === this._session.id);
          if (!me || me.pin !== buf) {
            document.getElementById('dp-verify-error').textContent = 'Incorrect PIN — try again.';
            buf = ''; dots();
            return;
          }
          const result = await DB.verifyHandoverReceived(row.id, {
            status: 'Received',
            received_verified_by_id: this._session.id,
            received_verified_by_name: this._session.name,
            received_verified_at: new Date().toISOString(),
            receipt_remarks: document.getElementById('dp-verify-remarks').value || null
          });
          UI.writeResultToast(result, 'Receipt verified');
          UI.closeModal();
          this._renderRelease();
        } catch (e) {
          document.getElementById('dp-verify-error').textContent = 'Could not verify: ' + e.message;
          buf = ''; dots();
        }
      }
    }));
  }
};

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

  show() {
    this._stopVerifyWatcher();
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-public-dashboard').classList.add('hidden');
    document.getElementById('view-main').classList.add('hidden');
    document.getElementById('view-handover-submit').classList.remove('hidden');
    this._session = null;
    this._renderLogin();
  },
  hide() {
    this._stopVerifyWatcher();
    document.getElementById('view-handover-submit').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    this._session = null;
    Auth.renderLogin();
  },

  _shell(inner) {
    const el = document.getElementById('view-handover-submit');
    el.style.cssText = 'width:100%;min-height:100vh;display:flex;align-items:center;justify-content:center;';
    const titles = { submit: 'Submit Items for Sterilization', release: 'Releasing of Items' };
    el.innerHTML = `
      <div style="max-width:560px;width:100%;margin:0 auto;padding:40px 20px 60px;">
        <button class="btn" id="dp-back">← Back</button>
        <div class="login-brand" style="margin:20px 0;">
          <div class="mark">C</div>
          <div class="title">${titles[this._mode] || 'Instrument/Supplies Handover'}</div>
          <div class="subtitle">Tebow CURE Children's Hospital — CSSD</div>
        </div>
        ${inner}
      </div>
    `;
    // "Back" means different things depending on where you actually are:
    // still logged out -> leave the portal entirely; logged in but on
    // the dashboard itself -> logging out is the only sensible "back"
    // from there too; logged in and inside Submit/Release -> return to
    // the dashboard, NOT re-prompt for a PIN.
    document.getElementById('dp-back').addEventListener('click', () => {
      if (this._session && this._mode) this._renderDashboard();
      else this.hide();
    });
  },

  // ---------------- LOGIN / REGISTER ----------------
  async _renderLogin() {
    this._shell(`<div class="card card-pad" id="dp-login-card">Loading…</div>`);
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
      <div class="pin-dots" id="dp-pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>
      <div class="pin-pad" id="dp-pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <button class="pin-key func" data-key="back">←</button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key func" data-key="clear">C</button>
      </div>
      <div id="dp-pin-error" class="hint" style="color:var(--red);min-height:16px;margin-top:8px;text-align:center;"></div>
    `;
    let buf = '';
    const dots = () => card.querySelectorAll('#dp-pin-dots .pin-dot').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
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
          this._renderDashboard();
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
      <div class="pin-dots" id="dp-pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>
      <div class="pin-pad" id="dp-pin-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <button class="pin-key func" data-key="back">←</button>
        <button class="pin-key" data-key="0">0</button>
        <button class="pin-key func" data-key="clear">C</button>
      </div>
      <div id="dp-pin-error" class="hint" style="color:var(--red);min-height:16px;margin-top:8px;text-align:center;"></div>
    `;
    let buf = '';
    const dots = () => card.querySelectorAll('#dp-pin-dots .pin-dot').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
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
        this._renderDashboard();
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

  _renderItemsList(items) {
    if (!items || items.length === 0) return '(no items listed)';
    return items.map(it => `${UI.escapeHtml(it.name)} <span class="hint">× ${it.qty}</span>`).join('<br>');
  },

  _openVerifyRemainingModal(handoverId, itemId) {
    const modal = UI.showModal(`
      <h3>Verify Remaining</h3>
      <div class="modal-desc">How much of the released remainder did you actually receive? Can't exceed what CSSD released this round.</div>
      <div id="vr-qty-wrap" style="margin:14px 0;"></div>
      <div id="vr-error" class="hint" style="color:var(--red);min-height:16px;margin-bottom:8px;"></div>
      <div class="modal-actions">
        <button class="btn" id="vr-cancel">Cancel</button>
        <button class="btn btn-primary" id="vr-confirm">Confirm</button>
      </div>
    `);
    (async () => {
      try {
        const rows = await DB.listPendingBalanceForDepartment(this._session.department);
        const handover = rows.find(r => r.id === handoverId);
        const item = handover && (handover.load_contents || []).find(it => it.id === itemId);
        if (!item) { document.getElementById('vr-qty-wrap').innerHTML = `<div class="hint">Couldn't find this item — try refreshing.</div>`; return; }
        document.getElementById('vr-qty-wrap').innerHTML = `
          <div class="field"><label>${UI.escapeHtml(item.name)} <span class="hint">(released ${item.reverify_qty})</span></label>
            <input type="number" id="vr-qty" min="0" max="${item.reverify_qty}" value="${item.reverify_qty}">
          </div>
        `;
        document.getElementById('vr-qty').addEventListener('input', (e) => {
          const max = item.reverify_qty;
          if (parseInt(e.target.value, 10) > max) e.target.value = max;
          if (e.target.value !== '' && parseInt(e.target.value, 10) < 0) e.target.value = 0;
        });
        document.getElementById('vr-confirm').addEventListener('click', async () => {
          const confirmedQty = parseInt(document.getElementById('vr-qty').value, 10) || 0;
          try {
            const updatedItems = handover.load_contents.map(it => it.id !== itemId ? it : {
              ...it,
              received_qty: (it.received_qty ?? 0) + confirmedQty,
              awaiting_reverification: false,
              reverify_qty: null,
              // Still short after this round — reset cssd_action back to
              // null so it correctly reappears in CSSD's "awaiting review"
              // bucket for another pass, rather than disappearing from
              // every bucket (cssd_action would otherwise still read
              // 'resolved' from the round that just finished).
              cssd_action: ((it.received_qty ?? 0) + confirmedQty) < it.qty ? null : it.cssd_action,
              cssd_remarks: ((it.received_qty ?? 0) + confirmedQty) < it.qty ? null : it.cssd_remarks
            });
            const stillShort = updatedItems.some(it => (it.received_qty ?? it.qty) < it.qty && !it.final_status);
            const result = await DB.updateHandoverItems(handoverId, updatedItems, stillShort);
            UI.writeResultToast(result, stillShort ? 'Recorded — still short, back to CSSD for review' : 'Fully received — resolved');
            UI.closeModal();
            this._renderRelease();
          } catch (e) { document.getElementById('vr-error').textContent = 'Could not save: ' + e.message; }
        });
      } catch (e) {
        document.getElementById('vr-qty-wrap').innerHTML = `<div class="hint">Couldn't load — offline or unreachable.</div>`;
      }
    })();
    modal.querySelector('#vr-cancel').addEventListener('click', () => UI.closeModal());
  },

  // ---------------- DASHBOARD — lands here after login, before
  // choosing Submitting or Releasing ----------------
  async _renderDashboard() {
    this._mode = null; // neither chosen yet — _shell() shows the generic title
    this._shell(`
      ${this._sessionBar()}
      <div id="dp-dash-summary" style="margin-bottom:18px;"></div>
      <button class="btn btn-primary" id="dp-nav-submit" style="width:100%;margin-bottom:10px;padding:18px;font-size:15px;">📦 Submit Items for Sterilization</button>
      <button class="btn" id="dp-nav-release" style="width:100%;padding:18px;font-size:15px;">📤 Releasing of Items</button>
    `);
    this._wireSessionBar();
    document.getElementById('dp-nav-submit').addEventListener('click', () => { this._mode = 'submit'; this._enterPortal(); });
    document.getElementById('dp-nav-release').addEventListener('click', () => { this._mode = 'release'; this._enterPortal(); });
    this._loadDashboardSummary();
  },

  async _loadDashboardSummary() {
    const wrap = document.getElementById('dp-dash-summary');
    if (!wrap) return; // navigated away before this resolved
    const dept = this._session.department;
    try {
      const [processing, release, balance, discrepancies] = await Promise.all([
        DB.listProcessingForDepartment(dept),
        DB.listReleasedForDepartment(dept),
        DB.listPendingBalanceForDepartment(dept),
        DB.listIntakeDiscrepanciesForDepartment(dept)
      ]);
      const unnotifiedDiscrepancies = discrepancies.filter(r => !r.intake_discrepancy_notified_at).length;
      const stat = (n, label, urgent) => `<div class="card card-pad" style="text-align:center;${urgent && n > 0 ? 'border-left:3px solid var(--red);' : ''}"><div style="font-size:22px;font-weight:800;">${n}</div><div class="hint">${label}</div></div>`;
      wrap.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          ${stat(processing.length, 'Being processed by CSSD')}
          ${stat(release.length, 'Ready to verify')}
          ${stat(balance.length, 'Pending balance')}
          ${stat(unnotifiedDiscrepancies, 'New intake discrepancy notices', true)}
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div class="hint">Couldn't load summary.</div>`;
    }
  },

  // ---------------- LOGGED IN — dispatch to submit or release ----------------
  _enterPortal() {
    if (this._mode === 'release') this._renderRelease();
    else this._renderSubmit();
  },

  _sessionBar() {
    const deptLabel = this._session.department === 'Other' ? (this._session.department_other || 'Other') : this._session.department;
    return `
      <div class="hint" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span>${UI.escapeHtml(this._session.name)} · ${UI.escapeHtml(deptLabel)}</span>
        <span style="display:flex;gap:10px;">
          ${this._mode ? `<a href="#" id="dp-dashboard-link" style="color:var(--brand);">Dashboard</a>` : ''}
          ${this._mode ? `<a href="#" id="dp-switch" style="color:var(--brand);">${this._mode === 'release' ? 'Submit items instead' : 'Verify released items instead'}</a>` : ''}
          <a href="#" id="dp-logout" style="color:var(--red);">Log out</a>
        </span>
      </div>
    `;
  },
  _wireSessionBar() {
    if (this._mode) {
      document.getElementById('dp-dashboard-link').addEventListener('click', (e) => { e.preventDefault(); this._renderDashboard(); });
      document.getElementById('dp-switch').addEventListener('click', (e) => { e.preventDefault(); this._mode = this._mode === 'release' ? 'submit' : 'release'; this._enterPortal(); });
    }
    document.getElementById('dp-logout').addEventListener('click', (e) => { e.preventDefault(); this.hide(); });
  },

  // ---------------- SUBMIT ----------------
  _renderSubmit() {
    this._stopVerifyWatcher();
    this._shell(`
      ${this._sessionBar()}
      <div class="section-title" style="margin-top:0;">Intake Discrepancy Notifications</div>
      <div id="dp-intake-disc-list">Loading…</div>
      <div class="card card-pad">
        <form id="hsp-form">
          <div class="field field-full" style="margin-bottom:8px;"><label>Items being submitted</label></div>
          <div id="hsp-items"></div>
          <button type="button" class="btn btn-sm" id="hsp-add-item" style="margin:8px 0 16px;">+ Add item</button>
          <div class="field field-full"><label>Remarks <span class="hint">optional</span></label><textarea id="hsp-remarks"></textarea></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="hsp-submit" style="width:100%;padding:14px;font-size:14px;">Submit for Sterilization</button>
          </div>
        </form>
      </div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-top:16px;text-align:center;">The date and time are recorded automatically the moment you submit.</div>
    `);
    this._wireSessionBar();
    this._itemRowCount = 0;
    document.getElementById('hsp-add-item').addEventListener('click', () => this._addItemRow());
    this._addItemRow(); // start with one row
    document.getElementById('hsp-form').addEventListener('submit', (e) => this._submit(e));

    // Items live in dynamically-added rows with no name/id (just classes),
    // and the row count itself varies — the generic field scan can't
    // handle that alone, so items are captured as one explicit block via
    // getExtra/setExtra. A single attach() is enough: its 'input' listener
    // is on the form itself, so it also catches events bubbling up from
    // rows added later — no need to re-attach per row or per keystroke.
    FormDraft.attach(document.getElementById('hsp-form'), 'hsp-submit-form', {
      getExtra: () => ({
        items: Array.from(document.querySelectorAll('#hsp-items > div')).map(row => ({
          name: row.querySelector('.hsp-item-name').value,
          qty: row.querySelector('.hsp-item-qty').value
        })),
        remarks: document.getElementById('hsp-remarks').value
      }),
      setExtra: (extra) => {
        if (!extra || !extra.items || extra.items.length === 0) return;
        document.getElementById('hsp-items').innerHTML = '';
        this._itemRowCount = 0;
        extra.items.forEach(it => {
          this._addItemRow();
          const row = document.getElementById(`hsp-item-${this._itemRowCount}`);
          row.querySelector('.hsp-item-name').value = it.name || '';
          row.querySelector('.hsp-item-qty').value = it.qty || 1;
        });
        document.getElementById('hsp-remarks').value = extra.remarks || '';
      }
    });

    this._loadIntakeDiscrepancies();
  },

  async _loadIntakeDiscrepancies() {
    const wrap = document.getElementById('dp-intake-disc-list');
    try {
      const rows = await DB.listIntakeDiscrepanciesForDepartment(this._session.department);
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:14px;">No intake discrepancy notifications.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => {
        const shortItems = (r.load_contents || []).filter(it => (it.intake_qty || 0) < it.qty);
        return `
        <div class="card card-pad" style="margin-bottom:10px;border-left:3px solid var(--red);">
          <div class="hint">Submitted ${UI.fmtDateTime(r.received_at)} · notified ${UI.fmtDateTime(r.intake_discrepancy_notified_at)}</div>
          <ul style="margin:8px 0 0 18px;">
            ${shortItems.map(it => `<li>${UI.escapeHtml(it.name)} — submitted ${it.qty}, CSSD received ${it.intake_qty || 0}${it.intake_remarks ? ` — "${UI.escapeHtml(it.intake_remarks)}"` : ''}</li>`).join('')}
          </ul>
        </div>
      `;
      }).join('');
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
    }
  },

  _addItemRow() {
    this._itemRowCount++;
    const id = `hsp-item-${this._itemRowCount}`;
    const wrap = document.getElementById('hsp-items');
    const row = document.createElement('div');
    row.className = 'form-grid';
    row.id = id;
    row.style.cssText = 'grid-template-columns:2fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;';
    row.innerHTML = `
      <div class="field" style="margin-bottom:0;"><label class="hint">Item</label><input type="text" class="hsp-item-name" placeholder="e.g. Minor Surgery Set" required></div>
      <div class="field" style="margin-bottom:0;"><label class="hint">Qty</label><input type="number" class="hsp-item-qty" min="1" step="1" value="1" required></div>
      <button type="button" class="btn btn-sm" data-remove-row="${id}" style="margin-bottom:1px;">✕</button>
    `;
    wrap.appendChild(row);
    row.querySelector('[data-remove-row]').addEventListener('click', () => {
      if (wrap.children.length > 1) row.remove(); // always keep at least one row
    });
  },

  async _submit(e) {
    e.preventDefault();
    const items = Array.from(document.querySelectorAll('#hsp-items > div')).map((row, i) => ({
      id: `item-${i + 1}`,
      name: row.querySelector('.hsp-item-name').value.trim(),
      qty: parseInt(row.querySelector('.hsp-item-qty').value, 10) || 1
    })).filter(it => it.name);
    if (items.length === 0) { UI.toast('Add at least one item', true); return; }
    const entry = {
      department: this._session.department,
      department_other: this._session.department_other,
      submitted_by_id: this._session.id,
      submitted_by_name: this._session.name,
      load_contents: items,
      remarks: document.getElementById('hsp-remarks').value || null,
      status: 'Processing'
    };
    const btn = document.getElementById('hsp-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addHandoverIntake(entry);
        FormDraft.clear('hsp-submit-form');
        this._showSubmitConfirmation(result, items);
      } catch (err) { UI.toast('Could not submit: ' + err.message, true); }
    });
  },

  _showSubmitConfirmation(result, items) {
    const offline = result && result.queued;
    const modal = UI.showModal(`
      <h3 style="color:var(--green);">✓ Submitted</h3>
      <div class="modal-desc">${offline
        ? `${items.length} item${items.length === 1 ? '' : 's'} saved on this device — will sync to CSSD automatically once you're back online.`
        : `${items.length} item${items.length === 1 ? '' : 's'} sent to CSSD for sterilization.`}</div>
      <div class="modal-actions"><button class="btn btn-primary" id="hsp-confirm-home">Go back to Home</button></div>
    `);
    modal.querySelector('#hsp-confirm-home').addEventListener('click', () => { UI.closeModal(); this.hide(); });
  },

  // ---------------- RELEASING OF ITEMS (verify receipt) ----------------
  async _renderRelease() {
    this._shell(`${this._sessionBar()}
      <div id="dp-wide-dashboard">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="dp-wide-submit-link">+ Submit Items for Sterilization</button>
          <input type="text" id="dp-wide-search" placeholder="Search reference #, item..." style="flex:1;min-width:200px;">
          <select id="dp-wide-status-filter">
            <option value="">All statuses</option>
            <option value="Submitted">Submitted — awaiting CSSD</option>
            <option value="Late">Late</option>
            <option value="Ready to Verify">Ready to Verify</option>
            <option value="Pending Balance">Pending Balance</option>
            <option value="Received">Received</option>
          </select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Ref #</th><th>Submitted</th><th></th><th>Status</th></tr></thead>
          <tbody id="dp-wide-tbody"><tr><td colspan="4" class="empty-state">Loading…</td></tr></tbody>
        </table></div>
        <div id="dp-wide-pagination" style="margin-top:12px;"></div>
      </div>

      <div id="dp-narrow-sections">
      <div class="section-title" style="margin-top:0;">Pending — being processed by CSSD</div>
      <div id="dp-processing-list">Loading…</div>
      <div class="section-title">Late Release <span class="hint" style="font-weight:400;">past CSSD's 3-day turnaround target</span></div>
      <div id="dp-late-list">Loading…</div>
      <div class="section-title">Ready for release — verify received</div>
      <div id="dp-release-list">Loading…</div>
      <div class="section-title">Pending Balance</div>
      <div id="dp-balance-list">Loading…</div>
      <div class="section-title">Recent releases</div>
      <div id="dp-recent-list">Loading…</div>
      </div>
    `);
    this._wireSessionBar();
    document.getElementById('dp-wide-submit-link').addEventListener('click', () => { this._mode = 'submit'; this._enterPortal(); });
    document.getElementById('dp-wide-search').addEventListener('input', () => this._renderWideRelease());
    document.getElementById('dp-wide-status-filter').addEventListener('change', () => this._renderWideRelease());
    const dept = this._session.department;
    this._loadWideRelease();

    try {
      const processing = await DB.listProcessingForDepartment(dept);
      const onTime = processing.filter(r => !HandoverView.isLateRelease(r));
      const late = processing.filter(r => HandoverView.isLateRelease(r));
      const cardHtml = r => `
          <div class="card card-pad" style="margin-bottom:10px;">
            <div style="font-weight:700;">${this._renderItemsList(r.load_contents)}</div>
            <div class="hint" style="margin-top:4px;">Submitted ${UI.fmtDateTime(r.received_at)}</div>
          </div>
        `;
      document.getElementById('dp-processing-list').innerHTML = onTime.length === 0
        ? `<div class="card card-pad empty-state" style="padding:14px;">Nothing currently being processed.</div>`
        : onTime.map(cardHtml).join('');
      document.getElementById('dp-late-list').innerHTML = late.length === 0
        ? `<div class="card card-pad empty-state" style="padding:14px;">Nothing past the turnaround target.</div>`
        : late.map(cardHtml).join('');
    } catch (e) {
      document.getElementById('dp-processing-list').innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
      document.getElementById('dp-late-list').innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
    }

    const wrap = document.getElementById('dp-release-list');
    try {
      const rows = await DB.listReleasedForDepartment(dept);
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state">Nothing released and waiting for verification right now.</div>`;
      } else {
        wrap.innerHTML = rows.map(r => `
          <div class="card card-pad pending-highlight" style="margin-bottom:10px;">
            <div style="font-weight:700;">${this._renderItemsList(r.load_contents)}</div>
            <div class="hint" style="margin-top:4px;">Released ${UI.fmtDateTime(r.released_at)} by ${UI.escapeHtml(r.released_by_name)}</div>
            <button class="btn btn-sm btn-primary" data-verify="${r.id}" style="margin-top:10px;">Verify Received</button>
          </div>
        `).join('');
        wrap.querySelectorAll('[data-verify]').forEach(btn => btn.addEventListener('click', () => this._openVerifyModal(rows.find(r => r.id === btn.dataset.verify))));
      }
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }

    const bWrap = document.getElementById('dp-balance-list');
    try {
      const balanceRows = await DB.listPendingBalanceForDepartment(dept);
      if (balanceRows.length === 0) {
        bWrap.innerHTML = `<div class="card card-pad empty-state" style="padding:14px;">No outstanding balances.</div>`;
      } else {
        bWrap.innerHTML = balanceRows.map(r => {
          const short = (r.load_contents || []).filter(it => (it.received_qty ?? it.qty) < it.qty && !it.final_status);
          return `
            <div class="card card-pad pending-highlight" style="margin-bottom:10px;">
              <div class="hint" style="margin-bottom:6px;">${UI.escapeHtml(r.serial_number)} · verified ${UI.fmtDateTime(r.received_verified_at)}</div>
              ${short.map(it => `
                <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                  <div>
                    <strong>${UI.escapeHtml(it.name)}</strong> — received ${it.received_qty} of ${it.qty}
                    ${it.awaiting_reverification ? `<span class="badge badge-open" style="margin-left:6px;">${it.reverify_qty} released — verify receipt</span>`
                      : it.cssd_action === 'unresolved' ? `<span class="badge badge-fail" style="margin-left:6px;">CSSD: Unresolved — awaiting final review</span>`
                      : `<span class="badge badge-open" style="margin-left:6px;">Awaiting CSSD review</span>`}
                  </div>
                  ${it.awaiting_reverification ? `<button class="btn btn-sm btn-primary" data-verify-remaining="${r.id}|${it.id}">Verify Remaining</button>` : ''}
                </div>
              `).join('')}
            </div>
          `;
        }).join('');
        bWrap.querySelectorAll('[data-verify-remaining]').forEach(btn => {
          const [handoverId, itemId] = btn.dataset.verifyRemaining.split('|');
          btn.addEventListener('click', () => this._openVerifyRemainingModal(handoverId, itemId));
        });
      }
    } catch (e) {
      bWrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
    }

    const rWrap = document.getElementById('dp-recent-list');
    try {
      const recent = await DB.listReceivedForDepartment(dept);
      if (recent.length === 0) {
        rWrap.innerHTML = `<div class="card card-pad empty-state" style="padding:14px;">Nothing received yet.</div>`;
      } else {
        rWrap.innerHTML = recent.map(r => {
          const isComplete = !r.has_pending_balance;
          return `
            <div class="card card-pad" style="margin-bottom:10px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div>
                  <strong>${UI.escapeHtml(r.serial_number)}</strong>
                  <span class="badge ${isComplete ? 'badge-pass' : 'badge-open'}" style="margin-left:6px;">${isComplete ? 'Complete' : 'Has Pending Balance'}</span>
                  <div class="hint" style="margin-top:4px;">Verified ${UI.fmtDateTime(r.received_verified_at)}</div>
                </div>
                <button class="btn btn-sm" data-recent-toggle="${r.id}">Details ▸</button>
              </div>
              <div id="dp-recent-detail-${r.id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
                ${(r.load_contents || []).map(it => `
                  <div style="margin-bottom:8px;">
                    <strong>${UI.escapeHtml(it.name)}</strong> — submitted ${it.qty}, received ${it.received_qty ?? '—'}
                    ${it.cssd_action ? `<div class="hint">CSSD: ${it.cssd_action} by ${UI.escapeHtml(it.cssd_action_by)} at ${UI.fmtDateTime(it.cssd_action_at)}${it.cssd_remarks ? ' — ' + UI.escapeHtml(it.cssd_remarks) : ''}</div>` : ''}
                    ${it.final_status ? `<div class="hint">Final: ${it.final_status} by ${UI.escapeHtml(it.final_by)} at ${UI.fmtDateTime(it.final_at)}${it.final_remarks ? ' — ' + UI.escapeHtml(it.final_remarks) : ''}</div>` : ''}
                  </div>
                `).join('')}
                <div class="hint">Submitted ${UI.fmtDateTime(r.received_at)} · Released ${UI.fmtDateTime(r.released_at)} by ${UI.escapeHtml(r.released_by_name) || '—'}</div>
              </div>
            </div>
          `;
        }).join('');
        rWrap.querySelectorAll('[data-recent-toggle]').forEach(btn => {
          btn.addEventListener('click', () => {
            const target = document.getElementById(`dp-recent-detail-${btn.dataset.recentToggle}`);
            const isHidden = target.style.display === 'none';
            target.style.display = isHidden ? 'block' : 'none';
            btn.textContent = isHidden ? 'Details ▾' : 'Details ▸';
          });
        });
      }
    } catch (e) {
      rWrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
    }

    // Deliberately page-specific, not global like every other alarm in
    // this app — only ever runs while this exact department is
    // actively viewing their own Releasing of Items screen, so it can
    // never sound for, or leak into, a different department on the
    // same shared device.
    this._startVerifyWatcher(dept);
  },

  // ---------------- WIDE-SCREEN CONSOLIDATED DASHBOARD (>860px) ----------------
  async _loadWideRelease(page = 'default') {
    this._widePage = page;
    const dept = this._session.department;
    const to = UI.todayStr();
    let from;
    if (page === 'default') from = UI.daysAgoStr(21);
    else if (page === 'expanded') from = UI.daysAgoStr(90);
    else from = UI.daysAgoStr(90 * page);
    const windowTo = (typeof page === 'number') ? UI.daysAgoStr(90 * (page - 1)) : to;
    const tbody = document.getElementById('dp-wide-tbody');
    try {
      const rows = await DB.listHandoversForDepartment(dept, { from, to: windowTo, limit: 2000 });
      rows.forEach(r => { r._itemsSearchText = (r.load_contents || []).map(it => it.name).join(' '); });
      this._wideRows = rows;
      this._renderWideRelease();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Couldn't load: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  // Department's own view of what a status means — different from
  // CSSD's, since the department's actionable moments are Verify
  // Received and Verify Remaining, not intake confirmation or release.
  _computeWideStatusBadges(r) {
    const badges = [];
    if (r.status === 'Processing') {
      badges.push({ label: 'Submitted', tone: 'neutral' });
      if (HandoverView.isLateRelease(r)) badges.push({ label: 'Late', tone: 'danger' });
    } else if (r.status === 'Released') {
      badges.push({ label: 'Ready to Verify', tone: 'accent', actionKey: 'verify' });
    } else { // Received
      if (r.has_pending_balance) {
        const hasActionable = (r.load_contents || []).some(it => it.awaiting_reverification);
        badges.push({ label: 'Pending Balance', tone: 'danger', actionKey: hasActionable ? 'balance' : null });
      } else {
        badges.push({ label: 'Received', tone: 'success' });
      }
    }
    return badges;
  },

  _renderWideRelease() {
    const tbody = document.getElementById('dp-wide-tbody');
    const search = (document.getElementById('dp-wide-search').value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('dp-wide-status-filter').value;
    const rows = this._wideRows.filter(r => {
      const badges = this._computeWideStatusBadges(r);
      if (statusFilter && !badges.some(b => b.label === statusFilter)) return false;
      if (!search) return true;
      return `${r.serial_number} ${r._itemsSearchText}`.toLowerCase().includes(search);
    });
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No handovers match.</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td>${UI.fmtDateTime(r.received_at)}</td>
          <td><button class="btn btn-sm" data-wide-print="${r.id}">Print</button></td>
          <td>
            ${this._computeWideStatusBadges(r).map(b => `<span class="badge ${b.tone === 'danger' ? 'badge-fail' : b.tone === 'success' ? 'badge-pass' : 'badge-neutral'}" style="margin-right:4px;">${UI.escapeHtml(b.label)}</span>`).join('')}
            <button class="btn btn-sm" style="background:none;border:none;color:var(--brand);" data-wide-quickedit="${r.id}">Quick edit ▸</button>
          </td>
        </tr>
        <tr id="dp-wide-qe-${r.id}" style="display:none;"><td colspan="4" style="padding:0;background:var(--surface-sunken);"></td></tr>
      `).join('');
      tbody.querySelectorAll('[data-wide-print]').forEach(btn => btn.addEventListener('click', () => HandoverView._printHandover(rows.find(r => r.id === btn.dataset.widePrint))));
      tbody.querySelectorAll('[data-wide-quickedit]').forEach(btn => btn.addEventListener('click', () => this._toggleWideQuickEdit(btn, rows.find(r => r.id === btn.dataset.wideQuickedit))));
    }
    const pWrap = document.getElementById('dp-wide-pagination');
    if (this._widePage === 'default') {
      pWrap.innerHTML = `<button class="btn btn-sm" id="dp-wide-seeall">See all — last 3 months</button>`;
      document.getElementById('dp-wide-seeall').addEventListener('click', () => this._loadWideRelease('expanded'));
    } else {
      const pageNum = typeof this._widePage === 'number' ? this._widePage : 1;
      pWrap.innerHTML = `
        <button class="btn btn-sm" id="dp-wide-newer">${pageNum <= 1 ? 'Back to last 3 months' : 'Newer 3 months'}</button>
        <button class="btn btn-sm" id="dp-wide-older" style="margin-left:8px;">Older 3 months</button>
      `;
      document.getElementById('dp-wide-newer').addEventListener('click', () => this._loadWideRelease(pageNum <= 1 ? 'expanded' : pageNum));
      document.getElementById('dp-wide-older').addEventListener('click', () => this._loadWideRelease(pageNum + 1));
    }
  },

  _toggleWideQuickEdit(btn, r) {
    const row = document.getElementById(`dp-wide-qe-${r.id}`);
    const isHidden = row.style.display === 'none';
    row.style.display = isHidden ? 'table-row' : 'none';
    btn.textContent = isHidden ? 'Quick edit ▾' : 'Quick edit ▸';
    if (!isHidden) return;
    const td = row.querySelector('td');
    const badges = this._computeWideStatusBadges(r);
    const primary = badges.find(b => b.actionKey);
    if (primary && primary.actionKey === 'verify') {
      td.innerHTML = `<div style="padding:14px 18px;"><div style="margin-bottom:8px;">${this._renderItemsList(r.load_contents)}</div><button class="btn btn-sm btn-primary" id="qe-verify">Verify Received</button></div>`;
      document.getElementById('qe-verify').addEventListener('click', () => this._openVerifyModal(r));
    } else if (primary && primary.actionKey === 'balance') {
      const short = (r.load_contents || []).filter(it => (it.received_qty ?? it.qty) < it.qty && !it.final_status);
      td.innerHTML = `<div style="padding:14px 18px;">${short.map(it => `
        <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div><strong>${UI.escapeHtml(it.name)}</strong> — received ${it.received_qty} of ${it.qty}
          ${it.awaiting_reverification ? `<span class="badge badge-worn" style="margin-left:6px;">${it.reverify_qty} released — verify receipt</span>`
            : it.cssd_action === 'unresolved' ? `<span class="badge badge-fail" style="margin-left:6px;">CSSD: Unresolved</span>`
            : `<span class="badge badge-neutral" style="margin-left:6px;">Awaiting CSSD review</span>`}</div>
          ${it.awaiting_reverification ? `<button class="btn btn-sm btn-primary" data-qe-verify-remaining="${it.id}">Verify Remaining</button>` : ''}
        </div>`).join('')}</div>`;
      td.querySelectorAll('[data-qe-verify-remaining]').forEach(b => b.addEventListener('click', () => this._openVerifyRemainingModal(r.id, b.dataset.qeVerifyRemaining)));
    } else {
      td.innerHTML = `<div style="padding:14px 18px;">${this._renderItemsList(r.load_contents)}</div>`;
    }
  },

  // ---------------- VERIFY-BY-END-OF-DAY ALARM (this device, this
  // department's session only — never global, never cross-department) ----
  _startVerifyWatcher(dept) {
    this._stopVerifyWatcher(); // clear any prior interval first, never stack
    this._verifyInterval = setInterval(() => this._tickVerifyAlarms(dept), 60000);
    this._tickVerifyAlarms(dept);
  },

  // Called from every place this view is left — switching to Submit
  // mode, logging out, or going back to the login screen entirely —
  // so a leftover interval (and any alarm it's actively sounding)
  // can never carry over to a different department logging in next
  // on the same shared device.
  _stopVerifyWatcher() {
    if (this._verifyInterval) { clearInterval(this._verifyInterval); this._verifyInterval = null; }
    Alarm.activeKeys().forEach(key => {
      if (key.startsWith('dept-verify-')) { Alarm.stop(key); Alarm.removeBox(key); }
    });
  },

  async _tickVerifyAlarms(dept) {
    try {
      const rows = await DB.listReleasedForDepartment(dept);
      const stillRelevant = new Set();
      rows.forEach(r => {
        if (!r.released_at) return;
        const releasedDate = new Date(r.released_at);
        // Deadline is 5pm LOCAL on the day it was released — for
        // anything released on an earlier day still sitting
        // unverified, that deadline has obviously already passed.
        const deadline = new Date(releasedDate.getFullYear(), releasedDate.getMonth(), releasedDate.getDate(), 17, 0, 0);
        if (TrueTime.now().getTime() < deadline.getTime()) return;
        const key = `dept-verify-${r.id}`;
        stillRelevant.add(key);
        if (Alarm.isLocallyMuted(key)) { Alarm.stop(key); return; }
        Alarm.start(key, `${this._renderItemsList(r.load_contents).replace(/<[^>]+>/g, ' ')} — released by CSSD, still needs your verification`, 'Verify Receipt');
        Alarm.showBox(key, 'Verify Receipt', `Released ${UI.fmtDateTime(r.released_at)} — past today's verification target`, () => {});
      });
      Alarm.activeKeys().forEach(key => {
        if (key.startsWith('dept-verify-') && !stillRelevant.has(key)) { Alarm.stop(key); Alarm.removeBox(key); }
      });
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  _openVerifyModal(row) {
    const items = row.load_contents || [];
    const modal = UI.showModal(`
      <h3>Verify Received</h3>
      <div class="modal-desc">Enter what was actually received for each item — can't exceed what was submitted.</div>
      <div style="margin:14px 0;">
        ${items.map((it, i) => `
          <div class="form-grid" style="grid-template-columns:2fr 1fr;gap:8px;align-items:end;margin-bottom:6px;">
            <div class="field" style="margin-bottom:0;"><label class="hint">${UI.escapeHtml(it.name)} <span style="color:var(--ink-soft);">(submitted ${it.qty})</span></label>
              <input type="number" class="dp-verify-qty" data-item="${i}" min="0" max="${it.qty}" value="${it.qty}">
            </div>
            <div class="field" style="margin-bottom:0;"><label class="hint">Remarks</label><input type="text" class="dp-verify-item-remarks" data-item="${i}" placeholder="optional"></div>
          </div>
        `).join('')}
      </div>
      <div id="dp-verify-qty-error" class="hint" style="color:var(--red);min-height:16px;margin-bottom:8px;"></div>
      <div class="field" style="margin-bottom:14px;">
        <label>Confirm with your PIN</label>
        <div class="pin-dots" id="dp-verify-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>
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
    // Qty inputs can't exceed what was submitted — clamp on the way in,
    // not just via the max attribute (some mobile keyboards ignore it).
    modal.querySelectorAll('.dp-verify-qty').forEach(inp => inp.addEventListener('input', () => {
      const max = parseInt(inp.getAttribute('max'), 10);
      if (parseInt(inp.value, 10) > max) inp.value = max;
      if (inp.value !== '' && parseInt(inp.value, 10) < 0) inp.value = 0;
    }));
    modal.querySelector('#dp-verify-cancel').addEventListener('click', () => UI.closeModal());
    let buf = '';
    const dots = () => modal.querySelectorAll('#dp-verify-dots .pin-dot').forEach((d, i) => d.classList.toggle('filled', i < buf.length));
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
          const updatedItems = items.map((it, i) => {
            const receivedQty = parseInt(modal.querySelector(`.dp-verify-qty[data-item="${i}"]`).value, 10) || 0;
            const itemRemarks = modal.querySelector(`.dp-verify-item-remarks[data-item="${i}"]`).value || null;
            return { ...it, received_qty: receivedQty, verify_remarks: itemRemarks };
          });
          const hasPendingBalance = updatedItems.some(it => it.received_qty < it.qty);
          const result = await DB.verifyHandoverReceived(row.id, {
            status: 'Received',
            received_verified_by_id: this._session.id,
            received_verified_by_name: this._session.name,
            received_verified_at: TrueTime.nowISO(),
            load_contents: updatedItems,
            has_pending_balance: hasPendingBalance
          });
          UI.writeResultToast(result, hasPendingBalance ? 'Receipt verified — some items short, added to Pending Balance' : 'Receipt verified — all items accounted for');
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

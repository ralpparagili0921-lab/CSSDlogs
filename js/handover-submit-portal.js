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
    el.style.cssText = 'width:100%;min-height:100vh;display:flex;align-items:center;justify-content:center;';
    el.innerHTML = `
      <div style="max-width:560px;width:100%;margin:0 auto;padding:40px 20px 60px;">
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
      <div class="section-title" style="margin-top:0;">Pending — being processed by CSSD</div>
      <div id="dp-processing-list">Loading…</div>
      <div class="section-title">Ready for release — verify received</div>
      <div id="dp-release-list">Loading…</div>
      <div class="section-title">Pending Balance</div>
      <div id="dp-balance-list">Loading…</div>
      <div class="section-title">Recent releases</div>
      <div id="dp-recent-list">Loading…</div>
    `);
    this._wireSessionBar();
    const dept = this._session.department;

    try {
      const processing = await DB.listProcessingForDepartment(dept);
      const pWrap = document.getElementById('dp-processing-list');
      pWrap.innerHTML = processing.length === 0
        ? `<div class="card card-pad empty-state" style="padding:14px;">Nothing currently being processed.</div>`
        : processing.map(r => `
          <div class="card card-pad" style="margin-bottom:10px;">
            <div style="font-weight:700;">${this._renderItemsList(r.load_contents)}</div>
            <div class="hint" style="margin-top:4px;">Submitted ${UI.fmtDateTime(r.received_at)}</div>
          </div>
        `).join('');
    } catch (e) {
      document.getElementById('dp-processing-list').innerHTML = `<div class="card card-pad empty-state">Couldn't load.</div>`;
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

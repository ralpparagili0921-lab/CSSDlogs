// ============================================================
// AUTH — kiosk login. New accounts start on a shared default PIN;
// the first time someone logs in with it, the app offers to let
// them set a personal PIN and two security questions (used later
// for self-service PIN recovery). All state lives in memory only
// (no sessionStorage/localStorage), so a shared workstation returns
// to the login screen on refresh.
// ============================================================

const DEFAULT_PIN = '0000';

const SECURITY_QUESTIONS = [
  'Name of your first employer',
  'City where you were born',
  'Name of your favorite teacher',
  'Your childhood nickname',
  'Name of your first pet'
];

const Auth = {
  currentStaff: null,
  _allStaff: [],
  _selectedStaff: null,
  _pinBuffer: '',
  _pinMode: 'login',       // 'login' | 'authorize'
  _authorizedSuperuser: null,
  _newPin1: '',

  async init() {
    return false; // always start at login on load/refresh
  },

  card() { return document.getElementById('login-card'); },

  // ---------------- HOME SCREEN ----------------
  async renderLogin() {
    this._pinBuffer = '';
    this._selectedStaff = null;
    const card = this.card();
    card.className = 'login-card login-card-wide';
    card.innerHTML = `
      <div class="login-brand">
        <div class="mark">C</div>
        <div class="title">CSSD Digital Logbooks</div>
        <div class="subtitle">Tebow CURE Children's Hospital</div>
      </div>
      <button id="btn-handover-submit" style="width:100%;margin:18px 0 10px;padding:20px 18px;border:none;border-radius:var(--radius);background:var(--brand);color:#fff;font-weight:800;font-size:16px;cursor:pointer;box-shadow:var(--shadow);">📦 Submit Instrument/Supplies for Sterilization<div style="font-weight:500;font-size:12.5px;opacity:.85;margin-top:4px;">For ER, OPD, OR, and Ward staff</div></button>
      <button id="btn-handover-release" style="width:100%;margin-bottom:18px;padding:16px 18px;border:none;border-radius:var(--radius);background:var(--green);color:#fff;font-weight:800;font-size:15px;cursor:pointer;box-shadow:var(--shadow);">📤 Releasing of Items<div style="font-weight:500;font-size:12.5px;opacity:.85;margin-top:4px;">Verify items released by CSSD</div></button>
      <div style="border-top:1px solid var(--line);margin-bottom:18px;"></div>
      <div class="login-two-col">
        <div class="login-col-attn">
          <div class="login-col-head">⚠ Needs attention</div>
          <div id="missed-logs-banner"><div class="empty-note">Checking…</div></div>
        </div>
        <div class="login-col-names">
          <div class="pin-label">Who's logging in?</div>
          <div class="staff-grid" id="staff-grid"><div style="grid-column:1/-1;font-size:12.5px;color:var(--ink-soft);">Loading staff…</div></div>
          <button class="btn btn-sm" id="btn-create-account" style="width:100%;margin-top:16px;">+ Create a new account</button>
          <button id="btn-public-dashboard" style="width:100%;margin-top:10px;padding:12px 16px;border:none;border-radius:var(--radius-sm);background:var(--honey);color:var(--ink);font-weight:700;font-size:13.5px;cursor:pointer;">📊 View Compliance Dashboard <span style="font-weight:500;opacity:.75;">— no login needed</span></button>
        </div>
      </div>
      <div class="dev-credit" style="color:var(--ink-soft);">Developed by <a href="https://ralpparagili.org" target="_blank" rel="noopener" style="color:var(--brand);">Ralp Paragili</a></div>
    `;
    document.getElementById('btn-create-account').addEventListener('click', () => this.renderCreateAuthorize());
    document.getElementById('btn-public-dashboard').addEventListener('click', () => PublicDashboard.show());
    document.getElementById('btn-handover-submit').addEventListener('click', () => DepartmentPortal.show('submit'));
    document.getElementById('btn-handover-release').addEventListener('click', () => DepartmentPortal.show('release'));

    try {
      this._allStaff = await DB.listActiveStaff();
    } catch (e) {
      document.getElementById('staff-grid').innerHTML = `<div style="grid-column:1/-1;font-size:12.5px;color:var(--red);">Couldn't reach the database. Check your connection, or the app isn't configured yet (js/config.js).</div>`;
      return;
    }
    const grid = document.getElementById('staff-grid');
    if (this._allStaff.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;font-size:12.5px;color:var(--ink-soft);">No staff accounts yet — use "Create a new account" below.</div>`;
    } else {
      grid.innerHTML = this._allStaff.map(s => `<button class="staff-btn" data-id="${s.id}">${UI.escapeHtml(s.name)}${s.shift_start ? `<div style="font-size:10.5px;font-weight:500;opacity:.75;margin-top:2px;">${s.shift_start.slice(0,5)}–${(s.shift_end||'').slice(0,5)}</div>` : ''}</button>`).join('');
      grid.querySelectorAll('.staff-btn').forEach(btn => btn.addEventListener('click', () => this._selectStaffForLogin(btn.dataset.id)));
    }

    this._renderMissedLogsBanner();
  },

  async _renderMissedLogsBanner() {
    const el = document.getElementById('missed-logs-banner');
    if (!el) return;
    try {
      const items = await MissedLogs.compute();
      if (items.length === 0) {
        el.innerHTML = `<div class="empty-note">Nothing outstanding — every logbook is up to date.</div>`;
        return;
      }
      el.innerHTML = items.map(i => `
        <div class="missed-row">
          <span>${UI.escapeHtml(i.message)}</span>
          ${i.assigned ? `<span class="assigned">${UI.escapeHtml(i.assigned)}</span>` : ''}
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = `<div class="empty-note">Couldn't check right now.</div>`;
    }
  },

  _selectStaffForLogin(id) {
    this._selectedStaff = this._allStaff.find(s => s.id === id);
    if (!this._selectedStaff) return;
    this._pinMode = 'login';
    this.renderPinScreen();
  },

  // ---------------- PIN SCREEN (shared by login + authorize) ----------------
  renderPinScreen() {
    this._pinBuffer = '';
    const card = this.card();
    card.className = 'login-card';
    const isAuthorize = this._pinMode === 'authorize';
    const s = this._selectedStaff;
    const onDefault = !isAuthorize && !s.pin_changed;
    card.innerHTML = `
      <div class="login-brand">
        <div class="mark">C</div>
        <div class="title">${isAuthorize ? 'Authorize account creation' : 'CSSD Digital Logbooks'}</div>
      </div>
      <div class="pin-stage">
        <div class="pin-label">Enter PIN for <strong>${UI.escapeHtml(s.name)}</strong></div>
        ${onDefault ? `<div class="default-pin-hint">Default PIN is <strong>${DEFAULT_PIN}</strong> — you'll be asked to set your own after entering it.</div>` : ''}
        <div class="pin-dots" id="pin-dots">
          <div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div>
        </div>
        <div class="pin-pad" id="pin-pad">
          <button class="pin-key" data-k="1">1</button><button class="pin-key" data-k="2">2</button><button class="pin-key" data-k="3">3</button>
          <button class="pin-key" data-k="4">4</button><button class="pin-key" data-k="5">5</button><button class="pin-key" data-k="6">6</button>
          <button class="pin-key" data-k="7">7</button><button class="pin-key" data-k="8">8</button><button class="pin-key" data-k="9">9</button>
          <button class="pin-key func" data-k="clear">Clear</button><button class="pin-key" data-k="0">0</button><button class="pin-key func" data-k="back">⌫</button>
        </div>
        <div class="login-error" id="login-error"></div>
        ${!isAuthorize && s.pin_changed ? `<button class="login-back" id="btn-forgot-pin">Forgot your PIN?</button><br>` : ''}
        <button class="login-back" id="btn-back-to-names">← choose a different name</button>
      </div>
    `;
    document.getElementById('pin-pad').addEventListener('click', (e) => {
      const btn = e.target.closest('.pin-key');
      if (btn) this._pressKey(btn.dataset.k);
    });
    document.getElementById('btn-back-to-names').addEventListener('click', () => {
      if (isAuthorize) this.renderCreateAuthorize(); else this.renderLogin();
    });
    if (!isAuthorize && s.pin_changed) {
      document.getElementById('btn-forgot-pin').addEventListener('click', () => this.renderForgotVerify());
    }
    this._bindKeyboard();
  },

  _renderDots() {
    document.querySelectorAll('.pin-dot').forEach((d, i) => d.classList.toggle('filled', i < this._pinBuffer.length));
  },

  async _pressKey(k) {
    const errEl = document.getElementById('login-error');
    if (k === 'clear') { this._pinBuffer = ''; this._renderDots(); if (errEl) errEl.textContent = ''; return; }
    if (k === 'back') { this._pinBuffer = this._pinBuffer.slice(0, -1); this._renderDots(); return; }
    if (this._pinBuffer.length >= 4) return;
    this._pinBuffer += k;
    this._renderDots();
    if (this._pinBuffer.length === 4) {
      const s = this._selectedStaff;
      if (this._pinBuffer === s.pin) {
        if (this._pinMode === 'authorize') {
          this._authorizedSuperuser = s;
          this.renderCreateForm();
        } else if (!s.pin_changed) {
          this.renderOfferSetPin();
        } else {
          this.currentStaff = { id: s.id, name: s.name, role: s.role };
          App.enterMain();
        }
      } else {
        if (errEl) errEl.textContent = 'Incorrect PIN. Try again.';
        this._pinBuffer = '';
        this._renderDots();
      }
    }
  },

  _bindKeyboard() {
    document.onkeydown = (e) => {
      const pinVisible = document.getElementById('pin-pad');
      if (!pinVisible) return;
      if (/^[0-9]$/.test(e.key)) this._pressKey(e.key);
      if (e.key === 'Backspace') this._pressKey('back');
      if (e.key === 'Escape') this._pressKey('clear');
    };
  },

  // ---------------- OFFER TO SET A PERSONAL PIN (first login on default) ----------------
  renderOfferSetPin() {
    document.onkeydown = null;
    const card = this.card();
    const s = this._selectedStaff;
    card.innerHTML = `
      <div class="login-brand"><div class="mark">C</div><div class="title">You're using the default PIN</div></div>
      <div class="pin-label" style="margin-bottom:16px;">For security, set a personal 4-digit PIN now, ${UI.escapeHtml(s.name)}. You can skip and keep using ${DEFAULT_PIN} for now — you'll be asked again next time.</div>
      <div class="form-actions" style="justify-content:center;">
        <button class="btn" id="offer-skip">Skip for now</button>
        <button class="btn btn-primary" id="offer-setpin">Set personal PIN</button>
      </div>
    `;
    document.getElementById('offer-skip').addEventListener('click', () => {
      this.currentStaff = { id: s.id, name: s.name, role: s.role };
      App.enterMain();
    });
    document.getElementById('offer-setpin').addEventListener('click', () => this.renderSetPinStage(1, 'onboard'));
  },

  // ---------------- SET-PIN STAGES (shared by first-login onboarding + forgot-PIN recovery) ----------------
  renderSetPinStage(stage, mode) {
    this._pinBuffer = '';
    const card = this.card();
    const s = this._selectedStaff;
    card.innerHTML = `
      <div class="login-brand"><div class="mark">C</div><div class="title">${stage === 1 ? 'Enter new PIN' : 'Confirm new PIN'}</div></div>
      <div class="pin-stage">
        <div class="pin-label"><strong>${UI.escapeHtml(s.name)}</strong></div>
        <div class="pin-dots" id="pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>
        <div class="pin-pad" id="pin-pad">
          <button class="pin-key" data-k="1">1</button><button class="pin-key" data-k="2">2</button><button class="pin-key" data-k="3">3</button>
          <button class="pin-key" data-k="4">4</button><button class="pin-key" data-k="5">5</button><button class="pin-key" data-k="6">6</button>
          <button class="pin-key" data-k="7">7</button><button class="pin-key" data-k="8">8</button><button class="pin-key" data-k="9">9</button>
          <button class="pin-key func" data-k="clear">Clear</button><button class="pin-key" data-k="0">0</button><button class="pin-key func" data-k="back">⌫</button>
        </div>
        <div class="login-error" id="login-error"></div>
      </div>
    `;
    document.getElementById('pin-pad').addEventListener('click', (e) => {
      const btn = e.target.closest('.pin-key');
      if (btn) this._pressSetPinKey(btn.dataset.k, stage, mode);
    });
    this._bindKeyboard();
    document.onkeydown = (e) => {
      if (/^[0-9]$/.test(e.key)) this._pressSetPinKey(e.key, stage, mode);
      if (e.key === 'Backspace') this._pressSetPinKey('back', stage, mode);
      if (e.key === 'Escape') this._pressSetPinKey('clear', stage, mode);
    };
  },

  _pressSetPinKey(k, stage, mode) {
    const errEl = document.getElementById('login-error');
    if (k === 'clear') { this._pinBuffer = ''; this._renderDots(); if (errEl) errEl.textContent = ''; return; }
    if (k === 'back') { this._pinBuffer = this._pinBuffer.slice(0, -1); this._renderDots(); return; }
    if (this._pinBuffer.length >= 4) return;
    this._pinBuffer += k;
    this._renderDots();
    if (this._pinBuffer.length === 4) {
      if (stage === 1) {
        this._newPin1 = this._pinBuffer;
        this.renderSetPinStage(2, mode);
      } else {
        if (this._pinBuffer === this._newPin1) {
          const s = this._selectedStaff;
          const confirmedPin = this._pinBuffer;
          DB.isPinTaken(confirmedPin, s.id).then(taken => {
            if (taken) {
              if (errEl) errEl.textContent = 'That PIN is already in use — pick a different one.';
              this._newPin1 = '';
              setTimeout(() => this.renderSetPinStage(1, mode), 1200);
              return;
            }
            if (mode === 'onboard') this.renderSetQuestions();
            else this._saveRecoveredPin(confirmedPin);
          }).catch(() => {
            // offline or check failed — don't block onboarding/recovery over this
            if (mode === 'onboard') this.renderSetQuestions();
            else this._saveRecoveredPin(confirmedPin);
          });
        } else {
          if (errEl) errEl.textContent = "PINs don't match — start over.";
          this._newPin1 = '';
          setTimeout(() => this.renderSetPinStage(1, mode), 900);
        }
      }
    }
  },

  async _saveRecoveredPin(pin) {
    const s = this._selectedStaff;
    try {
      await DB.updateStaff(s.id, { pin });
      UI.toast('PIN updated — you can log in now');
      this.renderLogin();
    } catch (e) {
      UI.toast('Could not save: ' + e.message, true);
      this.renderLogin();
    }
  },

  // ---------------- SET TWO SECURITY QUESTIONS (onboarding, first personalized PIN) ----------------
  renderSetQuestions() {
    document.onkeydown = null;
    const card = this.card();
    const s = this._selectedStaff;
    card.innerHTML = `
      <div class="login-brand"><div class="mark">C</div><div class="title">Set security questions</div><div class="subtitle">Used only to recover your PIN later</div></div>
      <div style="text-align:left;">
        ${[1, 2].map(n => `
          <div class="field" style="margin-bottom:10px;">
            <label>Security question ${n}</label>
            <select id="sq-${n}">
              <option value="">Select a question…</option>
              ${SECURITY_QUESTIONS.map(q => `<option value="${UI.escapeHtml(q)}">${UI.escapeHtml(q)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin-bottom:14px;">
            <label>Answer</label>
            <input type="text" id="sa-${n}" autocomplete="off">
          </div>
        `).join('')}
      </div>
      <div class="login-error" id="sq-error"></div>
      <div class="form-actions" style="justify-content:center;">
        <button class="btn btn-primary" id="sq-save">Save &amp; continue</button>
      </div>
    `;
    const sq1 = document.getElementById('sq-1');
    const sq2 = document.getElementById('sq-2');
    const syncQuestionOptions = () => {
      [[sq1, sq2], [sq2, sq1]].forEach(([self, other]) => {
        const otherVal = other.value;
        Array.from(self.options).forEach(opt => {
          opt.hidden = !!opt.value && opt.value === otherVal;
        });
      });
    };
    sq1.addEventListener('change', syncQuestionOptions);
    sq2.addEventListener('change', syncQuestionOptions);

    document.getElementById('sq-save').addEventListener('click', async () => {
      const q1 = document.getElementById('sq-1').value;
      const a1v = document.getElementById('sa-1').value.trim();
      const q2 = document.getElementById('sq-2').value;
      const a2v = document.getElementById('sa-2').value.trim();
      const errEl = document.getElementById('sq-error');
      if (!q1 || !a1v || !q2 || !a2v) { errEl.textContent = 'Answer both security questions to continue.'; return; }
      if (q1 === q2) { errEl.textContent = 'Choose two different questions.'; return; }
      try {
        await DB.updateStaff(s.id, {
          pin: this._newPin1, pin_changed: true,
          security_question_1: q1, security_answer_1: a1v.toLowerCase(),
          security_question_2: q2, security_answer_2: a2v.toLowerCase()
        });
        this.currentStaff = { id: s.id, name: s.name, role: s.role };
        UI.toast('PIN and security questions saved');
        App.enterMain();
      } catch (e) { errEl.textContent = 'Could not save: ' + e.message; }
    });
  },

  // ---------------- FORGOT PIN (two-question recovery) ----------------
  renderForgotVerify() {
    const card = this.card();
    const s = this._selectedStaff;
    if (!s.security_question_1 || !s.security_question_2) {
      card.innerHTML = `
        <div class="login-brand"><div class="mark">C</div><div class="title">No security questions on file</div></div>
        <div class="pin-label" style="margin-bottom:16px;">${UI.escapeHtml(s.name)} doesn't have recovery questions set up. Ask a superuser to reset the PIN in Manage Staff &amp; Settings.</div>
        <button class="btn" id="back-to-names" style="width:100%;">← Back</button>
      `;
      document.getElementById('back-to-names').addEventListener('click', () => this.renderLogin());
      return;
    }
    card.innerHTML = `
      <div class="login-brand"><div class="mark">C</div><div class="title">Recover PIN — ${UI.escapeHtml(s.name)}</div></div>
      <div style="text-align:left;">
        <div class="field" style="margin-bottom:12px;">
          <label>${UI.escapeHtml(s.security_question_1)}</label>
          <input type="text" id="forgot-answer-1" autocomplete="off">
        </div>
        <div class="field" style="margin-bottom:14px;">
          <label>${UI.escapeHtml(s.security_question_2)}</label>
          <input type="text" id="forgot-answer-2" autocomplete="off">
        </div>
      </div>
      <div class="login-error" id="forgot-error"></div>
      <div class="form-actions" style="justify-content:center;">
        <button class="btn" id="forgot-cancel">Cancel</button>
        <button class="btn btn-primary" id="forgot-submit">Verify</button>
      </div>
    `;
    document.getElementById('forgot-cancel').addEventListener('click', () => this.renderLogin());
    document.getElementById('forgot-submit').addEventListener('click', () => {
      const a1 = document.getElementById('forgot-answer-1').value.trim().toLowerCase();
      const a2 = document.getElementById('forgot-answer-2').value.trim().toLowerCase();
      if (a1 && a2 && a1 === (s.security_answer_1 || '').toLowerCase() && a2 === (s.security_answer_2 || '').toLowerCase()) {
        this.renderSetPinStage(1, 'recover');
      } else {
        document.getElementById('forgot-error').textContent = "Those answers don't match — try again.";
      }
    });
  },

  // ---------------- CREATE ACCOUNT ----------------
  async renderCreateAuthorize() {
    const card = this.card();
    card.className = 'login-card';
    card.innerHTML = `
      <div class="login-brand"><div class="mark">C</div><div class="title">Create a new account</div><div class="subtitle">A superuser needs to authorize this</div></div>
      <div class="pin-label">Which superuser is authorizing?</div>
      <div class="staff-grid" id="su-grid"><div style="grid-column:1/-1;font-size:12.5px;color:var(--ink-soft);">Loading…</div></div>
      <button class="login-back" id="cancel-create" style="margin-top:16px;">← Back to login</button>
    `;
    document.getElementById('cancel-create').addEventListener('click', () => this.renderLogin());
    try {
      const supers = await DB.listSuperusers();
      const grid = document.getElementById('su-grid');
      if (supers.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;font-size:12.5px;color:var(--red);">No superuser accounts exist yet.</div>`;
        return;
      }
      grid.innerHTML = supers.map(s => `<button class="staff-btn" data-id="${s.id}">${UI.escapeHtml(s.name)}</button>`).join('');
      grid.querySelectorAll('.staff-btn').forEach(btn => btn.addEventListener('click', () => {
        this._selectedStaff = supers.find(s => s.id === btn.dataset.id);
        this._pinMode = 'authorize';
        this.renderPinScreen();
      }));
    } catch (e) {
      document.getElementById('su-grid').innerHTML = `<div style="grid-column:1/-1;font-size:12.5px;color:var(--red);">Couldn't load superusers.</div>`;
    }
  },

  renderCreateForm() {
    const card = this.card();
    card.innerHTML = `
      <div class="login-brand"><div class="mark">C</div><div class="title">New account</div><div class="subtitle">Authorized by ${UI.escapeHtml(this._authorizedSuperuser.name)}</div></div>
      <div style="text-align:left;">
        <div class="field" style="margin-bottom:10px;"><label>Full name</label><input type="text" id="na-name"></div>
        <div class="field" style="margin-bottom:10px;"><label>Job title (optional)</label><input type="text" id="na-title" placeholder="e.g. SPD Tech"></div>
        <div class="field" style="margin-bottom:10px;"><label>Role</label>
          <select id="na-role">
            <option value="user">User — logbook data entry only</option>
            <option value="admin">Admin — + dashboard &amp; KPI reports</option>
            <option value="superuser">Superuser — full access</option>
          </select>
        </div>
        <div class="form-grid" style="margin-bottom:4px;">
          <div class="field"><label>Shift start <span class="hint">optional</span></label><input type="time" id="na-shift-start"></div>
          <div class="field"><label>Shift end <span class="hint">optional</span></label><input type="time" id="na-shift-end"></div>
        </div>
        <div class="default-pin-hint" style="margin-top:4px;">The new account starts on the default PIN (${DEFAULT_PIN}) — they'll set their own PIN and security questions the first time they log in.</div>
      </div>
      <div class="login-error" id="na-error"></div>
      <div class="form-actions" style="justify-content:center;">
        <button class="btn" id="na-cancel">Cancel</button>
        <button class="btn btn-primary" id="na-save">Create account</button>
      </div>
    `;
    document.getElementById('na-cancel').addEventListener('click', () => this.renderLogin());
    document.getElementById('na-save').addEventListener('click', async () => {
      const name = document.getElementById('na-name').value.trim();
      const job_title = document.getElementById('na-title').value.trim() || null;
      const role = document.getElementById('na-role').value;
      const shift_start = document.getElementById('na-shift-start').value || null;
      const shift_end = document.getElementById('na-shift-end').value || null;
      const errEl = document.getElementById('na-error');
      if (!name) { errEl.textContent = 'Enter a name.'; return; }
      try {
        await DB.addStaff({ name, job_title, role, pin: DEFAULT_PIN, pin_changed: false, shift_start, shift_end });
        UI.toast(`Account created for ${name} (default PIN ${DEFAULT_PIN})`);
        this.renderLogin();
      } catch (e) { errEl.textContent = 'Could not save: ' + e.message; }
    });
  },

  logout() {
    this.currentStaff = null;
    document.onkeydown = null;
    location.reload();
  },

  bindEvents() {
    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
  }
};

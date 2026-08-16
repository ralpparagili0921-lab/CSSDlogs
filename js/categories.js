// ============================================================
// CATEGORIES — the screen everyone lands on after logging in.
// Three category cards group the six logbooks; clicking one reveals
// its logbooks as tiles. Also shows the logged-in user's personal
// compliance panel (only for logbooks they're the default assignee
// for — shared logbooks aren't individually tracked).
// ============================================================

const CATEGORIES = [
  {
    key: 'autoclave',
    title: 'Autoclave Maintenance',
    desc: 'Equipment reliability & QA validation',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    items: ['equipment', 'qa']
  },
  {
    key: 'sterilization',
    title: 'Sterilization Logs',
    desc: 'Cycle records & instrument care',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 1 1 3 6.3"/><path d="M4 20v-5h5"/></svg>',
    items: ['cycles', 'instrument']
  },
  {
    key: 'water',
    title: 'Water & Cleaning',
    desc: 'RO water quality & brush inspection',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c3 4 6 7.5 6 11.5A6 6 0 1 1 6 13.5C6 9.5 9 6 12 2Z"/></svg>',
    items: ['ro', 'brush']
  },
  {
    key: 'handover',
    title: 'Instrument/Supplies Handover',
    desc: 'Intake & release',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l4 4-4 4"/><path d="M20 7H8a4 4 0 0 0-4 4v1"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h12a4 4 0 0 0 4-4v-1"/></svg>',
    items: ['handover']
  },
  {
    key: 'facility',
    title: 'Facility & Housekeeping',
    desc: 'Temperature/humidity & cleaning checklists',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18"/><path d="M10 4 4 10c-1 4 2 10 6 10s7-6 6-10l-2-2"/></svg>',
    items: ['temp-humidity', 'housekeeping']
  }
];

const LOGBOOK_META = {
  ro: { label: 'RO Water Quality', view: 'ro' },
  equipment: { label: 'Equipment Downtime', view: 'equipment' },
  cycles: { label: 'Sterilization Cycle Log', view: 'cycles' },
  qa: { label: 'QA Testing Log', view: 'qa' },
  brush: { label: 'Cleaning Brush', view: 'brush' },
  instrument: { label: 'Instrument Maintenance', view: 'instruments' },
  handover: { label: 'Instrument/Supplies Handover', view: 'handover' },
  'temp-humidity': { label: 'Temperature & Humidity', view: 'temp-humidity' },
  housekeeping: { label: 'CSSD Housekeeping', view: 'housekeeping' }
};

const CategoriesView = {
  _openCategory: null,

  async render() {
    const el = document.getElementById('view-categories');
    const role = Auth.currentStaff.role;
    if (window.innerWidth <= 860 && (role === 'user' || role === 'admin')) {
      this._renderMobileBento(el, role);
      return;
    }
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Welcome</div>
          <h1>Hi, ${UI.escapeHtml(Auth.currentStaff.name)}</h1>
          <div class="desc">Pick a category to get started.</div>
        </div>
      </div>

      <div id="bi-due-panel"></div>
      <div id="compliance-panel"></div>

      <div class="kpi-grid" id="category-cards"></div>
      <div id="category-tiles"></div>
    `;
    this._renderCards();
    this._renderCompliancePanel();
    this._renderBiDuePanel();
  },

  async _renderBiDuePanel() {
    const wrap = document.getElementById('bi-due-panel');
    try {
      const incubating = await DB.listIncubatingBiTests();
      const due = incubating.map(r => ({ row: r, due: QaTestingView.computeBiDue(r) })).filter(x => x.due.computable && x.due.isOverdue);
      if (due.length === 0) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = `
        <div class="card card-pad" style="margin-bottom:22px;border-color:rgba(196,67,46,0.35);">
          <div style="font-size:12px;color:var(--red);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">BI tests due for result</div>
          ${due.map(x => `
            <button class="btn btn-sm" data-bi-machine="${x.row.machine_id}" style="display:block;width:100%;text-align:left;margin-bottom:6px;">
              ${UI.escapeHtml(x.row.machine_id)} — incubated since ${UI.fmtDateTime(x.row.bi_incubation_date + 'T' + x.row.bi_time_in_incubator)}
            </button>
          `).join('')}
        </div>
      `;
      wrap.querySelectorAll('[data-bi-machine]').forEach(btn => btn.addEventListener('click', () => {
        App.pendingQaMachine = btn.dataset.biMachine;
        App.navigate('qa');
      }));
    } catch (e) {
      wrap.innerHTML = '';
    }
  },

  _renderCards() {
    const wrap = document.getElementById('category-cards');
    wrap.innerHTML = CATEGORIES.map(c => `
      <button class="card card-pad category-card" data-cat="${c.key}" style="text-align:left;cursor:pointer;display:flex;gap:14px;align-items:flex-start;">
        <div class="category-icon">${c.icon}</div>
        <div>
          <strong style="font-size:15px;">${c.title}</strong>
          <div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${c.desc}</div>
        </div>
      </button>
    `).join('');
    wrap.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
      this._openCategory = this._openCategory === btn.dataset.cat ? null : btn.dataset.cat;
      this._renderTiles();
      wrap.querySelectorAll('.category-card').forEach(c => c.classList.toggle('active', c.dataset.cat === this._openCategory));
    }));
  },

  _renderTiles() {
    const wrap = document.getElementById('category-tiles');
    if (!this._openCategory) { wrap.innerHTML = ''; return; }
    const cat = CATEGORIES.find(c => c.key === this._openCategory);
    wrap.innerHTML = `
      <div class="section-title">${cat.title}</div>
      <div class="kpi-grid">
        ${cat.items.map(k => `
          <button class="card card-pad" data-goto="${LOGBOOK_META[k].view}" style="text-align:left;cursor:pointer;">
            <strong>${LOGBOOK_META[k].label} →</strong>
          </button>
        `).join('')}
      </div>
    `;
    wrap.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => App.navigate(btn.dataset.goto)));
  },

  async _renderCompliancePanel() {
    const wrap = document.getElementById('compliance-panel');
    wrap.innerHTML = `<div class="card card-pad empty-state">Checking your logbooks…</div>`;
    try {
      const result = await MissedLogs.computePersonal(Auth.currentStaff.id, 30);
      if (result.totalExpected === 0) {
        wrap.innerHTML = '';
        return;
      }
      const color = result.compliancePct >= 90 ? 'var(--green)' : result.compliancePct >= 75 ? 'var(--amber)' : 'var(--red)';
      wrap.innerHTML = `
        <div class="card card-pad" style="margin-bottom:22px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:10px;">
            <div>
              <div style="font-size:12px;color:var(--ink-soft);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Your compliance — last 30 working days</div>
              <div style="font-family:var(--font-mono);font-size:26px;font-weight:600;color:${color};margin-top:4px;">${result.compliancePct}%</div>
              <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">${result.totalLogged} of ${result.totalExpected} logged</div>
            </div>
          </div>
          ${result.missed.length > 0 ? `
            <div style="font-size:12px;color:var(--ink-soft);margin:10px 0 8px;">Click a date to log it now — remember, late entries reflect on performance evaluation.</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${result.missed.slice(0, 12).map(m => `<button class="chip-missed" data-fix-date="${m.date}" data-fix-logbook="${m.logbook}" data-fix-machine="${m.machineId || ''}">${UI.fmtDate(m.date)} · ${m.label}</button>`).join('')}
            </div>
            ${result.missed.length > 12 ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:6px;">+ ${result.missed.length - 12} more</div>` : ''}
          ` : `<div style="font-size:12.5px;color:var(--green);font-weight:600;">Fully caught up — nice work.</div>`}
        </div>
      `;
      wrap.querySelectorAll('[data-fix-date]').forEach(btn => btn.addEventListener('click', () => {
        this._openRetroModal(btn.dataset.fixDate, btn.dataset.fixLogbook, btn.dataset.fixMachine || null);
      }));
    } catch (e) {
      wrap.innerHTML = '';
    }
  },

  // ---------------- Retrospective entry popup (backlog item #6) ----------------
  // Opens as a floating modal over whatever's currently on screen — it never
  // navigates by itself, so an in-progress form elsewhere is never lost.
  // Navigation only happens if the user explicitly picks Late Entry Log.
  _openRetroModal(dateStr, logbook, machineId) {
    const meta = LOGBOOK_META[logbook];
    const modal = UI.showModal(`
      <h3>Missed log — ${UI.fmtDate(dateStr)}</h3>
      <div class="modal-desc">${UI.escapeHtml(meta.label)}${machineId ? ` — ${UI.escapeHtml(machineId)}` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
        <button class="btn btn-primary" id="retro-late" style="justify-content:flex-start;">Late Entry Log <span class="hint" style="margin-left:auto;font-weight:400;">Log it now, dated ${UI.fmtDate(dateStr)}</span></button>
        <button class="btn" id="retro-closure" style="justify-content:flex-start;">Mark as Closure/Exception <span class="hint" style="margin-left:auto;font-weight:400;">Wasn't a working day after all</span></button>
      </div>
      <div class="modal-actions"><button class="btn" id="retro-cancel">Cancel</button></div>
    `);
    modal.querySelector('#retro-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#retro-late').addEventListener('click', () => {
      UI.closeModal();
      App.pendingBackfillDate = dateStr;
      if (machineId) App.pendingQaMachine = machineId;
      App.navigate(meta.view);
    });
    modal.querySelector('#retro-closure').addEventListener('click', () => this._openClosureModal(dateStr, logbook));
  },

  _openClosureModal(dateStr, logbook) {
    const meta = LOGBOOK_META[logbook];
    const isSuperuser = Auth.currentStaff.role === 'superuser';
    const modal = UI.showModal(`
      <h3>Mark as Closure/Exception</h3>
      <div class="modal-desc">${UI.fmtDate(dateStr)} — ${UI.escapeHtml(meta.label)}</div>
      ${!isSuperuser ? `<div class="hint" style="margin-bottom:10px;">This will be submitted to a superuser for approval — it won't remove the date from missed-log counts until approved.</div>` : ''}
      <div class="field" style="margin-bottom:12px;">
        <label>Type</label>
        <select id="retro-ex-type">
          <option>Holiday</option><option>December Break</option><option>Maintenance</option><option>Quarantine Closure</option><option>Other</option>
        </select>
      </div>
      <div class="field">
        <label>Remarks</label>
        <textarea id="retro-ex-remarks" placeholder="Why wasn't this a working day?"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="retro-ex-cancel">Cancel</button>
        <button class="btn btn-primary" id="retro-ex-save">${isSuperuser ? 'Save exception' : 'Submit for approval'}</button>
      </div>
    `);
    modal.querySelector('#retro-ex-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#retro-ex-save').addEventListener('click', async () => {
      const fields = {
        exception_type: modal.querySelector('#retro-ex-type').value,
        date_from: dateStr,
        date_to: dateStr,
        reason: modal.querySelector('#retro-ex-remarks').value || null
      };
      const btn = modal.querySelector('#retro-ex-save');
      await UI.withLoading(btn, async () => {
        try {
          if (isSuperuser) {
            await DB.addException({ ...fields, created_by: Auth.currentStaff.name });
            UI.toast('Exception saved');
          } else {
            await DB.addPendingException({ ...fields, requested_by: Auth.currentStaff.name, requested_by_id: Auth.currentStaff.id });
            UI.toast('Submitted for approval');
          }
          UI.closeModal();
          this._renderCompliancePanel();
        } catch (err) {
          UI.toast('Could not submit: ' + err.message, true);
        }
      });
    });
  },

  // Mobile landing for user/admin — a bento grid of tappable log tiles,
  // sized to fit within the viewport height (no scrolling to see every
  // option), replacing the desktop-oriented category-cards layout.
  _renderMobileBento(el, role) {
    const items = App.mobileItemsForRole(role);
    el.innerHTML = `<div id="mobile-bento-grid">${items.map(it => `
      <button class="bento-tile cat-${it.cat}" data-view="${it.view}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>
        <span>${it.label}</span>
        ${it.badge ? `<span class="bt-dot hidden" id="bt-dot-${it.view}"></span>` : ''}
      </button>
    `).join('')}</div>`;
    el.querySelectorAll('.bento-tile').forEach(btn => btn.addEventListener('click', () => App.navigate(btn.dataset.view)));
    App._syncMobileBadges();
  }
};

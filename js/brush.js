// ============================================================
// CLEANING BRUSH LOGBOOK
// "Register a brush" auto-generates an ID and sets date first used.
// "Brush Log" shows every registered brush as a card with its own
// inline entry fields — log or discard per brush, per day.
// ============================================================

const BrushView = {
  _brushes: [],
  _mode: 'log', // 'log' | 'register'

  async render() {
    const el = document.getElementById('view-brush');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook · TCCH-SPU-PROC-007</div>
          <h1>Cleaning Brush Log</h1>
          <div class="desc">Weekly inspection compliance is the KPI — but log as often as you check a brush.</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" id="btn-mode-register">+ Register a brush</button>
        </div>
      </div>
      <div id="brush-content"></div>
    `;
    document.getElementById('btn-mode-register').addEventListener('click', () => this._registerModal());
    this._renderContent();
  },

  async _renderContent() {
    const wrap = document.getElementById('brush-content');
    wrap.innerHTML = `<div class="empty-state">Loading brushes…</div>`;
    try {
      this._brushes = await DB.listActiveBrushes();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load brushes: ${UI.escapeHtml(e.message)}</div>`;
      return;
    }
    if (this._brushes.length === 0) {
      wrap.innerHTML = `<div class="card card-pad empty-state">No brushes registered yet. Click "+ Register a brush" to add your first one.</div>`;
      return;
    }

    const weekStart = this._isoWeekStart(new Date());
    let recentLogs = [];
    try { recentLogs = await DB.listBrushLogs({ from: weekStart, to: UI.todayStr(), limit: 500 }); } catch (e) {}
    this._recentLogs = recentLogs;
    const loggedToday = new Set(recentLogs.filter(l => l.log_date === UI.todayStr()).map(l => l.brush_id));
    const loggedThisWeek = new Set(recentLogs.map(l => l.brush_id));

    wrap.innerHTML = `
      <div class="kpi-grid" id="brush-cards">
        ${this._brushes.map(b => this._brushCard(b, loggedToday.has(b.brush_id), loggedThisWeek.has(b.brush_id))).join('')}
      </div>
      <div class="section-title" style="margin-top:22px;display:flex;align-items:center;justify-content:space-between;">
        <span>Recent Entries <span class="hint" id="brush-recent-count" style="font-weight:400;"></span></span>
        <button class="btn btn-sm" id="brush-view-history">View all history →</button>
      </div>
      ${SearchBar.render('brush-search')}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Brush</th><th>Inspected</th><th>Condition</th><th>Replaced</th><th>Logged by</th><th>Remarks</th><th></th></tr></thead>
          <tbody id="brush-tbody"><tr><td colspan="8" class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>

      ${MissedEntriesView.sectionHtml('brush', 'Missed/Late Weeks')}
    `;
    this._brushes.forEach(b => this._bindCard(b));
    document.getElementById('brush-view-history').addEventListener('click', () => App.navigate('brush-history'));
    MissedEntriesView.wire('brush-missed-range', (v) => this._loadMissedEntries(v));
    this._loadRecentTable();
  },

  async _loadRecentTable() {
    const tbody = document.getElementById('brush-tbody');
    try {
      const rows = await DB.listBrushLogs({ from: UI.daysAgoStr(30), to: UI.todayStr(), limit: 200 });
      SearchBar.wire('brush-search', (criteria) => this._renderRecentTable(SearchBar.filter(rows, criteria, 'log_date', ['brush_id', 'condition', 'remarks', 'staff_name'])));
      this._renderRecentTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Couldn't load entries: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  // Brush's compliance is weekly, not daily (any day Mon-Sun counts
  // as on-time) — genuinely different structure from the other 4
  // logbooks, so this doesn't reuse MissedEntriesView.classify()
  // directly. "Late" here means the first inspection that week came
  // after Wednesday 2:30pm (the alarm's own deadline) but the week
  // wasn't otherwise empty; "Missed" means the entire week (through
  // Sunday) passed with nothing logged at all for that brush.
  async _loadMissedEntries(rangeValue) {
    try {
      const to = UI.todayStr();
      const from = rangeValue === 'all' ? ((await WorkCalendar.launchDate()) || UI.daysAgoStr(365)) : UI.daysAgoStr(parseInt(rangeValue, 10));
      const brushes = await DB.listActiveBrushes();
      const rows = await DB.listBrushLogs({ from, to: UI.todayStr(), limit: 5000 });
      const assignments = await DB.listAssignments();
      const { assignedStaff, staffDetails } = MissedEntriesView.staffFor(assignments, 'brush');
      const today = UI.todayStr();
      const now = TrueTime.now();
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const allEntries = [];
      let weekStart = new Date(this._isoWeekStart(new Date(from + 'T00:00:00')) + 'T00:00:00');
      const endDate = new Date(to + 'T00:00:00');
      while (weekStart <= endDate) {
        const weekStartStr = UI.dateToStr(weekStart);
        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
        const weekEndStr = UI.dateToStr(weekEnd);
        for (const b of brushes) {
          const weekRows = rows.filter(r => r.brush_id === b.brush_id && r.log_date >= weekStartStr && r.log_date <= weekEndStr);
          if (weekRows.length > 0) {
            const earliest = weekRows.reduce((min, r) => (r.created_at < min ? r.created_at : min), weekRows[0].created_at);
            const d = new Date(earliest);
            const daysFromMonday = (d.getDay() + 6) % 7; // 0=Mon...6=Sun
            const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const isLate = daysFromMonday > 2 || (daysFromMonday === 2 && hhmm > '14:30'); // 2 = Wednesday
            if (isLate) allEntries.push({
              date: weekStartStr, tag: 'Late', detail: `${b.brush_id} — logged ${UI.fmtDate(earliest.slice(0, 10))} ${UI.fmtTime(earliest)}`,
              assignedStaff, staffDetails,
              onPrint: () => this._printEntry(weekRows.find(r => r.created_at === earliest))
            });
          } else if (weekEndStr < today || (weekEndStr === today && nowHHMM >= '23:30')) {
            allEntries.push({
              date: weekStartStr, tag: 'Missed', detail: `${b.brush_id} — week of ${UI.fmtDate(weekStartStr)}`,
              assignedStaff, staffDetails,
              onPrint: () => MissedEntriesView.printMissedNotice(`Cleaning Brush — ${b.brush_id}`, weekStartStr, assignedStaff)
            });
          }
        }
        weekStart = new Date(weekStart.getTime() + 7 * 86400000);
      }

      MissedEntriesView.render('brush-missed-wrap', 'brush-missed-count', allEntries);
    } catch (e) {
      MissedEntriesView.errorState('brush-missed-wrap', e.message);
    }
  },

  _renderRecentTable(rows, tbodyId = 'brush-tbody', countId = 'brush-recent-count') {
    const tbody = document.getElementById(tbodyId);
    document.getElementById(countId).textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No entries match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${UI.fmtDate(r.log_date)}</td>
        <td><strong>${UI.escapeHtml(r.brush_id)}</strong></td>
        <td><span class="badge ${r.cleaned_inspected ? 'badge-pass' : 'badge-fail'}">${r.cleaned_inspected ? 'Yes' : 'No'}</span></td>
        <td><span class="badge ${r.condition === 'Good' ? 'badge-pass' : r.condition === 'Worn' ? 'badge-worn' : 'badge-fail'}">${r.condition}</span></td>
        <td>${r.replaced ? 'Yes' : 'No'}</td>
        <td>${UI.escapeHtml(r.staff_name)}</td>
        <td>${UI.escapeHtml(r.remarks) || '—'}</td>
        <td><button class="btn btn-sm" data-print="${r.id}">Print</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printEntry(rows.find(r => r.id === btn.dataset.print)));
    });
  },

  _printEntry(r) {
    PrintReport.generate({
      title: 'CLEANING BRUSH LOG REPORT',
      refNumber: `${r.brush_id} — ${UI.fmtDate(r.log_date)}`,
      sections: [{
        heading: 'Entry Details',
        rows: [
          ['Brush', r.brush_id], ['Date', UI.fmtDate(r.log_date)],
          ['Inspected', r.cleaned_inspected ? 'Yes' : 'No'], ['Condition', r.condition],
          ['Replaced', r.replaced ? 'Yes' : 'No'], ['Logged by', r.staff_name], ['Remarks', r.remarks]
        ]
      }]
    });
  },

  _isoWeekStart(d) {
    const dt = new Date(d);
    const day = dt.getDay() || 7;
    if (day !== 1) dt.setDate(dt.getDate() - (day - 1));
    return UI.dateToStr(dt);
  },

  _brushCard(b, loggedToday, loggedThisWeek) {
    const age = UI.daysBetween(b.date_first_used, UI.todayStr());
    return `
      <div class="card card-pad" data-brush-card="${UI.escapeHtml(b.brush_id)}" style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <strong style="font-size:14.5px;">${UI.escapeHtml(b.brush_id)}</strong>
            <div style="font-size:12px;color:var(--ink-soft);">${UI.escapeHtml(b.type) || 'General brush'}</div>
          </div>
          ${loggedToday ? '<span class="badge badge-pass">Logged today</span>' : loggedThisWeek ? '<span class="badge badge-worn">Logged this week</span>' : '<span class="badge badge-damaged">Not logged this week</span>'}
        </div>
        <div style="font-size:11.5px;color:var(--ink-soft);">In service since ${UI.fmtDate(b.date_first_used)} · ${age} day${age === 1 ? '' : 's'} old</div>

        <div class="field">
          <label>Cleaned &amp; inspected?</label>
          <div class="radio-row" data-cleaned-row>
            <button type="button" class="radio-chip active-good" data-val="true">Yes</button>
            <button type="button" class="radio-chip" data-val="false">No</button>
          </div>
        </div>
        <div class="field">
          <label>Condition</label>
          <div class="radio-row" data-condition-row>
            <button type="button" class="radio-chip active-good" data-val="Good">Good</button>
            <button type="button" class="radio-chip" data-val="Worn">Worn</button>
            <button type="button" class="radio-chip" data-val="Damaged">Damaged</button>
          </div>
        </div>
        <div class="field">
          <label>Replace this brush now?</label>
          <div class="radio-row" data-replaced-row>
            <button type="button" class="radio-chip active-good" data-val="false">No</button>
            <button type="button" class="radio-chip" data-val="true">Yes — replace</button>
          </div>
        </div>
        <div class="field">
          <label>Remarks (optional)</label>
          <textarea data-remarks style="min-height:44px;"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-sm" data-discard>Discard</button>
          <button class="btn btn-sm btn-primary" data-save>Save entry</button>
        </div>
      </div>
    `;
  },

  _bindCard(b) {
    const card = document.querySelector(`[data-brush-card="${CSS.escape(b.brush_id)}"]`);
    if (!card) return;
    const state = { cleaned: 'true', condition: 'Good', replaced: 'false' };

    const bindRow = (sel, key, mode) => {
      const row = card.querySelector(sel);
      row.querySelectorAll('.radio-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          row.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
          let cls = 'radio-chip active-good';
          if (mode === 'condition') cls = chip.dataset.val === 'Good' ? 'radio-chip active-good' : chip.dataset.val === 'Worn' ? 'radio-chip active-warn' : 'radio-chip active-bad';
          else if (mode === 'warn') cls = chip.dataset.val === 'true' ? 'radio-chip active-warn' : 'radio-chip active-good';
          else cls = chip.dataset.val === 'true' ? 'radio-chip active-good' : 'radio-chip active-bad';
          chip.className = cls;
          state[key] = chip.dataset.val;
        });
      });
    };
    bindRow('[data-cleaned-row]', 'cleaned', 'good');
    bindRow('[data-condition-row]', 'condition', 'condition');
    bindRow('[data-replaced-row]', 'replaced', 'warn');

    card.querySelector('[data-discard]').addEventListener('click', () => {
      card.querySelectorAll('textarea').forEach(t => t.value = '');
      card.querySelectorAll('.radio-row').forEach(row => row.querySelectorAll('.radio-chip').forEach((c, i) => c.className = i === 0 ? 'radio-chip active-good' : 'radio-chip'));
      state.cleaned = 'true'; state.condition = 'Good'; state.replaced = 'false';
      UI.toast('Entry discarded');
    });

    card.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.target;
      await UI.withLoading(btn, async () => {
        try {
          const existing = (this._recentLogs || []).find(l => l.brush_id === b.brush_id && l.log_date === UI.todayStr());
          if (existing) {
            const proceed = await UI.confirmDuplicate(`${UI.escapeHtml(existing.staff_name)} already logged ${UI.escapeHtml(b.brush_id)} today.`);
            if (!proceed) return;
          }
          const replaced = state.replaced === 'true';
          let anyQueued = false;
          if (replaced) {
            const r1 = await DB.markBrushReplaced(b.brush_id, UI.todayStr());
            if (r1 && r1.queued) anyQueued = true;
          }
          const r2 = await DB.addBrushLog({
            brush_id: b.brush_id,
            log_date: UI.todayStr(),
            cleaned_inspected: state.cleaned === 'true',
            condition: state.condition,
            replaced,
            remarks: card.querySelector('[data-remarks]').value || null,
            staff_id: Auth.currentStaff.id,
            staff_name: Auth.currentStaff.name
          });
          if (r2 && r2.queued) anyQueued = true;
          UI.writeResultToast({ queued: anyQueued }, 'Brush entry saved');
          this._renderContent();
        } catch (err) {
          UI.toast('Could not save: ' + err.message, true);
        }
      });
    });
  },

  _registerModal() {
    const modal = UI.showModal(`
      <h3>Register a new brush</h3>
      <div class="modal-desc">The Brush ID is generated automatically. Today becomes its "date first used."</div>
      <div class="field" style="margin-bottom:12px;">
        <label>Type (optional)</label>
        <input type="text" id="reg-type" placeholder="e.g. cannulated instrument brush">
      </div>
      <div class="modal-actions">
        <button class="btn" id="reg-cancel">Cancel</button>
        <button class="btn btn-primary" id="reg-save">Register</button>
      </div>
    `);
    modal.querySelector('#reg-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#reg-save').addEventListener('click', async () => {
      try {
        const brush_id = await DB.nextBrushId();
        await DB.registerBrush({
          brush_id,
          type: modal.querySelector('#reg-type').value || null,
          date_first_used: UI.todayStr(),
          registered_by: Auth.currentStaff.name
        });
        UI.toast(`Registered ${brush_id}`);
        UI.closeModal();
        this._renderContent();
      } catch (e) {
        UI.toast('Could not register: ' + e.message, true);
      }
    });
  }
};

const BrushHistoryView = {
  async render() {
    const container = document.getElementById('view-brush-history');
    const { tableWrap, setCount } = HistoryView.renderShell({
      container, title: 'Cleaning Brush Log — Full History', backView: 'brush',
      onFilterChange: (filters) => this._load(filters, setCount)
    });
    tableWrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Brush</th><th>Inspected</th><th>Condition</th><th>Replaced</th><th>Logged by</th><th>Remarks</th><th></th></tr></thead>
          <tbody id="brush-hist-tbody"><tr><td colspan="8" class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
  },

  async _load(filters, setCount) {
    const tbody = document.getElementById('brush-hist-tbody');
    try {
      const rows = await DB.listBrushLogs({ from: filters.from, to: filters.to, limit: 1000 });
      const filtered = filters.search ? SearchBar.filter(rows, { text: filters.search }, 'log_date', ['brush_id', 'condition', 'remarks', 'staff_name']) : rows;
      setCount(filtered.length);
      BrushView._renderRecentTable.call(BrushView, filtered, 'brush-hist-tbody', 'hv-count');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Couldn't load history: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  }
};

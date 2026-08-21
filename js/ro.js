// ============================================================
// RO WATER QUALITY LOGBOOK — dynamic parameter system.
// Conductivity/TDS/pH are the always-on defaults; other parameters
// (Hardness, Chlorides, Silicates, Bacteria/HPC, Endotoxins — per
// ANSI/AAMI ST108:2023 / ISO 15883) exist in the catalog but are
// activated on a need-to-basis in Admin, not shown here until then.
// Staff pick which of the active parameters they're actually recording
// this visit (not every parameter needs a value every time) and which
// tester (testing device/kit) was used — so this data can be studied
// over time, per the person who asked for this design.
// ============================================================

const RoView = {
  _parameters: [],
  _testers: [],

  async render() {
    const el = document.getElementById('view-ro');
    let activated = true;
    try { activated = (await DB.getAppMeta()).ro_monitoring_activated; } catch (e) { /* assume activated if unreachable, rather than silently blocking a working logbook */ }
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook · TCCH-SPU-PROC-015</div>
          <h1>RO Water Quality Monitoring</h1>
          <div class="desc">Each parameter is evaluated against its own limit. Only fill in what you actually tested today.</div>
        </div>
        ${!activated ? '<button class="btn btn-sm" id="ro-activate" style="background:var(--amber);border-color:var(--amber);color:#000;font-weight:700;">Activate</button>' : ''}
        <button class="btn btn-sm" id="ro-add-tester">+ Add a tester</button>
      </div>
      ${!activated ? `<div class="card card-pad" style="background:#fff8e1;border-color:var(--amber);margin-bottom:14px;"><strong>Monitoring kit not yet received.</strong> The scheduled daily alarm for this logbook is off until you click Activate — entries can still be logged manually in the meantime.</div>` : ''}

      <div class="card card-pad">
        <form id="ro-form">
          <div class="form-grid">
            <div class="field">
              <label>Date</label>
              <input type="date" name="log_date" required value="${UI.todayStr()}">
            </div>
            <div class="field">
              <label>Time</label>
              <input type="time" name="log_time" required value="${UI.nowTimeStr()}">
            </div>
            <div class="field">
              <label>Tester used <span class="hint">testing device/kit — name, model, make</span></label>
              <select id="ro-tester"><option value="">—</option></select>
            </div>
          </div>
          <div class="section-title" style="margin-top:20px;">Parameters recorded today</div>
          <div id="ro-param-fields" class="form-grid"></div>
          <div class="form-grid" style="margin-top:14px;">
            <div class="field field-full">
              <label>Remarks (optional)</label>
              <textarea name="remarks" placeholder="Any observations, corrective action taken, etc."></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="ro-submit">Save entry</button>
          </div>
        </form>
      </div>

      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Recent entries <span class="count" id="ro-count">—</span></span>
        <button class="btn btn-sm" id="ro-view-history">View all history →</button>
      </div>
      ${SearchBar.render('ro-search')}
      <div class="table-wrap"><table>
        <thead><tr id="ro-thead-row"><th>Ref #</th><th>Date</th><th>Time</th><th>Tester</th></tr></thead>
        <tbody id="ro-tbody"><tr><td class="empty-state">Loading…</td></tr></tbody>
      </table></div>

      ${activated ? MissedEntriesView.sectionHtml('ro', 'Missed/Late Entries') : `
        <div class="section-title" style="margin-top:22px;">Missed/Late Entries</div>
        <div class="card card-pad empty-state">Not tracked until monitoring is activated above.</div>
      `}
    `;

    if (activated) MissedEntriesView.wire('ro-missed-range', (v) => this._loadMissedEntries(v));

    try { this._parameters = await DB.listRoParameters(true); } catch (e) { this._parameters = []; }
    try { this._testers = await DB.listRoTesters(true); } catch (e) { this._testers = []; }

    this._renderTesterSelect();
    this._renderParamFields();

    document.getElementById('ro-add-tester').addEventListener('click', () => this._addTesterModal());
    const activateBtn = document.getElementById('ro-activate');
    if (activateBtn) {
      activateBtn.addEventListener('click', async () => {
        try {
          await DB.updateAppMeta({ ro_monitoring_activated: true, ro_monitoring_activated_at: TrueTime.nowISO() });
          UI.toast('RO monitoring activated — the scheduled alarm is now on');
          this.render();
        } catch (e) { UI.toast('Could not activate: ' + e.message, true); }
      });
    }
    document.getElementById('ro-form').addEventListener('submit', (e) => this._submit(e));
    FormDraft.attach(document.getElementById('ro-form'), 'ro-form');
    if (App.pendingBackfillDate) {
      document.querySelector('input[name="log_date"]').value = App.pendingBackfillDate;
      UI.toast(`Backfilling RO log for ${UI.fmtDate(App.pendingBackfillDate)}`);
      App.pendingBackfillDate = null;
    }
    document.getElementById('ro-view-history').addEventListener('click', () => App.navigate('ro-history'));
    this._loadTable();
  },

  _renderTesterSelect() {
    const sel = document.getElementById('ro-tester');
    sel.innerHTML = `<option value="">—</option>` + this._testers.map(t =>
      `<option value="${t.id}">${UI.escapeHtml(t.name)}${t.model ? ' — ' + UI.escapeHtml(t.model) : ''}</option>`
    ).join('');
  },

  _addTesterModal() {
    const modal = UI.showModal(`
      <h3>Add a tester</h3>
      <div class="field" style="margin:12px 0;"><label>Name</label><input type="text" id="rt-name" placeholder="e.g. Hach Conductivity Meter"></div>
      <div class="field" style="margin-bottom:12px;"><label>Model</label><input type="text" id="rt-model"></div>
      <div class="field"><label>Make/manufacturer</label><input type="text" id="rt-make"></div>
      <div class="modal-actions">
        <button class="btn" id="rt-cancel">Cancel</button>
        <button class="btn btn-primary" id="rt-save">Add</button>
      </div>
    `);
    modal.querySelector('#rt-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#rt-save').addEventListener('click', async () => {
      const name = modal.querySelector('#rt-name').value.trim();
      if (!name) { UI.toast('Enter a name', true); return; }
      try {
        await DB.addRoTester({ name, model: modal.querySelector('#rt-model').value || null, make: modal.querySelector('#rt-make').value || null });
        UI.toast('Tester added');
        UI.closeModal();
        this._testers = await DB.listRoTesters(true);
        this._renderTesterSelect();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  _renderParamFields() {
    const wrap = document.getElementById('ro-param-fields');
    if (this._parameters.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No active parameters configured — set some up in Admin → RO Parameters.</div>`;
      return;
    }
    wrap.innerHTML = this._parameters.map(p => `
      <div class="field">
        <label>${UI.escapeHtml(p.name)}${p.unit ? ` (${UI.escapeHtml(p.unit)})` : ''} <span class="hint">leave blank if not tested today</span></label>
        <input type="number" step="0.01" id="ro-param-${p.id}" data-param-id="${p.id}" placeholder="${p.reference_note ? UI.escapeHtml(p.reference_note) : (p.limit_min != null && p.limit_max != null ? p.limit_min + '–' + p.limit_max : p.limit_max != null ? '< ' + p.limit_max : '')}">
      </div>
    `).join('');
  },

  _evalPass(param, value) {
    if (param.limit_min != null && value < param.limit_min) return false;
    if (param.limit_max != null && value > param.limit_max) return false;
    return true;
  },

  async _submit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);

    const readings = [];
    document.querySelectorAll('#ro-param-fields input[data-param-id]').forEach(input => {
      if (input.value === '') return;
      const param = this._parameters.find(p => p.id === input.dataset.paramId);
      if (!param) return;
      const value = parseFloat(input.value);
      readings.push({ parameter_id: param.id, name: param.name, unit: param.unit, value, pass: this._evalPass(param, value) });
    });
    if (readings.length === 0) {
      UI.toast('Enter at least one parameter reading', true);
      return;
    }

    const testerId = document.getElementById('ro-tester').value || null;
    const tester = this._testers.find(t => t.id === testerId);
    const entry = {
      log_date: fd.get('log_date'),
      log_time: fd.get('log_time'),
      tester_id: testerId,
      tester_name: tester ? tester.name : null,
      readings,
      remarks: fd.get('remarks') || null,
      staff_id: Auth.currentStaff.id,
      staff_name: Auth.currentStaff.name
    };

    const btn = document.getElementById('ro-submit');
    await UI.withLoading(btn, async () => {
      try {
        try {
          const existing = await DB.findExistingLog('ro_water_quality', { log_date: entry.log_date });
          if (existing) {
            const proceed = await UI.confirmDuplicate(`${UI.escapeHtml(existing.staff_name)} already logged an RO reading for ${UI.fmtDate(entry.log_date)}, at ${UI.escapeHtml(existing.log_time)}.`);
            if (!proceed) return;
          }
        } catch (e) { /* offline or check failed — don't block the actual save over this */ }
        const result = await DB.addRoLog(entry);
        const anyFail = readings.some(r => r.pass === false);
        UI.writeResultToast(result, anyFail ? 'Entry saved — one or more parameters out of range' : 'Entry saved — within range', anyFail);
        form.reset();
        form.log_date.value = UI.todayStr();
        form.log_time.value = UI.nowTimeStr();
        FormDraft.clear('ro-form');
        this._renderTesterSelect();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  _badge(pass) {
    if (pass === null || pass === undefined) return '';
    return pass ? '<span class="badge badge-pass">Pass</span>' : '<span class="badge badge-fail">Fail</span>';
  },

  async _loadTable() {
    const tbody = document.getElementById('ro-tbody');
    try {
      const rows = await DB.listRoLogs({ from: UI.daysAgoStr(30), limit: 100 });
      this._tableRows = rows;
      SearchBar.wire('ro-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'log_date', ['tester_name', 'staff_name', 'remarks'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td class="empty-state">Couldn't load entries: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  // Daily, single check (not per-parameter). Tracking only starts
  // from ro_monitoring_activated_at — before the kit was actually
  // activated there was no real expectation of daily logging, so
  // those days must never get flagged regardless of range selected.
  async _loadMissedEntries(rangeValue) {
    try {
      const to = UI.todayStr();
      let from = rangeValue === 'all' ? ((await WorkCalendar.launchDate()) || UI.daysAgoStr(365)) : UI.daysAgoStr(parseInt(rangeValue, 10));
      const meta = await DB.getAppMeta();
      if (meta.ro_monitoring_activated_at) {
        const activatedDate = meta.ro_monitoring_activated_at.slice(0, 10);
        if (activatedDate > from) from = activatedDate;
      }
      if (from > to) { MissedEntriesView.render('ro-missed-wrap', 'ro-missed-count', []); return; }

      const rows = await DB.listRoLogs({ from, to, limit: 2000 });
      const logsByDate = new Map();
      rows.forEach(r => { if (!logsByDate.has(r.log_date)) logsByDate.set(r.log_date, []); logsByDate.get(r.log_date).push(r); });

      const dueDates = [];
      let cursor = new Date(from + 'T00:00:00');
      const end = new Date(to + 'T00:00:00');
      while (cursor <= end) {
        dueDates.push(cursor.toISOString().slice(0, 10)); // daily, every day, no weekend exclusion for RO
        cursor.setDate(cursor.getDate() + 1);
      }

      const entries = MissedEntriesView.classify(dueDates, logsByDate, '14:30');
      MissedEntriesView.render('ro-missed-wrap', 'ro-missed-count', entries);
    } catch (e) {
      MissedEntriesView.errorState('ro-missed-wrap', e.message);
    }
  },

  _renderTable(rows, tbodyId = 'ro-tbody', countId = 'ro-count', theadId = 'ro-thead-row') {
    const tbody = document.getElementById(tbodyId);
    document.getElementById(countId).textContent = `${rows.length} shown`;

    // Header adapts to whichever parameters actually show up in the loaded rows,
    // so a rarely-tested one (e.g. Bacteria/HPC) doesn't get a permanent empty column.
    const seenParams = new Map();
    rows.forEach(r => (r.readings || []).forEach(rd => { if (!seenParams.has(rd.name)) seenParams.set(rd.name, rd.unit); }));
    const paramNames = Array.from(seenParams.keys());
    document.getElementById(theadId).innerHTML =
      `<th>Ref #</th><th>Date</th><th>Time</th><th>Tester</th>` +
      paramNames.map(n => `<th>${UI.escapeHtml(n)}</th>`).join('') +
      `<th>Logged by</th><th>Remarks</th><th></th>`;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td class="empty-state">No entries match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const byName = {};
      (r.readings || []).forEach(rd => { byName[rd.name] = rd; });
      return `
      <tr>
        <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
        <td>${UI.fmtDate(r.log_date)}</td>
        <td class="mono">${r.log_time?.slice(0,5) || '—'}</td>
        <td>${UI.escapeHtml(r.tester_name) || '—'}</td>
        ${paramNames.map(n => {
          const rd = byName[n];
          return `<td class="mono">${rd ? rd.value : '—'} ${rd ? this._badge(rd.pass) : ''}</td>`;
        }).join('')}
        <td>${UI.escapeHtml(r.staff_name)}</td>
        <td>${UI.escapeHtml(r.remarks) || '—'}</td>
        <td><button class="btn btn-sm" data-print="${r.id}">Print</button></td>
      </tr>
    `;
    }).join('');
    tbody.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printEntry(rows.find(r => r.id === btn.dataset.print)));
    });
  },

  _printEntry(r) {
    const rows = [
      ['Date', UI.fmtDate(r.log_date)], ['Time', r.log_time?.slice(0, 5)], ['Tester', r.tester_name],
      ...(r.readings || []).map(rd => [`${rd.name} (${rd.unit || ''})`, `${rd.value} — ${rd.pass ? 'Pass' : 'Fail'}`]),
      ['Logged by', r.staff_name], ['Remarks', r.remarks]
    ];
    PrintReport.generate({ title: 'RO WATER QUALITY MONITORING REPORT', refNumber: r.serial_number, sections: [{ heading: 'Reading Details', rows }] });
  }
};

const RoHistoryView = {
  async render() {
    const container = document.getElementById('view-ro-history');
    const { tableWrap, setCount } = HistoryView.renderShell({
      container, title: 'RO Water Quality Monitoring — Full History', backView: 'ro',
      onFilterChange: (filters) => this._load(filters, setCount)
    });
    tableWrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr id="ro-hist-thead-row"><th>Ref #</th><th>Date</th><th>Time</th><th>Tester</th></tr></thead>
          <tbody id="ro-hist-tbody"><tr><td class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
  },

  async _load(filters, setCount) {
    const tbody = document.getElementById('ro-hist-tbody');
    try {
      const rows = await DB.listRoLogs({ from: filters.from, to: filters.to, limit: 1000 });
      const filtered = filters.search ? SearchBar.filter(rows, { text: filters.search }, 'log_date', ['tester_name', 'staff_name', 'remarks']) : rows;
      setCount(filtered.length);
      RoView._renderTable.call(RoView, filtered, 'ro-hist-tbody', 'hv-count', 'ro-hist-thead-row');
    } catch (e) {
      tbody.innerHTML = `<tr><td class="empty-state">Couldn't load history: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  }
};

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
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook · TCCH-SPU-PROC-015</div>
          <h1>RO Water Quality Monitoring</h1>
          <div class="desc">Each parameter is evaluated against its own limit. Only fill in what you actually tested today.</div>
        </div>
        <button class="btn btn-sm" id="ro-add-tester">+ Add a tester</button>
      </div>

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

      <div class="section-title">Recent entries <span class="count" id="ro-count">—</span></div>
      ${SearchBar.render('ro-search')}
      <div class="table-wrap"><table>
        <thead><tr id="ro-thead-row"><th>Ref #</th><th>Date</th><th>Time</th><th>Tester</th></tr></thead>
        <tbody id="ro-tbody"><tr><td class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;

    try { this._parameters = await DB.listRoParameters(true); } catch (e) { this._parameters = []; }
    try { this._testers = await DB.listRoTesters(true); } catch (e) { this._testers = []; }

    this._renderTesterSelect();
    this._renderParamFields();

    document.getElementById('ro-add-tester').addEventListener('click', () => this._addTesterModal());
    document.getElementById('ro-form').addEventListener('submit', (e) => this._submit(e));
    FormDraft.attach(document.getElementById('ro-form'), 'ro-form');
    if (App.pendingBackfillDate) {
      document.querySelector('input[name="log_date"]').value = App.pendingBackfillDate;
      UI.toast(`Backfilling RO log for ${UI.fmtDate(App.pendingBackfillDate)}`);
      App.pendingBackfillDate = null;
    }
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

  _renderTable(rows) {
    const tbody = document.getElementById('ro-tbody');
    document.getElementById('ro-count').textContent = `${rows.length} shown`;

    // Header adapts to whichever parameters actually show up in the loaded rows,
    // so a rarely-tested one (e.g. Bacteria/HPC) doesn't get a permanent empty column.
    const seenParams = new Map();
    rows.forEach(r => (r.readings || []).forEach(rd => { if (!seenParams.has(rd.name)) seenParams.set(rd.name, rd.unit); }));
    const paramNames = Array.from(seenParams.keys());
    document.getElementById('ro-thead-row').innerHTML =
      `<th>Ref #</th><th>Date</th><th>Time</th><th>Tester</th>` +
      paramNames.map(n => `<th>${UI.escapeHtml(n)}</th>`).join('') +
      `<th>Logged by</th><th>Remarks</th>`;

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
      </tr>
    `;
    }).join('');
  }
};

// ============================================================
// TEMPERATURE & HUMIDITY LOG — 8th logbook. Two CSSD storage areas
// (Disinfection/Packing/Autoclave, Sterile Storage), each with its own
// standard range (20-24°C, 20-60% RH by default) — a small admin-
// editable catalog, not a full RO-Parameters-style system, since this
// only ever needs a couple of fixed areas.
// ============================================================

const TempHumidityView = {
  _locations: [],

  async render() {
    const el = document.getElementById('view-temp-humidity');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>Temperature &amp; Humidity Log</h1>
          <div class="desc">CSSD storage areas — logged against each area's standard range.</div>
        </div>
      </div>

      <div class="card card-pad">
        <form id="th-form">
          <div class="form-grid">
            <div class="field">
              <label>Location</label>
              <select name="location_id" id="th-location" required></select>
            </div>
            <div class="field">
              <label>Date</label>
              <input type="date" name="log_date" required value="${UI.todayStr()}">
            </div>
            <div class="field">
              <label>Time</label>
              <input type="time" name="log_time" required value="${UI.nowTimeStr()}">
            </div>
            <div class="field">
              <label>Temperature (°C)</label>
              <input type="number" step="0.1" name="temperature_c" id="th-temp" required>
            </div>
            <div class="field">
              <label>Humidity (%)</label>
              <input type="number" step="0.1" name="humidity_pct" id="th-humidity" required>
            </div>
          </div>
          <div id="th-range-hint" class="hint" style="margin-top:8px;"></div>
          <div id="th-abnormal-section" class="hidden" style="margin-top:14px;background:rgba(196,67,46,0.08);border:1px solid rgba(196,67,46,0.35);border-radius:var(--radius-sm);padding:12px 14px;">
            <div style="font-weight:700;color:var(--red);margin-bottom:8px;">⚠ Reading out of range</div>
            <button type="button" class="btn btn-sm" id="th-report-now">Report Abnormality — Time Now</button>
            <div id="th-reported-at" class="hint" style="margin-top:6px;"></div>
            <div class="field field-full" style="margin-top:10px;">
              <label>Action(s) taken</label>
              <div class="radio-row" id="th-action-row">
                <button type="button" class="radio-chip" data-val="Reported to Biomedical Engineer">Reported to Biomedical Engineer</button>
                <button type="button" class="radio-chip" data-val="Reported to Facilities">Reported to Facilities</button>
                <button type="button" class="radio-chip" data-val="HVAC/AC Adjusted">HVAC/AC Adjusted</button>
                <button type="button" class="radio-chip" data-val="Items Relocated/Quarantined">Items Relocated/Quarantined</button>
                <button type="button" class="radio-chip" data-val="Re-monitored">Re-monitored</button>
                <button type="button" class="radio-chip" data-val="Other">Other</button>
              </div>
              <input type="text" id="th-action-other" class="hidden" placeholder="Specify other action" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
            </div>
          </div>
          <div class="form-grid" style="margin-top:14px;">
            <div class="field field-full"><label>Remarks <span class="hint">optional</span></label><textarea name="remarks"></textarea></div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="th-submit">Save reading</button>
          </div>
        </form>
      </div>

      <div class="section-title">Recent readings <span class="count" id="th-count">—</span></div>
      ${SearchBar.render('th-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Date</th><th>Time</th><th>Location</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Action taken</th><th>Logged by</th><th>Remarks</th><th></th></tr></thead>
        <tbody id="th-tbody"><tr><td colspan="10" class="empty-state">Loading…</td></tr></tbody>
      </table></div>

      <div class="section-title">Trend</div>
      <div class="card card-pad">
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="field"><label>Location</label>
            <select id="th-chart-selector"><option value="both">Both locations</option></select>
          </div>
          <div class="field"><label>Show</label>
            <select id="th-chart-metric">
              <option value="both">Temperature &amp; Humidity</option>
              <option value="temp">Temperature only</option>
              <option value="humidity">Humidity only</option>
            </select>
          </div>
        </div>
        <canvas id="th-chart" height="90"></canvas>
      </div>
    `;

    try { this._locations = await DB.listTempHumidityLocations(true); } catch (e) { this._locations = []; }
    const sel = document.getElementById('th-location');
    sel.innerHTML = this._locations.length
      ? this._locations.map(l => `<option value="${l.id}">${UI.escapeHtml(l.name)}</option>`).join('')
      : `<option value="">No locations configured</option>`;
    sel.addEventListener('change', () => { this._syncRangeHint(); this._syncAbnormalSection(); });
    document.getElementById('th-temp').addEventListener('input', () => this._syncAbnormalSection());
    document.getElementById('th-humidity').addEventListener('input', () => this._syncAbnormalSection());
    this._syncRangeHint();

    const chartSel = document.getElementById('th-chart-selector');
    chartSel.innerHTML = `<option value="both">Both locations</option>` + this._locations.map(l => `<option value="${l.id}">${UI.escapeHtml(l.name)} only</option>`).join('');
    chartSel.addEventListener('change', () => this._loadChart());
    document.getElementById('th-chart-metric').addEventListener('change', () => this._loadChart());
    this._loadChart();

    this._abnormalityReportedAt = null;
    const actionState = this._wireAbnormalActionChips();
    this._abnormalityActionState = actionState;
    document.getElementById('th-report-now').addEventListener('click', () => {
      this._abnormalityReportedAt = TrueTime.nowISO();
      document.getElementById('th-reported-at').textContent = `Reported at ${UI.fmtDateTime(this._abnormalityReportedAt)}`;
    });

    document.getElementById('th-form').addEventListener('submit', (e) => this._submit(e));
    FormDraft.attach(document.getElementById('th-form'), 'th-form', {
      getExtra: () => ({
        abnormalityReportedAt: this._abnormalityReportedAt,
        selectedActions: Array.from(this._abnormalityActionState.selected)
      }),
      setExtra: (extra) => {
        if (extra.abnormalityReportedAt) {
          this._abnormalityReportedAt = extra.abnormalityReportedAt;
          document.getElementById('th-reported-at').textContent = `Reported at ${UI.fmtDateTime(this._abnormalityReportedAt)}`;
        }
        (extra.selectedActions || []).forEach(val => {
          const chip = document.querySelector(`#th-action-row [data-val="${val}"]`);
          if (chip) chip.click();
        });
      }
    });
    this._syncRangeHint();
    this._syncAbnormalSection();
    this._loadTable();
  },

  _syncRangeHint() {
    const loc = this._locations.find(l => l.id === document.getElementById('th-location').value);
    const hint = document.getElementById('th-range-hint');
    if (!loc) { hint.textContent = ''; return; }
    hint.textContent = `Standard range for this area: ${loc.temp_min}–${loc.temp_max}°C, ${loc.humidity_min}–${loc.humidity_max}% RH.`;
  },

  _wireAbnormalActionChips() {
    const row = document.getElementById('th-action-row');
    const otherInput = document.getElementById('th-action-other');
    const state = { selected: new Set() };
    row.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      const val = chip.dataset.val;
      if (state.selected.has(val)) { state.selected.delete(val); chip.className = 'radio-chip'; }
      else { state.selected.add(val); chip.className = 'radio-chip active-bad'; }
      otherInput.classList.toggle('hidden', !state.selected.has('Other'));
    }));
    return state;
  },

  _syncAbnormalSection() {
    const loc = this._locations.find(l => l.id === document.getElementById('th-location').value);
    const tempVal = parseFloat(document.getElementById('th-temp').value);
    const humVal = parseFloat(document.getElementById('th-humidity').value);
    if (!loc || (isNaN(tempVal) && isNaN(humVal))) {
      document.getElementById('th-abnormal-section').classList.add('hidden');
      return;
    }
    const tempOk = isNaN(tempVal) || (tempVal >= loc.temp_min && tempVal <= loc.temp_max);
    const humOk = isNaN(humVal) || (humVal >= loc.humidity_min && humVal <= loc.humidity_max);
    document.getElementById('th-abnormal-section').classList.toggle('hidden', tempOk && humOk);
  },

  async _submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const loc = this._locations.find(l => l.id === fd.get('location_id'));
    if (!loc) { UI.toast('Select a location', true); return; }
    const temp = parseFloat(fd.get('temperature_c'));
    const humidity = parseFloat(fd.get('humidity_pct'));
    const tempPass = temp >= loc.temp_min && temp <= loc.temp_max;
    const humidityPass = humidity >= loc.humidity_min && humidity <= loc.humidity_max;
    const abnormal = !tempPass || !humidityPass;
    const entry = {
      location_id: loc.id,
      location_name: loc.name,
      log_date: fd.get('log_date'),
      log_time: fd.get('log_time'),
      temperature_c: temp,
      humidity_pct: humidity,
      temp_pass: tempPass,
      humidity_pass: humidityPass,
      remarks: fd.get('remarks') || null,
      time_reported_abnormality: abnormal ? this._abnormalityReportedAt : null,
      abnormality_action: abnormal ? Array.from(this._abnormalityActionState.selected) : null,
      abnormality_action_other: abnormal && this._abnormalityActionState.selected.has('Other') ? (document.getElementById('th-action-other').value || null) : null,
      staff_id: Auth.currentStaff.id,
      staff_name: Auth.currentStaff.name
    };
    const btn = document.getElementById('th-submit');
    await UI.withLoading(btn, async () => {
      try {
        try {
          const existing = await DB.findExistingLog('temp_humidity_logs', { location_id: loc.id, log_date: entry.log_date });
          if (existing) {
            const proceed = await UI.confirmDuplicate(`${UI.escapeHtml(existing.staff_name)} already logged ${UI.escapeHtml(loc.name)} for ${UI.fmtDate(entry.log_date)}.`);
            if (!proceed) return;
          }
        } catch (e2) { /* offline or check failed — don't block the save over this */ }
        const result = await DB.addTempHumidityLog(entry);
        const anyFail = !entry.temp_pass || !entry.humidity_pass;
        UI.writeResultToast(result, anyFail ? 'Reading saved — out of range' : 'Reading saved — within range', anyFail);
        e.target.reset();
        document.querySelector('input[name="log_date"]').value = UI.todayStr();
        document.querySelector('input[name="log_time"]').value = UI.nowTimeStr();
        FormDraft.clear('th-form');
        this._abnormalityReportedAt = null;
        this._abnormalityActionState.selected.clear();
        document.getElementById('th-action-row').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
        document.getElementById('th-action-other').value = '';
        document.getElementById('th-reported-at').textContent = '';
        this._syncAbnormalSection();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  _chartColors: ['#2F6B4F', '#1B6E78', '#C4432E', '#9D7295', '#F58C35'],

  async _loadChart() {
    const selected = document.getElementById('th-chart-selector').value;
    const metric = document.getElementById('th-chart-metric').value; // 'both' | 'temp' | 'humidity'
    const canvas = document.getElementById('th-chart');
    const showTemp = metric === 'both' || metric === 'temp';
    const showHumidity = metric === 'both' || metric === 'humidity';
    const comparingBoth = selected === 'both' && this._locations.length > 1;
    try {
      const rows = await DB.listTempHumidityLogs({ from: UI.daysAgoStr(30), limit: 500 });
      const groups = selected === 'both'
        ? this._locations.map(l => ({ name: l.name, readings: rows.filter(r => r.location_id === l.id) }))
        : [{ name: (this._locations.find(l => l.id === selected) || {}).name || '', readings: rows.filter(r => r.location_id === selected) }];
      groups.forEach(g => g.readings.sort((a, b) => (a.log_date + (a.log_time || '')).localeCompare(b.log_date + (b.log_time || ''))));

      const allDates = Array.from(new Set(groups.flatMap(g => g.readings.map(r => r.log_date)))).sort();
      const datasets = [];
      groups.forEach((g, i) => {
        const byDate = {}; g.readings.forEach(r => { byDate[r.log_date] = r; });
        const color = this._chartColors[i % this._chartColors.length];
        const suffix = groups.length > 1 ? ` (${g.name})` : '';

        if (showTemp) {
          if (comparingBoth) {
            // Comparing multiple locations at once gets confusing fast with
            // everything as overlapping lines — temperature as semi-
            // transparent bars is easier to scan side by side, humidity
            // stays as lines (below) so the two metrics stay visually
            // distinct at a glance, not just by color.
            datasets.push({
              type: 'bar', label: `Temp °C${suffix}`, yAxisID: 'yTemp',
              data: allDates.map(d => byDate[d] ? byDate[d].temperature_c : null),
              backgroundColor: color + '73', // ~55% transparency
              borderColor: color, borderWidth: 1
            });
          } else {
            datasets.push({
              type: 'line', label: `Temperature (°C)${suffix}`, yAxisID: 'yTemp',
              data: allDates.map(d => byDate[d] ? byDate[d].temperature_c : null),
              borderColor: color, backgroundColor: 'transparent', tension: 0.25, spanGaps: true,
              pointBackgroundColor: allDates.map(d => byDate[d] ? (byDate[d].temp_pass ? color : '#8B0000') : color),
              pointRadius: allDates.map(d => byDate[d] && !byDate[d].temp_pass ? 5 : 2)
            });
          }
        }
        if (showHumidity) {
          datasets.push({
            type: 'line', label: `Humidity %${suffix}`, yAxisID: 'yHumidity',
            data: allDates.map(d => byDate[d] ? byDate[d].humidity_pct : null),
            borderColor: color, backgroundColor: 'transparent', borderDash: [5, 3], tension: 0.25, spanGaps: true,
            pointBackgroundColor: allDates.map(d => byDate[d] ? (byDate[d].humidity_pass ? color : '#8B0000') : color),
            pointRadius: allDates.map(d => byDate[d] && !byDate[d].humidity_pass ? 5 : 2)
          });
        }
      });

      if (this._chart) this._chart.destroy();
      const scales = {};
      if (showTemp) scales.yTemp = { type: 'linear', position: 'left', title: { display: true, text: '°C' } };
      if (showHumidity) scales.yHumidity = { type: 'linear', position: showTemp ? 'right' : 'left', title: { display: true, text: '% RH' }, grid: { drawOnChartArea: !showTemp } };

      this._chart = new Chart(canvas.getContext('2d'), {
        type: comparingBoth && showTemp ? 'bar' : 'line',
        data: { labels: allDates.map(d => UI.fmtDate(d)), datasets },
        options: {
          responsive: true,
          scales,
          // Dashed vs. solid line style is explained once here rather than
          // repeated in every label — the legend itself stays short
          // (one entry per location per metric) instead of every entry
          // spelling out "Temperature (°C)" / "Humidity (%)" in full.
          plugins: { legend: { display: true, position: 'bottom' } }
        }
      });
    } catch (e) { /* chart is a nice-to-have — table still works if this fails */ }
  },

  async _loadTable() {
    const tbody = document.getElementById('th-tbody');
    try {
      const rows = await DB.listTempHumidityLogs({ from: UI.daysAgoStr(30), limit: 100 });
      this._tableRows = rows;
      SearchBar.wire('th-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'log_date', ['location_name', 'staff_name', 'remarks'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Couldn't load readings: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  _renderTable(rows) {
    const tbody = document.getElementById('th-tbody');
    document.getElementById('th-count').textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No readings match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td>${UI.fmtDate(r.log_date)}</td>
          <td class="mono">${(r.log_time || '').slice(0, 5)}</td>
          <td>${UI.escapeHtml(r.location_name)}</td>
          <td class="mono">${r.temperature_c} <span class="badge ${r.temp_pass ? 'badge-pass' : 'badge-fail'}">${r.temp_pass ? 'Pass' : 'Fail'}</span></td>
          <td class="mono">${r.humidity_pct} <span class="badge ${r.humidity_pass ? 'badge-pass' : 'badge-fail'}">${r.humidity_pass ? 'Pass' : 'Fail'}</span></td>
          <td>${(r.abnormality_action || []).length ? UI.escapeHtml((r.abnormality_action || []).join(', ')) + (r.abnormality_action_other ? ` (${UI.escapeHtml(r.abnormality_action_other)})` : '') : '—'}</td>
          <td>${UI.escapeHtml(r.staff_name)}</td>
          <td>${UI.escapeHtml(r.remarks) || '—'}</td>
          <td><button class="btn btn-sm" data-print="${r.id}">Print</button></td>
        </tr>
      `).join('');
    tbody.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printReading(rows.find(r => r.id === btn.dataset.print)));
    });
  },

  _printReading(r) {
    const rows = [
      ['Location', r.location_name], ['Date', UI.fmtDate(r.log_date)], ['Time', (r.log_time || '').slice(0, 5)],
      ['Temperature (°C)', `${r.temperature_c} — ${r.temp_pass ? 'Pass' : 'Fail'}`],
      ['Humidity (%)', `${r.humidity_pct} — ${r.humidity_pass ? 'Pass' : 'Fail'}`],
      ['Reported at', UI.fmtDateTime(r.abnormality_reported_at)],
      ['Action taken', (r.abnormality_action || []).length ? (r.abnormality_action || []).join(', ') + (r.abnormality_action_other ? ` (${r.abnormality_action_other})` : '') : '—'],
      ['Logged by', r.staff_name], ['Remarks', r.remarks]
    ];
    PrintReport.generate({ title: 'TEMPERATURE & HUMIDITY MONITORING REPORT', refNumber: r.serial_number, sections: [{ heading: 'Reading Details', rows }] });
  }
};

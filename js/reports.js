// ============================================================
// KPI REPORT
// - RO: pick a parameter (conductivity / TDS / microbial) — each
//   gets its own compliance rate, per TCCH-SPU-PROC-015.
// - Equipment: pick a machine — downtime rate is reported per
//   machine, never averaged, plus MTBF and a root-cause split.
// - Brush: weekly inspection compliance + replacement rate.
// Any date range, exported as a PDF formatted like TCCH/QPS/FRM/011.
// ============================================================

const ReportsView = {
  _chart: null,
  _lastResult: null,
  _machines: [],

  _roParams: [],  // fetched at render — includes inactive ones too, since a historical report may cover a parameter since deactivated
  _thLocations: [],

  async render() {
    const el = document.getElementById('view-reports');
    const defaultTo = UI.todayStr();
    const defaultFrom = UI.daysAgoStr(90);
    try { this._machines = await DB.listAllMachines(); } catch (e) { this._machines = []; }
    try { this._roParams = await DB.listRoParameters(false); } catch (e) { this._roParams = []; }
    try { this._thLocations = await DB.listTempHumidityLocations(false); } catch (e) { this._thLocations = []; }

    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Reports</div>
          <h1>KPI Report</h1>
          <div class="desc">Formatted for TCCH/QPS/FRM/011. Pick a logbook, any date range, and generate.</div>
        </div>
      </div>

      <div class="card card-pad">
        <div class="report-controls">
          <div class="field"><label>Logbook</label>
            <select id="rep-kpi">
              <option value="ro">RO Water Quality</option>
              <option value="equipment">Equipment Downtime</option>
              <option value="brush">Cleaning Brush</option>
              <option value="qa">QA Testing Log</option>
              <option value="temp-humidity">Temperature &amp; Humidity</option>
              <option value="instrument">Instrument Maintenance</option>
            </select>
          </div>
          <div class="field hidden" id="rep-param-wrap"><label>Parameter</label>
            <select id="rep-param"><option value="ALL">All Parameters (compare)</option>${this._roParams.map(p => `<option value="${p.id}">${UI.escapeHtml(p.name)}</option>`).join('')}</select>
          </div>
          <div class="field hidden" id="rep-machine-wrap"><label>Machine</label>
            <select id="rep-machine">${this._machines.map(m => `<option value="${UI.escapeHtml(m.machine_id)}">${UI.escapeHtml(m.machine_id)} — ${m.machine_type === 'ro' ? 'RO System' : m.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : m.machine_type === 'facility_equipment' ? 'Facility Equipment' : 'Autoclave'}</option>`).join('')}</select>
          </div>
          <div class="field hidden" id="rep-qatype-wrap"><label>Test type</label>
            <select id="rep-qatype"><option value="Bowie-Dick">Bowie-Dick</option><option value="BI">BI</option><option value="Dummy">Dummy/CI</option></select>
          </div>
          <div class="field hidden" id="rep-th-location-wrap"><label>Location</label>
            <select id="rep-th-location"><option value="ALL">All Locations</option>${this._thLocations.map(l => `<option value="${l.id}">${UI.escapeHtml(l.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Staff</label>
            <select id="rep-staff"><option value="">All staff (department)</option></select>
          </div>
          <div class="field"><label>From</label><input type="date" id="rep-from" value="${defaultFrom}"></div>
          <div class="field"><label>To</label><input type="date" id="rep-to" value="${defaultTo}"></div>
          <button class="btn btn-primary" id="rep-generate">Generate</button>
        </div>
      </div>

      <div id="rep-results" class="report-preview hidden">
        <div class="section-title">Monthly breakdown</div>
        <div class="table-wrap"><table id="rep-table"></table></div>

        <div id="rep-secondary"></div>

        <div class="chart-wrap"><canvas id="rep-chart" height="90"></canvas></div>

        <div class="section-title">Report details <span class="hint" style="font-weight:400;color:var(--ink-soft);">(edit before export)</span></div>
        <div class="card card-pad">
          <div class="form-grid">
            <div class="field field-full"><label>Title</label><input type="text" id="f-title"></div>
            <div class="field"><label>Owner</label><input type="text" id="f-owner" value="CSSD Supervisor"></div>
            <div class="field"><label>Unit / Department</label><input type="text" id="f-unit"></div>
            <div class="field"><label>Benchmark</label><input type="text" id="f-benchmark"></div>
            <div class="field"><label>Target</label><input type="text" id="f-target"></div>
            <div class="field field-full"><label>Rationale</label><textarea id="f-rationale"></textarea></div>
            <div class="field"><label>Inclusion criteria</label><textarea id="f-inclusion"></textarea></div>
            <div class="field"><label>Exclusion criteria</label><textarea id="f-exclusion"></textarea></div>
            <div class="field field-full"><label>Analysis and findings</label><textarea id="f-analysis" placeholder="Write your interpretation of the trend here…"></textarea></div>
            <div class="field field-full"><label>Recommended action / action plan</label><textarea id="f-action"></textarea></div>
            <div class="field"><label>Responsible person</label><input type="text" id="f-responsible" value="${UI.escapeHtml(Auth.currentStaff.name)}"></div>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn" id="rep-download-word">Download Word</button>
          <button class="btn btn-primary" id="rep-download">Download PDF</button>
        </div>
      </div>
    `;

    document.getElementById('rep-kpi').addEventListener('change', (e) => this._toggleSubControls(e.target.value));
    document.getElementById('rep-generate').addEventListener('click', () => this._generate());
    document.getElementById('rep-download').addEventListener('click', () => this._downloadPdf());
    document.getElementById('rep-download-word').addEventListener('click', () => this._downloadWord());
    this._toggleSubControls('ro');

    try {
      const staff = await DB.listActiveStaff();
      document.getElementById('rep-staff').innerHTML = '<option value="">All staff (department)</option>' +
        staff.map(s => `<option value="${UI.escapeHtml(s.name)}">${UI.escapeHtml(s.name)}</option>`).join('');
    } catch (e) { /* filter stays department-only */ }
  },

  _toggleSubControls(kpi) {
    document.getElementById('rep-param-wrap').classList.toggle('hidden', kpi !== 'ro');
    document.getElementById('rep-machine-wrap').classList.toggle('hidden', kpi !== 'equipment' && kpi !== 'qa');
    document.getElementById('rep-qatype-wrap').classList.toggle('hidden', kpi !== 'qa');
    document.getElementById('rep-th-location-wrap').classList.toggle('hidden', kpi !== 'temp-humidity');
    if (kpi === 'qa') {
      const sel = document.getElementById('rep-machine');
      sel.innerHTML = `<option value="ALL">All Machines (compare)</option>` +
        this._machines.filter(m => m.machine_type === 'autoclave' || m.machine_type === 'flash_sterilizer')
        .map(m => `<option value="${UI.escapeHtml(m.machine_id)}">${UI.escapeHtml(m.machine_id)}</option>`).join('');
    } else if (kpi === 'equipment') {
      const sel = document.getElementById('rep-machine');
      sel.innerHTML = `<option value="ALL">All Machines (compare)</option>` +
        this._machines.map(m => `<option value="${UI.escapeHtml(m.machine_id)}">${UI.escapeHtml(m.machine_id)} — ${m.machine_type === 'ro' ? 'RO System' : m.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : m.machine_type === 'facility_equipment' ? 'Facility Equipment' : 'Autoclave'}</option>`).join('');
    }
  },

  _monthList(from, to) {
    const months = [];
    let d = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    d = new Date(d.getFullYear(), d.getMonth(), 1);
    while (d <= end) {
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      months.push({ key, label, days });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return months;
  },

  async _generate() {
    const kpiKey = document.getElementById('rep-kpi').value;
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const staffFilter = document.getElementById('rep-staff').value || null;
    if (!from || !to || from > to) { UI.toast('Pick a valid date range', true); return; }
    const months = this._monthList(from, to);
    const btn = document.getElementById('rep-generate');

    await UI.withLoading(btn, async () => {
      try {
        let result;
        if (kpiKey === 'ro') result = await this._computeRo(from, to, months, staffFilter);
        else if (kpiKey === 'equipment') result = await this._computeEquipment(from, to, months, staffFilter);
        else if (kpiKey === 'qa') result = await this._computeQa(from, to, months, staffFilter);
        else if (kpiKey === 'temp-humidity') result = await this._computeTempHumidity(from, to);
        else if (kpiKey === 'instrument') result = await this._computeInstrument(from, to, months, staffFilter);
        else result = await this._computeBrush(from, to, months, staffFilter);

        this._lastResult = { kpiKey, from, to, months, staffFilter, ...result };
        this._renderResults();
        document.getElementById('rep-results').classList.remove('hidden');
        document.getElementById('rep-results').scrollIntoView({ behavior: 'smooth' });
      } catch (e) {
        UI.toast('Could not generate report: ' + e.message, true);
      }
    });
  },

  async _computeRo(from, to, months, staffFilter) {
    const paramId = document.getElementById('rep-param').value;

    if (paramId === 'ALL') {
      let rows = await DB.listRoLogs({ from, to, limit: 5000 });
      if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter);
      const activeParams = this._roParams.filter(p => p.active);
      const perDimension = activeParams.map(p => {
        const readingFor = (row) => (row.readings || []).find(rd => rd.parameter_id === p.id || rd.name === p.name);
        const monthly = months.map(m => {
          const monthReadings = rows.filter(r => (r.log_date || '').slice(0, 7) === m.key).map(readingFor).filter(rd => rd !== undefined);
          return { key: m.key, label: m.label, numerator: monthReadings.filter(rd => rd.pass === true).length, denominator: monthReadings.length };
        });
        return { name: p.name, monthly };
      });
      return {
        perDimension,
        title: 'RO Water Quality Compliance Rate — All Parameters',
        numeratorLabel: 'Readings within validated range', denominatorLabel: 'Total readings taken',
        unit: 'CSSD — Reverse Osmosis Water System',
        rationale: `Compares compliance across every active RO parameter per ANSI/AAMI ST108, shown side by side so a single struggling parameter doesn't get lost in an overall number.${staffFilter ? ` Filtered to entries logged by ${staffFilter}.` : ''}`,
        inclusion: `All active-parameter readings logged during the reporting period.${staffFilter ? ` Only entries logged by ${staffFilter}.` : ''}`,
        exclusion: 'A visit where a given parameter wasn\'t tested doesn\'t count toward that parameter\'s denominator.',
        benchmark: 'Each parameter\'s own validated range', target: '100%'
      };
    }

    const p = this._roParams.find(x => x.id === paramId);
    if (!p) return { monthly: [], title: 'RO Water Quality Compliance Rate', numeratorLabel: '', denominatorLabel: '', unit: '', rationale: '', inclusion: '', exclusion: '', benchmark: '', target: '' };
    let rows = await DB.listRoLogs({ from, to, limit: 5000 });
    if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter);
    // Pull out just this parameter's reading from each row's readings array —
    // a row that didn't test this parameter that visit simply has none.
    const readingFor = (row) => (row.readings || []).find(rd => rd.parameter_id === p.id || rd.name === p.name);
    const monthly = months.map(m => {
      const monthReadings = rows
        .filter(r => (r.log_date || '').slice(0, 7) === m.key)
        .map(readingFor)
        .filter(rd => rd !== undefined);
      const numerator = monthReadings.filter(rd => rd.pass === true).length;
      return { key: m.key, label: m.label, numerator, denominator: monthReadings.length };
    });
    return {
      monthly,
      title: `RO Water Quality Compliance Rate — ${p.name}`,
      numeratorLabel: `Number of ${p.name} readings within validated range`,
      denominatorLabel: `Total ${p.name} readings taken that period`,
      unit: 'CSSD — Reverse Osmosis Water System',
      rationale: `Ensures RO product water ${p.name} consistently meets the validated range${p.standard_reference ? ` per ${p.standard_reference}` : ''}, protecting instrument integrity and patient safety.${staffFilter ? ` Filtered to entries logged by ${staffFilter}.` : ''}`,
      inclusion: `All ${p.name} readings logged during the reporting period.${staffFilter ? ` Only entries logged by ${staffFilter}.` : ''}`,
      exclusion: 'Visits where this parameter wasn\'t tested are excluded from the denominator.',
      benchmark: p.reference_note || (p.limit_min != null && p.limit_max != null ? `${p.limit_min}–${p.limit_max}${p.unit ? ' ' + p.unit : ''}` : p.limit_max != null ? `< ${p.limit_max}${p.unit ? ' ' + p.unit : ''}` : 'Confirm against validated spec sheet'),
      target: '100%'
    };
  },

  async _computeQa(from, to, months, staffFilter) {
    const machineId = document.getElementById('rep-machine').value;
    const testType = document.getElementById('rep-qatype').value;
    const testLabel = testType === 'BI' ? 'BI' : testType === 'Bowie-Dick' ? 'Bowie-Dick' : 'Dummy/CI';
    const passed = (r) => testType === 'Bowie-Dick' ? r.bd_result === 'Pass'
      : testType === 'BI' ? r.bi_final_result === 'FINAL PASS'
      : (r.dummy_result === 'Pass' && r.dummy_ci_result === 'Pass');

    if (machineId === 'ALL') {
      const qaMachines = this._machines.filter(m => m.machine_type === 'autoclave' || m.machine_type === 'flash_sterilizer');
      const perDimension = [];
      for (const m of qaMachines) {
        let rows = await DB.listQaTests({ from, to, machine_id: m.machine_id, test_type: testType, limit: 5000 });
        if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter);
        const completed = rows.filter(r => r.status === 'Completed');
        const monthly = months.map(mo => {
          const monthRows = completed.filter(r => (r.date_of_test || '').slice(0, 7) === mo.key);
          return { key: mo.key, label: mo.label, numerator: monthRows.filter(passed).length, denominator: monthRows.length };
        });
        perDimension.push({ name: m.machine_id, monthly });
      }
      return {
        perDimension,
        title: `QA Testing Pass Rate — ${testLabel} — All Machines`,
        numeratorLabel: `Number of ${testLabel} tests that passed`, denominatorLabel: `Total completed ${testLabel} tests`,
        unit: 'CSSD — All Sterilizers',
        rationale: `Compares ${testLabel} pass rate across every sterilizer per AAMI/ANSI ST79, shown side by side rather than blended, so one underperforming machine isn't hidden by the others.${staffFilter ? ` Filtered to entries logged by ${staffFilter}.` : ''}`,
        inclusion: `All completed ${testLabel} tests within the reporting period, across every sterilizer.${staffFilter ? ` Only entries logged by ${staffFilter}.` : ''}`,
        exclusion: 'Tests still Incubating (BI) are excluded until a result is logged.',
        benchmark: '100%', target: '100%'
      };
    }

    let rows = await DB.listQaTests({ from, to, machine_id: machineId, test_type: testType, limit: 5000 });
    if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter);
    // Only completed tests count toward pass rate — an incubating BI hasn't
    // produced a result yet, it's neither a pass nor a fail.
    const completed = rows.filter(r => r.status === 'Completed');
    const monthly = months.map(m => {
      const monthRows = completed.filter(r => (r.date_of_test || '').slice(0, 7) === m.key);
      const numerator = monthRows.filter(passed).length;
      return { key: m.key, label: m.label, numerator, denominator: monthRows.length };
    });
    return {
      monthly,
      title: `QA Testing Pass Rate — ${testLabel} (${machineId})`,
      numeratorLabel: `Number of ${testLabel} tests that passed`,
      denominatorLabel: `Total completed ${testLabel} tests that period`,
      unit: `CSSD — ${machineId}`,
      rationale: `Monitors ${testLabel} test reliability for ${machineId} per AAMI/ANSI ST79. Incubating (not-yet-resulted) BI tests are excluded from the denominator — only completed results count toward the rate.${staffFilter ? ` Filtered to entries logged by ${staffFilter}.` : ''}`,
      inclusion: `All completed ${testLabel} tests for ${machineId} within the reporting period.${staffFilter ? ` Only entries logged by ${staffFilter}.` : ''}`,
      exclusion: 'Tests still Incubating (BI) are excluded from the denominator until a result is logged.',
      benchmark: '100%',
      target: '100%'
    };
  },


  async _computeTempHumidity(from, to) {
    const locationId = document.getElementById('rep-th-location').value;
    const months = this._monthList(from, to);

    if (locationId === 'ALL') {
      const allRows = await DB.listTempHumidityLogs({ from, to, limit: 5000 });
      const readingsByLocation = this._thLocations.map(loc => {
        const rows = allRows.filter(r => r.location_id === loc.id).sort((a, b) => (a.log_date + (a.log_time || '')).localeCompare(b.log_date + (b.log_time || '')));
        return { name: loc.name, readings: rows.map(r => ({ date: r.log_date, temp: r.temperature_c, humidity: r.humidity_pct, tempPass: r.temp_pass, humidityPass: r.humidity_pass })) };
      });
      const perDimension = this._thLocations.map(loc => {
        const monthly = months.map(m => {
          const monthRows = allRows.filter(r => r.location_id === loc.id && (r.log_date || '').slice(0, 7) === m.key);
          return { key: m.key, label: m.label, numerator: monthRows.filter(r => r.temp_pass && r.humidity_pass).length, denominator: monthRows.length };
        });
        return { name: loc.name, monthly };
      });
      return {
        readingsByLocation, perDimension,
        title: 'Temperature & Humidity Compliance — All Locations',
        numeratorLabel: 'Readings within both temperature and humidity range', denominatorLabel: 'Total readings taken',
        unit: 'CSSD — All Storage Areas',
        rationale: 'Compares every CSSD storage area\'s temperature/humidity compliance per ANSI/AAMI ST108, shown side by side.',
        inclusion: 'All readings logged across every location during the reporting period.',
        exclusion: 'None — every logged reading counts.',
        benchmark: 'Each area\'s own validated range', target: '100%'
      };
    }

    const location = this._thLocations.find(l => l.id === locationId);
    let rows = await DB.listTempHumidityLogs({ from, to, limit: 5000 });
    rows = rows.filter(r => r.location_id === locationId).sort((a, b) => (a.log_date + (a.log_time || '')).localeCompare(b.log_date + (b.log_time || '')));

    const monthly = months.map(m => {
      const monthRows = rows.filter(r => (r.log_date || '').slice(0, 7) === m.key);
      const numerator = monthRows.filter(r => r.temp_pass && r.humidity_pass).length;
      return { key: m.key, label: m.label, numerator, denominator: monthRows.length };
    });

    return {
      monthly,
      readings: rows.map(r => ({ date: r.log_date, temp: r.temperature_c, humidity: r.humidity_pct, tempPass: r.temp_pass, humidityPass: r.humidity_pass })),
      location,
      title: `Temperature & Humidity Compliance — ${location ? location.name : ''}`,
      numeratorLabel: 'Readings within both temperature and humidity range',
      denominatorLabel: 'Total readings taken that period',
      unit: `CSSD — ${location ? location.name : 'Storage Area'}`,
      rationale: `Confirms this storage area holds its validated range (${location ? `${location.temp_min}–${location.temp_max}°C, ${location.humidity_min}–${location.humidity_max}% RH` : 'standard range'}) per ANSI/AAMI ST108, protecting packaged sterile item integrity over time.`,
      inclusion: 'All readings logged for this location during the reporting period.',
      exclusion: 'None — every logged reading counts.',
      benchmark: location ? `${location.temp_min}–${location.temp_max}°C, ${location.humidity_min}–${location.humidity_max}% RH` : 'Standard range',
      target: '100%'
    };
  },

  // Average turnaround time (hours), not a pass/fail rate — numerator is
  // total hours across everything returned that month, denominator is how
  // many items that represents, so numerator/denominator reads as a real
  // average rather than a percentage. No fixed target exists to benchmark
  // against (same finding as equipment response times — this is locally
  // set, not an external standard), so benchmark/target stay open for
  // TCCH to fill in.
  async _computeInstrument(from, to, months, staffFilter) {
    let rows = await DB.listInstrumentMaintenance({ from, to, limit: 5000 });
    rows = rows.filter(r => r.status === 'Returned' && r.returned_at);
    if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter || r.returned_by_name === staffFilter);
    const monthly = months.map(m => {
      const monthRows = rows.filter(r => (r.returned_at || '').slice(0, 7) === m.key);
      const totalHours = monthRows.reduce((s, r) => s + Math.max(0, (new Date(r.returned_at) - new Date(r.created_at)) / 3600000), 0);
      return { key: m.key, label: m.label, numerator: +totalHours.toFixed(1), denominator: monthRows.length };
    });
    return {
      monthly,
      isAverage: true,  // tells the renderer this is hours-per-item, not a %
      title: 'Instrument Maintenance Turnaround Time',
      numeratorLabel: 'Total turnaround hours (sent out → returned)',
      denominatorLabel: 'Items returned that period',
      unit: 'CSSD — Instrument Maintenance',
      rationale: `Tracks how long instruments/sets are out for repair, rust removal, ultrasonic cleaning, or lubrication before returning to service.${staffFilter ? ` Filtered to entries logged or returned by ${staffFilter}.` : ''} No external standard sets a fixed target for this — benchmark and target are for TCCH to set based on department needs.`,
      inclusion: `All items marked Returned during the reporting period, measured from when they were sent out.${staffFilter ? ` Only entries logged or returned by ${staffFilter}.` : ''}`,
      exclusion: 'Items still marked "Out" (not yet returned) are excluded until a return is logged.',
      benchmark: '', target: ''
    };
  },

  async _computeEquipment(from, to, months, staffFilter) {
    const machineId = document.getElementById('rep-machine').value;

    if (machineId === 'ALL') {
      const allRows = await DB.listDowntimeLogs({ from, to, limit: 5000 });
      const rowsFiltered = staffFilter ? allRows.filter(r => r.staff_name === staffFilter) : allRows;
      const perDimension = [];
      for (const m of this._machines) {
        const rows = rowsFiltered.filter(r => r.machine_id === m.machine_id);
        const monthly = [];
        for (const mo of months) {
          const monthRows = rows.filter(r => (r.time_broken || '').slice(0, 7) === mo.key);
          const downMin = monthRows.reduce((sum, r) => sum + (UI.minutesBetween(r.time_broken, r.time_up || new Date().toISOString()) || 0), 0);
          const monthStart = mo.key + '-01';
          const monthEnd = mo.key + '-' + String(mo.days).padStart(2, '0');
          const workingDays = await WorkCalendar.workingDayCount(monthStart, monthEnd);
          const scheduledHours = workingDays * (m.scheduled_hours_per_day || 24);
          monthly.push({ key: mo.key, label: mo.label, numerator: +(downMin / 60).toFixed(1), denominator: +scheduledHours.toFixed(1) });
        }
        perDimension.push({ name: m.machine_id, monthly });
      }
      return {
        perDimension,
        title: 'Autoclave Unplanned Downtime Rate — All Machines',
        numeratorLabel: 'Total hours out of service', denominatorLabel: 'Total scheduled operating hours',
        unit: 'CSSD — All Equipment',
        rationale: `Compares reliability across every machine per TCCH-SPU-PROC-013 — shown side by side, never blended into one fleet average, so a chronically unreliable unit stays visible rather than hidden by the others.${staffFilter ? ` Filtered to incidents logged by ${staffFilter}.` : ''}`,
        inclusion: `All equipment downtime incidents within the reporting period.${staffFilter ? ` Only incidents logged by ${staffFilter}.` : ''}`,
        exclusion: 'None.',
        benchmark: 'Confirm against validated spec sheet', target: '≥ 99% uptime per machine'
      };
    }

    const machine = this._machines.find(m => m.machine_id === machineId);
    const scheduledHoursPerDay = machine ? machine.scheduled_hours_per_day : 24;
    const allRows = await DB.listDowntimeLogs({ from, to, limit: 5000 });
    let rows = allRows.filter(r => r.machine_id === machineId);
    if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter);

    const monthly = [];
    for (const m of months) {
      const monthRows = rows.filter(r => (r.time_broken || '').slice(0, 7) === m.key);
      const downMin = monthRows.reduce((sum, r) => sum + (UI.minutesBetween(r.time_broken, r.time_up || new Date().toISOString()) || 0), 0);
      const downHours = downMin / 60;
      const monthStart = m.key + '-01';
      const monthEnd = m.key + '-' + String(m.days).padStart(2, '0');
      const workingDays = await WorkCalendar.workingDayCount(monthStart, monthEnd);
      const scheduledHours = workingDays * scheduledHoursPerDay;
      monthly.push({ key: m.key, label: m.label, numerator: +downHours.toFixed(1), denominator: +scheduledHours.toFixed(1) });
    }

    // Secondary: MTBF across the whole range (chronological gaps between failures)
    const sorted = [...rows].sort((a, b) => a.time_broken.localeCompare(b.time_broken));
    let mtbfDays = null;
    if (sorted.length >= 2) {
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) gaps.push(UI.daysBetween(sorted[i-1].time_broken, sorted[i].time_broken));
      mtbfDays = +(gaps.reduce((a,b) => a+b, 0) / gaps.length).toFixed(1);
    }

    // Secondary: root cause split
    const causes = ['Mechanical Failure', 'BI/CI Failure - Quarantine', 'Scheduled PM Overrun', 'Other'];
    const rootCauseSplit = causes.map(c => ({ cause: c, count: rows.filter(r => r.root_cause_category === c).length }));
    const uncategorized = rows.filter(r => !r.root_cause_category).length;

    return {
      monthly,
      title: `Autoclave Unplanned Downtime Rate — ${machineId}`,
      numeratorLabel: 'Total hours out of service',
      denominatorLabel: 'Total scheduled operating hours (working days only — weekends and exceptions excluded)',
      unit: `CSSD — ${machine && machine.machine_type === 'ro' ? 'RO System' : machine && machine.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : machine && machine.machine_type === 'facility_equipment' ? 'Facility Equipment' : 'Autoclave'} (${machineId})`,
      rationale: `Monitors ${machineId} reliability per TCCH-SPU-PROC-013. Reported per machine — never averaged across machines — so a chronically unreliable unit isn't hidden by fleet averages. Scheduled hours exclude weekends and any logged holiday/closure exceptions, since CSSD doesn't operate those days.${staffFilter ? ` Filtered to incidents logged by ${staffFilter}.` : ''}`,
      inclusion: `All logged downtime incidents for ${machineId} within the reporting period.${staffFilter ? ` Only incidents logged by ${staffFilter}.` : ''}`,
      exclusion: 'Scheduled PM windows are included but categorized separately under root cause. Weekends and schedule exceptions are excluded from the denominator entirely.',
      benchmark: 'Set your own baseline in month one, then track trend',
      target: 'Lower is better — set an internal ceiling (e.g. ≤ X hours/month)',
      secondary: { mtbfDays, rootCauseSplit, uncategorized, incidentCount: rows.length }
    };
  },

  async _computeBrush(from, to, months, staffFilter) {
    let rows = await DB.listBrushLogs({ from, to, limit: 5000 });
    if (staffFilter) rows = rows.filter(r => r.staff_name === staffFilter);
    const activeBrushes = await DB.listActiveBrushes();
    const activeCount = Math.max(1, activeBrushes.length);

    const monthly = months.map(m => {
      const weeksInMonth = Math.ceil(m.days / 7);
      const monthRows = rows.filter(r => (r.log_date || '').slice(0, 7) === m.key);
      // Numerator: distinct (brush, ISO week) pairs logged that month
      const weekPairs = new Set(monthRows.map(r => r.brush_id + '_' + this._isoWeekOf(r.log_date)));
      const numerator = weekPairs.size;
      const denominator = weeksInMonth * activeCount;
      return { key: m.key, label: m.label, numerator, denominator };
    });

    const replacementByMonth = months.map(m => {
      const monthRows = rows.filter(r => (r.log_date || '').slice(0, 7) === m.key);
      const replaced = monthRows.filter(r => r.replaced || r.condition === 'Damaged').length;
      return { key: m.key, label: m.label, replaced, activeCount };
    });

    return {
      monthly,
      title: 'Brush Inspection Compliance Rate',
      numeratorLabel: 'Number of weekly brush inspections completed and logged',
      denominatorLabel: 'Number of (brush × week) inspections expected in the period',
      unit: 'CSSD — Decontamination Area',
      rationale: `A simple weekly task, not a clinical outcome with natural variation — this should always be at or near 100%, per TCCH-SPU-PROC-007.${staffFilter ? ` Filtered to entries logged by ${staffFilter}.` : ''}`,
      inclusion: `All brush log entries recorded during the reporting period, across all active brushes.${staffFilter ? ` Only entries logged by ${staffFilter}.` : ''}`,
      exclusion: 'Brushes deactivated/retired during the period are excluded from the week(s) after retirement.',
      benchmark: '100%',
      target: '100%',
      secondary: { replacementByMonth, activeCount }
    };
  },

  _isoWeekOf(dateStr) {
    const dt = new Date(dateStr + 'T00:00:00');
    const day = dt.getDay() || 7;
    if (day !== 1) dt.setDate(dt.getDate() - (day - 1));
    return UI.dateToStr(dt);
  },

  _renderResults() {
    const r = this._lastResult;

    if (r.kpiKey !== 'temp-humidity' && r.perDimension) {
      this._renderMultiSeriesResults(r);
      return;
    }

    const monthly = r.monthly || (r.perDimension ? this._blendMonthly(r.perDimension) : []);

    const table = document.getElementById('rep-table');
    const rateLabel = r.isAverage ? 'Avg (hrs)' : 'Rate (%)';
    const rateOf = (num, den) => den ? (r.isAverage ? (num / den).toFixed(1) : ((num / den) * 100).toFixed(1)) : '—';
    table.innerHTML = `
      <thead><tr><th>Month</th>${monthly.map(m => `<th>${m.label}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        <tr><td><strong>Numerator</strong></td>${monthly.map(m => `<td class="mono">${m.numerator}</td>`).join('')}<td class="mono"><strong>${monthly.reduce((s,m)=>s+m.numerator,0).toFixed ? monthly.reduce((s,m)=>s+m.numerator,0).toFixed(1) : monthly.reduce((s,m)=>s+m.numerator,0)}</strong></td></tr>
        <tr><td><strong>Denominator</strong></td>${monthly.map(m => `<td class="mono">${m.denominator}</td>`).join('')}<td class="mono"><strong>${monthly.reduce((s,m)=>s+m.denominator,0)}</strong></td></tr>
        <tr><td><strong>${rateLabel}</strong></td>${monthly.map(m => `<td class="mono">${rateOf(m.numerator, m.denominator)}</td>`).join('')}<td class="mono"><strong>${(() => { const n=monthly.reduce((s,m)=>s+m.numerator,0), d=monthly.reduce((s,m)=>s+m.denominator,0); return rateOf(n, d); })()}</strong></td></tr>
      </tbody>
    `;

    // Secondary metrics panel
    const sec = document.getElementById('rep-secondary');
    if (r.kpiKey === 'equipment' && r.secondary) {
      const s = r.secondary;
      sec.innerHTML = `
        <div class="section-title">Secondary metrics</div>
        <div class="kpi-grid">
          <div class="card kpi-card"><div class="label">Mean Time Between Failures</div><div class="value">${s.mtbfDays == null ? '—' : s.mtbfDays + ' days'}</div><div class="sub">${s.incidentCount} incident${s.incidentCount === 1 ? '' : 's'} in range</div></div>
        </div>
        <div class="table-wrap" style="margin-top:12px;"><table>
          <thead><tr><th>Root cause</th><th>Incidents</th></tr></thead>
          <tbody>
            ${s.rootCauseSplit.map(c => `<tr><td>${c.cause}</td><td class="mono">${c.count}</td></tr>`).join('')}
            <tr><td>Not yet categorized (open)</td><td class="mono">${s.uncategorized}</td></tr>
          </tbody>
        </table></div>
      `;
    } else if (r.kpiKey === 'brush' && r.secondary) {
      const s = r.secondary;
      sec.innerHTML = `
        <div class="section-title">Secondary metric — Brush Failure / Replacement Rate</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Month</th>${s.replacementByMonth.map(m => `<th>${m.label}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td>Brushes pulled (damaged/replaced)</td>${s.replacementByMonth.map(m => `<td class="mono">${m.replaced}</td>`).join('')}</tr>
            <tr><td>Rate (%)</td>${s.replacementByMonth.map(m => `<td class="mono">${((m.replaced / m.activeCount) * 100).toFixed(1)}</td>`).join('')}</tr>
          </tbody>
        </table></div>
      `;
    } else {
      sec.innerHTML = '';
    }

    const ctx = document.getElementById('rep-chart').getContext('2d');
    if (this._chart) this._chart.destroy();
    if (r.kpiKey === 'temp-humidity') {
      const groups = r.readingsByLocation || [{ name: r.location ? r.location.name : '', readings: r.readings }];
      const allDates = Array.from(new Set(groups.flatMap(g => g.readings.map(d => d.date)))).sort();
      const datasets = [];
      groups.forEach((g, i) => {
        const byDate = {}; g.readings.forEach(d => { byDate[d.date] = d; });
        const color = this._seriesColors[i % this._seriesColors.length];
        const suffix = groups.length > 1 ? ` — ${g.name}` : '';
        datasets.push({
          label: `Temperature (°C)${suffix}`, yAxisID: 'yTemp',
          data: allDates.map(d => byDate[d] ? byDate[d].temp : null),
          borderColor: color, backgroundColor: 'transparent', tension: 0.25, spanGaps: true,
          pointBackgroundColor: allDates.map(d => byDate[d] ? (byDate[d].tempPass ? color : '#8B0000') : color),
          pointRadius: allDates.map(d => byDate[d] && !byDate[d].tempPass ? 5 : 2)
        });
        datasets.push({
          label: `Humidity (%)${suffix}`, yAxisID: 'yHumidity',
          data: allDates.map(d => byDate[d] ? byDate[d].humidity : null),
          borderColor: color, backgroundColor: 'transparent', borderDash: [5, 3], tension: 0.25, spanGaps: true,
          pointBackgroundColor: allDates.map(d => byDate[d] ? (byDate[d].humidityPass ? color : '#8B0000') : color),
          pointRadius: allDates.map(d => byDate[d] && !byDate[d].humidityPass ? 5 : 2)
        });
      });
      this._chart = new Chart(ctx, {
        type: 'line',
        data: { labels: allDates.map(d => UI.fmtDate(d)), datasets },
        options: {
          responsive: true,
          scales: {
            yTemp: { type: 'linear', position: 'left', title: { display: true, text: '°C' } },
            yHumidity: { type: 'linear', position: 'right', title: { display: true, text: '% RH' }, grid: { drawOnChartArea: false } }
          },
          plugins: { legend: { display: true, position: 'bottom' } }
        }
      });
    } else {
      this._chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: monthly.map(m => m.label),
          datasets: [{
            label: r.isAverage ? 'Avg turnaround (hrs)' : 'Rate (%)',
            data: monthly.map(m => m.denominator ? +(r.isAverage ? (m.numerator/m.denominator) : (m.numerator/m.denominator)*100).toFixed(1) : null),
            borderColor: '#2F6B4F', backgroundColor: 'rgba(47,107,79,0.12)', tension: 0.3, fill: true, spanGaps: true
          }]
        },
        options: { responsive: true, scales: { y: { min: 0, max: (r.kpiKey === 'equipment' || r.isAverage) ? undefined : 100, ticks: r.isAverage ? {} : { callback: v => v + '%' } } }, plugins: { legend: { display: false } } }
      });
    }

    const setIfEmpty = (id, val) => { const elm = document.getElementById(id); if (!elm.value) elm.value = val; };
    setIfEmpty('f-title', r.title);
    setIfEmpty('f-unit', r.unit);
    setIfEmpty('f-rationale', r.rationale);
    setIfEmpty('f-inclusion', r.inclusion);
    setIfEmpty('f-exclusion', r.exclusion);
    setIfEmpty('f-benchmark', r.benchmark);
    setIfEmpty('f-target', r.target);
  },

  _seriesColors: ['#2F6B4F', '#1B6E78', '#C4432E', '#9D7295', '#F58C35', '#7F9F49', '#4A5FC1', '#B8860B'],

  // Blends multiple dimensions' monthly numerator/denominator into one
  // combined series — used only for temp-humidity's All Locations summary
  // table, where the detailed per-location breakdown lives in the chart
  // instead (unlike equipment/QA/RO, blending here doesn't hide an outlier
  // since the chart right below it already shows each location separately).
  _blendMonthly(perDimension) {
    const months = perDimension[0] ? perDimension[0].monthly.map(m => ({ key: m.key, label: m.label })) : [];
    return months.map((m, i) => ({
      key: m.key, label: m.label,
      numerator: perDimension.reduce((s, d) => s + d.monthly[i].numerator, 0),
      denominator: perDimension.reduce((s, d) => s + d.monthly[i].denominator, 0)
    }));
  },

  // "All X (compare)" reports — each dimension (machine/parameter) keeps
  // its own numbers, shown side by side, never blended into one figure
  // that could hide an underperforming outlier.
  _renderMultiSeriesResults(r) {
    const dims = r.perDimension;
    const months = dims[0] ? dims[0].monthly.map(m => m.label) : [];

    const table = document.getElementById('rep-table');
    table.innerHTML = `
      <thead><tr><th></th><th>Numerator (total)</th><th>Denominator (total)</th><th>Rate (%)</th></tr></thead>
      <tbody>
        ${dims.map(d => {
          const num = d.monthly.reduce((s, m) => s + m.numerator, 0);
          const den = d.monthly.reduce((s, m) => s + m.denominator, 0);
          const rate = den ? ((num / den) * 100).toFixed(1) : '—';
          return `<tr><td><strong>${UI.escapeHtml(d.name)}</strong></td><td class="mono">${num.toFixed ? num.toFixed(1) : num}</td><td class="mono">${den}</td><td class="mono">${rate}</td></tr>`;
        }).join('')}
      </tbody>
    `;

    document.getElementById('rep-secondary').innerHTML = '';

    const ctx = document.getElementById('rep-chart').getContext('2d');
    if (this._chart) this._chart.destroy();
    this._chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: dims.map((d, i) => ({
          label: d.name,
          data: d.monthly.map(m => m.denominator ? +((m.numerator / m.denominator) * 100).toFixed(1) : null),
          borderColor: this._seriesColors[i % this._seriesColors.length],
          backgroundColor: 'transparent',
          tension: 0.3,
          spanGaps: true
        }))
      },
      options: { responsive: true, scales: { y: { min: 0, ticks: { callback: v => v + '%' } } }, plugins: { legend: { display: true, position: 'bottom' } } }
    });

    const setIfEmpty = (id, val) => { const elm = document.getElementById(id); if (!elm.value) elm.value = val; };
    setIfEmpty('f-title', r.title);
    setIfEmpty('f-unit', r.unit);
    setIfEmpty('f-rationale', r.rationale);
    setIfEmpty('f-inclusion', r.inclusion);
    setIfEmpty('f-exclusion', r.exclusion);
    setIfEmpty('f-benchmark', r.benchmark);
    setIfEmpty('f-target', r.target);
  },

  async _downloadPdf() {
    if (!this._lastResult) { UI.toast('Generate a report first', true); return; }
    const r = this._lastResult;
    const cfg = window.APP_CONFIG;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 40;
    const val = (id) => document.getElementById(id).value;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(47, 107, 79);
    doc.text(cfg.HOSPITAL_NAME, margin, y);
    doc.setFontSize(9); doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal');
    doc.text(cfg.DEPARTMENT, margin, y + 14);
    doc.setTextColor(0,0,0); doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('KEY PERFORMANCE INDICATOR REPORT', pageW / 2, y + 40, { align: 'center' });
    y += 60;
    doc.setDrawColor(180, 180, 180); doc.line(margin, y, pageW - margin, y); y += 16;

    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 5 }, margin: { left: margin, right: margin },
      body: [
        ['Title', val('f-title')],
        ['Owner', val('f-owner')],
        ['Unit / Department', val('f-unit')],
        ['Reporting period', `${UI.fmtDate(r.from)} – ${UI.fmtDate(r.to)}`],
        ['Calculation — Numerator', r.numeratorLabel],
        ['Calculation — Denominator', r.denominatorLabel],
        ['Inclusion criteria', val('f-inclusion')],
        ['Exclusion criteria', val('f-exclusion')],
        ['Rationale', val('f-rationale')],
        ['Benchmark', val('f-benchmark')],
        ['Target', val('f-target')],
      ],
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130, fillColor: [235, 240, 238] }, 1: { cellWidth: pageW - margin*2 - 130 } }
    });
    y = doc.lastAutoTable.finalY + 16;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Data Aggregation & Analysis and Findings', margin, y); y += 8;
    if (r.perDimension) {
      doc.autoTable({
        startY: y + 4, theme: 'grid', styles: { fontSize: 8, cellPadding: 4, halign: 'center' }, margin: { left: margin, right: margin },
        head: [['', 'Numerator (total)', 'Denominator (total)', 'Rate (%)']],
        body: r.perDimension.map(d => {
          const num = d.monthly.reduce((s, m) => s + m.numerator, 0);
          const den = d.monthly.reduce((s, m) => s + m.denominator, 0);
          return [d.name, String(num.toFixed ? num.toFixed(1) : num), String(den), den ? ((num/den)*100).toFixed(1) : '—'];
        }),
        headStyles: { fillColor: [47, 107, 79], textColor: 255 }
      });
    } else {
      doc.autoTable({
        startY: y + 4, theme: 'grid', styles: { fontSize: 8, cellPadding: 4, halign: 'center' }, margin: { left: margin, right: margin },
        head: [['Month', ...r.monthly.map(m => m.label)]],
        body: [
          ['Numerator', ...r.monthly.map(m => String(m.numerator))],
          ['Denominator', ...r.monthly.map(m => String(m.denominator))],
          [r.isAverage ? 'Avg (hrs)' : 'Rate (%)', ...r.monthly.map(m => m.denominator ? (r.isAverage ? (m.numerator/m.denominator) : (m.numerator/m.denominator)*100).toFixed(1) : '—')]
        ],
        headStyles: { fillColor: [47, 107, 79], textColor: 255 }
      });
    }
    y = doc.lastAutoTable.finalY + 16;

    // Secondary metrics
    if (r.kpiKey === 'equipment' && r.secondary) {
      if (y > 600) { doc.addPage(); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('Secondary Metrics', margin, y); y += 8;
      doc.autoTable({
        startY: y + 4, theme: 'grid', styles: { fontSize: 8, cellPadding: 4 }, margin: { left: margin, right: margin },
        head: [['Root cause', 'Incidents']],
        body: [...r.secondary.rootCauseSplit.map(c => [c.cause, String(c.count)]), ['Not yet categorized (open)', String(r.secondary.uncategorized)]],
        foot: [['Mean Time Between Failures', r.secondary.mtbfDays == null ? '—' : r.secondary.mtbfDays + ' days']],
        headStyles: { fillColor: [27, 110, 120], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 16;
    } else if (r.kpiKey === 'brush' && r.secondary) {
      if (y > 600) { doc.addPage(); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('Secondary Metric — Brush Failure/Replacement Rate', margin, y); y += 8;
      doc.autoTable({
        startY: y + 4, theme: 'grid', styles: { fontSize: 8, cellPadding: 4, halign: 'center' }, margin: { left: margin, right: margin },
        head: [['Month', ...r.secondary.replacementByMonth.map(m => m.label)]],
        body: [
          ['Brushes pulled', ...r.secondary.replacementByMonth.map(m => String(m.replaced))],
          ['Rate (%)', ...r.secondary.replacementByMonth.map(m => ((m.replaced / m.activeCount) * 100).toFixed(1))]
        ],
        headStyles: { fillColor: [27, 110, 120], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 16;
    }

    if (y > 620) { doc.addPage(); y = 40; }
    const chartImg = document.getElementById('rep-chart').toDataURL('image/png', 1.0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Graphical Presentation', margin, y); y += 8;
    const imgW = pageW - margin * 2, imgH = imgW * 0.32;
    doc.addImage(chartImg, 'PNG', margin, y, imgW, imgH);
    y += imgH + 20;

    if (y > 650) { doc.addPage(); y = 40; }
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 6 }, margin: { left: margin, right: margin },
      body: [['Analysis and Findings', val('f-analysis') || '—'], ['Action Plan / Action Taken', val('f-action') || '—']],
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130, fillColor: [235, 240, 238] }, 1: { cellWidth: pageW - margin*2 - 130 } }
    });
    y = doc.lastAutoTable.finalY + 30;

    if (y > 700) { doc.addPage(); y = 60; }
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Responsible Person/Department:', margin, y);
    doc.text('Name: ' + (val('f-responsible') || '_______________________'), margin, y + 18);
    doc.text('Sign: _______________________', margin, y + 36);
    doc.text('Received by Quality & Patient Safety Office:', pageW/2 + 10, y);
    doc.text('Name: _______________________', pageW/2 + 10, y + 18);
    doc.text('Sign: _______________________', pageW/2 + 10, y + 36);

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
      doc.text(`${cfg.FORM_CODE}  ·  ${cfg.FORM_VERSION}  ·  Generated ${UI.fmtDate(UI.todayStr())}`, margin, doc.internal.pageSize.getHeight() - 20);
    }

    doc.save(`KPI_Report_${val('f-title').replace(/\s+/g,'_')}_${r.from}_to_${r.to}.pdf`);
    UI.toast('PDF downloaded');
  },

  _buildReportHtml() {
    const r = this._lastResult;
    const cfg = window.APP_CONFIG;
    const val = (id) => document.getElementById(id).value;
    const esc = (s) => UI.escapeHtml(s == null ? '' : s);

    const fieldRow = (label, value) => `<tr><td class="lbl">${esc(label)}</td><td>${value && String(value).trim() ? esc(value) : '—'}</td></tr>`;

    let html = `<div class="head"><div class="org">${esc(cfg.HOSPITAL_NAME)}</div><div class="orgsub">${esc(cfg.DEPARTMENT)}</div><h1>KEY PERFORMANCE INDICATOR REPORT</h1></div>`;
    html += `<table class="meta">`;
    html += fieldRow('Title', val('f-title'));
    html += fieldRow('Owner', val('f-owner'));
    html += fieldRow('Unit / Department', val('f-unit'));
    html += fieldRow('Staff filter', r.staffFilter || 'All staff (department)');
    html += fieldRow('Reporting period', `${UI.fmtDate(r.from)} – ${UI.fmtDate(r.to)}`);
    html += fieldRow('Numerator', r.numeratorLabel);
    html += fieldRow('Denominator', r.denominatorLabel);
    html += fieldRow('Inclusion criteria', val('f-inclusion'));
    html += fieldRow('Exclusion criteria', val('f-exclusion'));
    html += fieldRow('Rationale', val('f-rationale'));
    html += fieldRow('Benchmark', val('f-benchmark'));
    html += fieldRow('Target', val('f-target'));
    html += `</table>`;

    html += `<h2>Data Aggregation &amp; Analysis and Findings</h2>`;
    if (r.perDimension) {
      html += `<table class="data"><tr><th></th><th>Numerator (total)</th><th>Denominator (total)</th><th>Rate (%)</th></tr>`;
      html += r.perDimension.map(d => {
        const num = d.monthly.reduce((s, m) => s + m.numerator, 0);
        const den = d.monthly.reduce((s, m) => s + m.denominator, 0);
        return `<tr><td>${esc(d.name)}</td><td>${num.toFixed ? num.toFixed(1) : num}</td><td>${den}</td><td>${den ? ((num/den)*100).toFixed(1) : '—'}</td></tr>`;
      }).join('');
      html += `</table>`;
    } else {
      html += `<table class="data"><tr><th>Month</th>${r.monthly.map(m => `<th>${esc(m.label)}</th>`).join('')}</tr>`;
      html += `<tr><td>Numerator</td>${r.monthly.map(m => `<td>${m.numerator}</td>`).join('')}</tr>`;
      html += `<tr><td>Denominator</td>${r.monthly.map(m => `<td>${m.denominator}</td>`).join('')}</tr>`;
      html += `<tr><td>${r.isAverage ? 'Avg (hrs)' : 'Rate (%)'}</td>${r.monthly.map(m => `<td>${m.denominator ? (r.isAverage ? (m.numerator/m.denominator) : (m.numerator/m.denominator)*100).toFixed(1) : '—'}</td>`).join('')}</tr></table>`;
    }

    if (r.kpiKey === 'equipment' && r.secondary) {
      html += `<h2>Secondary Metrics</h2>`;
      html += `<table class="data"><tr><th>Root cause</th><th>Incidents</th></tr>`;
      html += r.secondary.rootCauseSplit.map(c => `<tr><td>${esc(c.cause)}</td><td>${c.count}</td></tr>`).join('');
      html += `<tr><td>Not yet categorized (open)</td><td>${r.secondary.uncategorized}</td></tr></table>`;
      html += `<p><strong>Mean Time Between Failures:</strong> ${r.secondary.mtbfDays == null ? '—' : r.secondary.mtbfDays + ' days'}</p>`;
    } else if (r.kpiKey === 'brush' && r.secondary) {
      html += `<h2>Secondary Metric — Brush Failure/Replacement Rate</h2>`;
      html += `<table class="data"><tr><th>Month</th>${r.secondary.replacementByMonth.map(m => `<th>${esc(m.label)}</th>`).join('')}</tr>`;
      html += `<tr><td>Brushes pulled</td>${r.secondary.replacementByMonth.map(m => `<td>${m.replaced}</td>`).join('')}</tr>`;
      html += `<tr><td>Rate (%)</td>${r.secondary.replacementByMonth.map(m => `<td>${((m.replaced/m.activeCount)*100).toFixed(1)}</td>`).join('')}</tr></table>`;
    }

    html += `<table class="meta">${fieldRow('Analysis and Findings', val('f-analysis'))}${fieldRow('Action Plan / Action Taken', val('f-action'))}</table>`;
    html += `<p>Responsible Person/Department: <strong>${esc(val('f-responsible') || '—')}</strong> &nbsp; Sign: ________________________</p>`;
    html += `<p>Received by Quality &amp; Patient Safety Office: __________________ &nbsp; Sign: ________________________</p>`;
    html += `<p class="foot">${esc(cfg.FORM_CODE)} · ${esc(cfg.FORM_VERSION)} · Generated ${UI.fmtDate(UI.todayStr())}</p>`;
    return html;
  },

  _downloadWord() {
    if (!this._lastResult) { UI.toast('Generate a report first', true); return; }
    const bodyHtml = this._buildReportHtml();
    const css = `
      body{font-family:Calibri,Arial,sans-serif;color:#16241E;font-size:11pt;}
      .head{text-align:center;margin-bottom:16pt;}
      .org{font-size:16pt;font-weight:800;color:#2F6B4F;letter-spacing:1pt;}
      .orgsub{font-size:9pt;letter-spacing:1pt;color:#5B6E70;margin-bottom:8pt;}
      .head h1{font-size:14pt;font-weight:800;border-top:2pt solid #16241E;border-bottom:2pt solid #16241E;padding:6pt 0;margin-top:6pt;}
      table{border-collapse:collapse;width:100%;margin-bottom:14pt;}
      table.meta td{border:1pt solid #16241E;padding:5pt 8pt;font-size:10pt;vertical-align:top;}
      table.meta td.lbl{font-weight:700;width:32%;background:#EBF0EE;}
      table.data th,table.data td{border:1pt solid #16241E;padding:4pt 6pt;text-align:center;font-size:9.5pt;}
      table.data td:first-child,table.data th:first-child{text-align:left;}
      h2{font-size:12pt;margin:14pt 0 6pt;}
      .foot{margin-top:20pt;font-size:8pt;color:#5B6E70;}
    `;
    const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
      + '<head><meta charset="utf-8"><title>KPI Report</title>'
      + '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->'
      + `<style>@page{size:21cm 29.7cm;margin:1.8cm;} ${css}</style></head>`
      + `<body>${bodyHtml}</body></html>`;
    const blob = new Blob(['\ufeff' + doc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (document.getElementById('f-title').value || 'KPI_Report').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
    a.href = url; a.download = safeTitle + '.doc';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    UI.toast('Word document downloaded');
  }
};

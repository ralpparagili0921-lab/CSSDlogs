// ============================================================
// DTR IMPORT — GreatDay monthly attendance export. Parses the real
// export columns (Employee, Date, Day Type, Status, Others Status,
// Remark), lets the superuser confirm which CSSD staff account each
// GreatDay name maps to, stores the result, and produces a
// reconciliation report: for each schedule-driven logbook (RO, QA,
// Temp/Humidity, Housekeeping — Equipment/Instrument/Cycle/Handover
// are event-driven and correctly excluded), re-walk every expected
// occurrence in the uploaded period and check it against who the DTR
// shows was actually on duty, not just the nominal assignee.
//
// Holiday handling: HLDY/LEGALHD in Others Status only excuses a miss
// if the DTR shows *nobody* present that day — if anyone was on duty,
// the requirement still stands regardless of the holiday flag.
// ============================================================

const DtrImport = {
  _parsedRows: [],       // raw parsed rows from the file
  _uniqueNames: [],       // distinct Employee values found
  _nameMatches: {},       // { rawName: staffId | null }
  _staff: [],

  async render() {
    const panel = document.getElementById('dtr-import-panel');
    try { this._staff = await DB.listActiveStaff(); } catch (e) { this._staff = []; }
    panel.innerHTML = `
      <div class="hint" style="margin-bottom:14px;">Upload the monthly GreatDay attendance export (.xlsx). This retroactively reconciles RO, QA, Temperature &amp; Humidity, and Housekeeping against who was actually on duty — Equipment Downtime, Instrument Maintenance, Cycle Log, and Handover are event-driven and aren't affected by this.</div>
      <input type="file" id="dtr-file-input" accept=".xlsx,.xls">
      <div id="dtr-parse-status" style="margin-top:12px;"></div>
      <div id="dtr-match-section"></div>
      <div id="dtr-reconcile-section"></div>
    `;
    document.getElementById('dtr-file-input').addEventListener('change', (e) => this._handleFile(e.target.files[0]));
  },

  async _handleFile(file) {
    if (!file) return;
    const status = document.getElementById('dtr-parse-status');
    status.innerHTML = `<div class="hint">Reading…</div>`;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });

      this._parsedRows = rows.map(r => ({
        employee: String(r['Employee'] || '').trim(),
        date: this._normalizeDate(r['Date']),
        dayType: String(r['Day Type'] || '').trim(),
        status: String(r['Status'] || '').trim(),
        othersStatus: String(r['Others Status'] || '').trim(),
        remark: String(r['Remark'] || '').trim()
      })).filter(r => r.employee && r.date);

      if (this._parsedRows.length === 0) {
        status.innerHTML = `<div class="hint" style="color:var(--red);">No usable rows found — check this is the right export (needs Employee, Date, Day Type, Status, Others Status columns).</div>`;
        return;
      }

      this._uniqueNames = Array.from(new Set(this._parsedRows.map(r => r.employee))).sort();
      const dates = this._parsedRows.map(r => r.date).sort();
      status.innerHTML = `<div class="hint">Parsed ${this._parsedRows.length} rows, ${this._uniqueNames.length} people, ${dates[0]} to ${dates[dates.length - 1]}.</div>`;
      this._renderMatchSection();
    } catch (e) {
      status.innerHTML = `<div class="hint" style="color:var(--red);">Couldn't read this file: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  _normalizeDate(v) {
    if (!v) return null;
    if (v instanceof Date) return UI.dateToStr(v);
    // Fallback for date-as-text formats (e.g. "08/01/2026")
    const d = new Date(v);
    return isNaN(d) ? null : UI.dateToStr(d);
  },

  // Simple case-insensitive substring pre-match to save clicks — the
  // superuser still confirms every mapping before anything is saved.
  _guessMatch(rawName) {
    const norm = rawName.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const hit = this._staff.find(s => {
      const sNorm = s.name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      return sNorm === norm || norm.includes(sNorm) || sNorm.includes(norm);
    });
    return hit ? hit.id : '';
  },

  _renderMatchSection() {
    const wrap = document.getElementById('dtr-match-section');
    this._uniqueNames.forEach(name => { if (!(name in this._nameMatches)) this._nameMatches[name] = this._guessMatch(name); });
    wrap.innerHTML = `
      <div class="section-title">Match staff <span class="hint" style="font-weight:400;">confirm each GreatDay name before importing</span></div>
      <div class="card card-pad">
        ${this._uniqueNames.map(name => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
            <span>${UI.escapeHtml(name)}</span>
            <select data-match="${UI.escapeHtml(name)}" style="width:220px;">
              <option value="">— Not a CSSD account —</option>
              ${this._staff.map(s => `<option value="${s.id}" ${this._nameMatches[name] === s.id ? 'selected' : ''}>${UI.escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="dtr-import-btn">Import &amp; Reconcile</button></div>
      </div>
    `;
    wrap.querySelectorAll('[data-match]').forEach(sel => sel.addEventListener('change', () => { this._nameMatches[sel.dataset.match] = sel.value || null; }));
    document.getElementById('dtr-import-btn').addEventListener('click', () => this._importAndReconcile());
  },

  async _importAndReconcile() {
    const btn = document.getElementById('dtr-import-btn');
    await UI.withLoading(btn, async () => {
      try {
        const dates = this._parsedRows.map(r => r.date).sort();
        const from = dates[0], to = dates[dates.length - 1];
        const records = this._parsedRows.map(r => {
          const othersUpper = r.othersStatus.toUpperCase();
          return {
            staff_id: this._nameMatches[r.employee] || null,
            employee_name_raw: r.employee,
            log_date: r.date,
            day_type: r.dayType || null,
            status: r.status || null,
            others_status: r.othersStatus || null,
            is_holiday: othersUpper.includes('HLDY') || othersUpper.includes('LEGALHD'),
            is_present: r.status === 'PRS',
            remark: r.remark || null,
            uploaded_by_id: Auth.currentStaff.id
          };
        });
        const result = await DB.replaceDtrRecords(records, from, to);
        UI.toast(`Imported ${result.inserted} records — running reconciliation…`);
        await this._runReconciliation(from, to);
      } catch (e) { UI.toast('Import failed: ' + e.message, true); }
    });
  },

  // ---------------- Reconciliation ----------------
  async _runReconciliation(from, to) {
    const wrap = document.getElementById('dtr-reconcile-section');
    wrap.innerHTML = `<div class="hint">Reconciling…</div>`;
    try {
      const dtr = await DB.listDtrRecords({ from, to });
      const dtrByDate = {};
      dtr.forEach(r => { (dtrByDate[r.log_date] = dtrByDate[r.log_date] || []).push(r); });
      const presentOn = (date) => (dtrByDate[date] || []).filter(r => r.is_present);
      const isHolidayOn = (date) => (dtrByDate[date] || []).some(r => r.is_holiday);
      const weekdayOf = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      const datesInRange = [];
      for (let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
        datesInRange.push(UI.dateToStr(d));
      }
      const weekdays = datesInRange.filter(d => !['Saturday', 'Sunday'].includes(weekdayOf(d)));

      const findings = [];

      // Temperature & Humidity — daily Mon-Fri, per location
      const thLogs = await DB.listTempHumidityLogs({ from, to, limit: 2000 });
      const locations = await DB.listTempHumidityLocations(true);
      weekdays.forEach(d => {
        locations.forEach(loc => {
          const logged = thLogs.some(r => r.location_id === loc.id && r.log_date === d);
          if (logged) return;
          const present = presentOn(d);
          if (present.length === 0 && isHolidayOn(d)) return; // excused
          findings.push({ date: d, logbook: 'Temp/Humidity', detail: loc.name, present });
        });
      });

      // Housekeeping — Mon-Fri + Sunday, Saturday covers Sunday
      const hkLogs = await DB.listHousekeepingLogs({ from, to, limit: 2000 });
      datesInRange.forEach(d => {
        const wd = weekdayOf(d);
        if (wd === 'Saturday') return; // not required, doesn't need checking
        if (wd === 'Sunday') {
          const satDate = UI.dateToStr(new Date(new Date(d + 'T00:00:00').getTime() - 86400000));
          if (hkLogs.some(r => r.log_date === satDate)) return; // Saturday covered it
        }
        const logged = hkLogs.some(r => r.log_date === d);
        if (logged) return;
        const present = presentOn(d);
        if (present.length === 0 && isHolidayOn(d)) return;
        findings.push({ date: d, logbook: 'Housekeeping', detail: '', present });
      });

      // QA Testing — per-machine weekly, satisfied by BI+Dummy anytime that week by anyone present
      const machines = (await DB.listAllMachines()).filter(m => m.qa_schedule_day);
      const qaTests = (await DB.listQaTests({ from, to, limit: 5000 })).filter(r => !(r.test_type === 'BI' && r.cycle_id));
      const weeksSeen = new Set();
      weekdays.forEach(d => { weeksSeen.add(this._isoWeekStart(d)); });
      Array.from(weeksSeen).sort().forEach(weekStart => {
        const weekEnd = UI.dateToStr(new Date(new Date(weekStart + 'T00:00:00').getTime() + 6 * 86400000));
        machines.forEach(m => {
          const inWeek = qaTests.filter(r => r.machine_id === m.machine_id && r.date_of_test >= weekStart && r.date_of_test <= weekEnd);
          const satisfied = inWeek.some(r => r.test_type === 'BI') && inWeek.some(r => r.test_type === 'Dummy');
          if (satisfied) return;
          const weekDates = datesInRange.filter(d => d >= weekStart && d <= weekEnd);
          const anyonePresent = weekDates.some(d => presentOn(d).length > 0);
          const allHoliday = weekDates.every(d => isHolidayOn(d) || presentOn(d).length === 0);
          if (!anyonePresent && allHoliday) return;
          const presentThatWeek = weekDates.flatMap(d => presentOn(d));
          findings.push({ date: weekStart + ' (week)', logbook: 'QA Testing', detail: `${m.machine_id} — BI+Dummy`, present: presentThatWeek });
        });
      });

      // RO — per-parameter weekly, satisfied by anyone present within the relevant window
      const roParams = (await DB.listRoParameters(true)).filter(p => p.schedule_frequency === 'weekly');
      const roLogs = await DB.listRoLogs({ from, to, limit: 5000 });
      Array.from(weeksSeen).sort().forEach(weekStart => {
        const weekEnd = UI.dateToStr(new Date(new Date(weekStart + 'T00:00:00').getTime() + 6 * 86400000));
        roParams.forEach(p => {
          const inWeek = roLogs.filter(r => r.log_date >= weekStart && r.log_date <= weekEnd);
          const satisfied = inWeek.some(r => (r.readings || []).some(rd => rd.name === p.name));
          if (satisfied) return;
          const weekDates = datesInRange.filter(d => d >= weekStart && d <= weekEnd);
          const anyonePresent = weekDates.some(d => presentOn(d).length > 0);
          const allExcused = weekDates.every(d => isHolidayOn(d) || presentOn(d).length === 0);
          if (!anyonePresent && allExcused) return;
          findings.push({ date: weekStart + ' (week)', logbook: 'RO Water Quality', detail: p.name, present: weekDates.flatMap(d => presentOn(d)) });
        });
      });

      this._renderFindings(findings, from, to);
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Reconciliation failed: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  _isoWeekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as week start
    d.setDate(d.getDate() + diff);
    return UI.dateToStr(d);
  },

  _renderFindings(findings, from, to) {
    const wrap = document.getElementById('dtr-reconcile-section');
    if (findings.length === 0) {
      wrap.innerHTML = `<div class="section-title">Reconciliation — ${from} to ${to}</div><div class="card card-pad" style="color:var(--green);font-weight:600;">Fully caught up for this period — nothing genuinely missed once actual attendance is accounted for.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="section-title">Reconciliation — ${from} to ${to} <span class="count">${findings.length} genuine miss${findings.length === 1 ? '' : 'es'}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Logbook</th><th>Detail</th><th>Who was actually on duty</th></tr></thead>
        <tbody>
          ${findings.map(f => `
            <tr class="pending-highlight">
              <td>${UI.escapeHtml(f.date)}</td>
              <td>${UI.escapeHtml(f.logbook)}</td>
              <td>${UI.escapeHtml(f.detail)}</td>
              <td>${f.present.length ? f.present.map(p => UI.escapeHtml(p.employee_name_raw)).join(', ') : '<span class="hint">nobody per DTR — flagged for review</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
  }
};

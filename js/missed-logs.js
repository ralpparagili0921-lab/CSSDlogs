// ============================================================
// MISSED LOGS — shown as a banner on the login screen (general,
// today-only) and as a personal compliance panel once someone is
// logged in (their own history, only for logbooks they're the
// default assignee for). Weekends and schedule exceptions
// (holidays/breaks/closures) are never counted as missed.
// ============================================================

const LOGBOOK_LABELS = {
  ro: 'RO Water Quality',
  equipment: 'Equipment Downtime',
  cycles: 'Sterilization Cycle Log',
  qa: 'QA Testing Log',
  brush: 'Cleaning Brush',
  instrument: 'Instrument Maintenance',
  handover: 'Instrument/Supplies Handover',
  'temp-humidity-am': 'Temperature & Humidity (AM reading)',
  'temp-humidity-pm': 'Temperature & Humidity (PM reading)',
  housekeeping: 'CSSD Housekeeping'
};

const MissedLogs = {
  _isoWeekStart(d) {
    const dt = new Date(d);
    const day = dt.getDay() || 7;
    if (day !== 1) dt.setDate(dt.getDate() - (day - 1));
    dt.setHours(0, 0, 0, 0);
    return dt;
  },

  // ---------------- Login-screen banner (today only, everyone) ----------------
  async compute() {
    const items = [];
    const today = UI.todayStr();
    const todayWeekday = new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    const isException = await WorkCalendar.isException(today);
    const isNormalWorkingDay = !isException && todayWeekday !== 'Saturday' && todayWeekday !== 'Sunday';

    let assignments = {};
    try {
      const rows = await DB.listAssignments();
      rows.filter(r => r.priority_rank === 1).forEach(r => { assignments[r.logbook] = r.staff?.name || null; });
    } catch (e) { /* optional */ }

    if (isNormalWorkingDay) {

    try {
      const params = await DB.listRoParameters(true);
      const dueToday = params.filter(p => p.schedule_frequency === 'daily' || (p.schedule_frequency === 'weekly' && p.schedule_day === todayWeekday));
      if (dueToday.length > 0) {
        const roToday = await DB.listRoLogs({ from: today, to: today });
        const testedToday = new Set();
        roToday.forEach(r => (r.readings || []).forEach(rd => testedToday.add(rd.parameter_id)));
        const missing = dueToday.filter(p => !testedToday.has(p.id));
        if (missing.length > 0) {
          items.push({
            type: 'ro',
            message: `RO parameters due today not yet logged: ${missing.map(p => p.name).join(', ')}.`,
            assigned: assignments.ro
          });
        }
      }
    } catch (e) { /* ignore */ }

    try {
      const allMachines = await DB.listAllMachines();
      const biMachines = allMachines.filter(m => m.qa_schedule_day);
      const dummyMachines = allMachines.filter(m => (m.applicable_tests || []).includes('Dummy'));
      if (biMachines.length > 0 || dummyMachines.length > 0) {
        const dayIndex = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
        const todayIndex = dayIndex[todayWeekday];
        const weekStart = this._isoWeekStart(new Date()).toISOString().slice(0, 10);
        const qaThisWeek = await DB.listQaTests({ from: weekStart, to: today, limit: 2000 });
        // Implant-load BI tests (tied to a specific cycle) are event-driven,
        // not calendar-scheduled — they don't count toward, and aren't
        // held to, this machine's weekly BI schedule.
        const scheduledTests = qaThisWeek.filter(r => !(r.test_type === 'BI' && r.cycle_id));

        // BI — weekly, on each machine's own scheduled day.
        const biDueOrLate = [], biLate = [];
        biMachines.forEach(m => {
          const scheduledIndex = dayIndex[m.qa_schedule_day];
          if (todayIndex === undefined || scheduledIndex === undefined || todayIndex < scheduledIndex) return; // not this machine's week yet
          const hasBI = scheduledTests.some(r => r.machine_id === m.machine_id && r.test_type === 'BI');
          if (hasBI) return;
          if (todayIndex === scheduledIndex) biDueOrLate.push(m.machine_id);
          else biLate.push(m.machine_id);
        });
        if (biDueOrLate.length > 0) items.push({ type: 'qa', message: `BI testing scheduled today (${todayWeekday}): ${biDueOrLate.join(', ')}.`, assigned: assignments.qa });
        if (biLate.length > 0) items.push({ type: 'qa', message: `BI testing is now LATE — past this machine's scheduled day: ${biLate.join(', ')}.`, assigned: assignments.qa });

        // Dummy/CI — daily, every working day, genuinely different
        // cadence from BI (confirmed with user), not tied to the
        // machine's weekly BI schedule day at all.
        if (todayIndex !== undefined) {
          const dummyMissingToday = dummyMachines.filter(m => !scheduledTests.some(r => r.machine_id === m.machine_id && r.test_type === 'Dummy' && r.date_of_test === today)).map(m => m.machine_id);
          if (dummyMissingToday.length > 0) items.push({ type: 'qa', message: `Dummy pack testing not yet logged today: ${dummyMissingToday.join(', ')}.`, assigned: assignments.qa });
        }
      }
    } catch (e) { /* ignore */ }

      try {
        const weekStart = this._isoWeekStart(new Date()).toISOString().slice(0, 10);
        const [brushes, logs] = await Promise.all([
          DB.listActiveBrushes(),
          DB.listBrushLogs({ from: weekStart, to: today, limit: 500 })
        ]);
        const loggedIds = new Set(logs.map(l => l.brush_id));
        const missing = brushes.filter(b => !loggedIds.has(b.brush_id));
        if (missing.length > 0) {
          items.push({
            type: 'brush',
            message: `${missing.length} brush${missing.length > 1 ? 'es' : ''} not yet inspected this week (${missing.map(b => b.brush_id).join(', ')}).`,
            assigned: assignments.brush
          });
        }
      } catch (e) { /* ignore */ }

      try {
        const locations = await DB.listTempHumidityLocations(true);
        const thToday = await DB.listTempHumidityLogs({ from: today, to: today, limit: 500 });
        // AM/PM split by the log's actual time, not just whether any
        // reading exists today — matches the two separate scheduled
        // windows (and their separate assigned staff) this logbook now has.
        const loggedAmIds = new Set(thToday.filter(r => (r.log_time || '') < '12:00:00').map(r => r.location_id));
        const loggedPmIds = new Set(thToday.filter(r => (r.log_time || '') >= '12:00:00').map(r => r.location_id));
        const missingAm = locations.filter(l => !loggedAmIds.has(l.id));
        const missingPm = locations.filter(l => !loggedPmIds.has(l.id));
        if (missingAm.length > 0) {
          items.push({
            type: 'temp-humidity-am',
            message: `Temperature & Humidity (AM reading) not yet logged today for: ${missingAm.map(l => l.name).join(', ')}.`,
            assigned: assignments['temp-humidity-am']
          });
        }
        if (missingPm.length > 0) {
          items.push({
            type: 'temp-humidity-pm',
            message: `Temperature & Humidity (PM reading) not yet logged today for: ${missingPm.map(l => l.name).join(', ')}.`,
            assigned: assignments['temp-humidity-pm']
          });
        }
      } catch (e) { /* ignore */ }
    }

    // Housekeeping — Monday-Friday plus Sunday, but a Saturday cleaning
    // covers that week's Sunday, so Sunday isn't flagged if Saturday's
    // already logged. Checked independently of the working-day gate above
    // since Sunday isn't a normal working day but can still be expected here.
    try {
      const housekeepingDue = !isException && (isNormalWorkingDay || todayWeekday === 'Sunday');
      if (housekeepingDue) {
        let sundayCovered = false;
        if (todayWeekday === 'Sunday') {
          const yesterday = UI.daysAgoStr(1);
          const satLogs = await DB.listHousekeepingLogs({ from: yesterday, to: yesterday, limit: 5 });
          sundayCovered = satLogs.length > 0;
        }
        if (!sundayCovered) {
          const hkToday = await DB.listHousekeepingLogs({ from: today, to: today, limit: 5 });
          if (hkToday.length === 0) {
            items.push({ type: 'housekeeping', message: 'CSSD Housekeeping checklist has not been logged today.', assigned: assignments.housekeeping });
          }
        }
      }
    } catch (e) { /* ignore */ }

    try {
      const open = await DB.listOpenDowntimeLogs();
      if (open.length > 0) {
        items.push({
          type: 'equipment',
          message: `${open.length} equipment incident${open.length > 1 ? 's' : ''} still open (${open.map(o => o.machine_id).join(', ')}).`,
          assigned: assignments.equipment
        });
      }
    } catch (e) { /* ignore */ }

    return items;
  },

  // ---------------- Personal compliance (logged-in user, lookback window) ----------------
  // Only checks logbooks where this person is the default assignee —
  // shared logbooks (cycle log, brush, instrument maintenance) don't
  // have one individually-responsible person, so they're not tracked here.
  async computePersonal(staffId, lookbackDays = 30) {
    const to = UI.todayStr();
    const from = UI.daysAgoStr(lookbackDays);

    let assignments = [];
    try { assignments = await DB.listAssignments(); } catch (e) { return { missed: [], compliancePct: null, totalExpected: 0, totalLogged: 0 }; }

    const myLogbooks = assignments.filter(a => a.staff_id === staffId).map(a => a.logbook);
    if (myLogbooks.length === 0) return { missed: [], compliancePct: null, totalExpected: 0, totalLogged: 0 };

    const workingDays = await WorkCalendar.workingDaysBetween(from, to);
    if (workingDays.length === 0) return { missed: [], compliancePct: null, totalExpected: 0, totalLogged: 0 };
    const weekdayOf = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });

    const missed = [];
    let totalExpected = 0, totalLogged = 0;

    if (myLogbooks.includes('ro')) {
      let params = [];
      try { params = (await DB.listRoParameters(true)); } catch (e) { params = []; }
      const rows = await DB.listRoLogs({ from, to, limit: 5000 });
      // Build a lookup: parameter_id -> set of dates it was actually tested on
      const testedDatesByParam = {};
      rows.forEach(r => (r.readings || []).forEach(rd => {
        (testedDatesByParam[rd.parameter_id] = testedDatesByParam[rd.parameter_id] || new Set()).add(r.log_date);
      }));

      const monthKey = (d) => d.slice(0, 7);
      const quarterKey = (d) => `${d.slice(0, 4)}-Q${Math.floor((parseInt(d.slice(5, 7), 10) - 1) / 3) + 1}`;
      const periodsSeen = { monthly: new Set(), quarterly: new Set() };
      workingDays.forEach(d => { periodsSeen.monthly.add(monthKey(d)); periodsSeen.quarterly.add(quarterKey(d)); });

      params.forEach(p => {
        const tested = testedDatesByParam[p.id] || new Set();
        if (p.schedule_frequency === 'daily') {
          workingDays.forEach(day => {
            totalExpected++;
            if (tested.has(day)) totalLogged++;
            else missed.push({ date: day, logbook: 'ro', label: `${LOGBOOK_LABELS.ro} — ${p.name}` });
          });
        } else if (p.schedule_frequency === 'weekly') {
          workingDays.filter(d => weekdayOf(d) === p.schedule_day).forEach(day => {
            totalExpected++;
            if (tested.has(day)) totalLogged++;
            else missed.push({ date: day, logbook: 'ro', label: `${LOGBOOK_LABELS.ro} — ${p.name}` });
          });
        } else if (p.schedule_frequency === 'monthly') {
          Array.from(periodsSeen.monthly).sort().forEach(period => {
            totalExpected++;
            const hit = Array.from(tested).some(d => monthKey(d) === period);
            if (hit) totalLogged++;
            else missed.push({ date: period + '-28', logbook: 'ro', label: `${LOGBOOK_LABELS.ro} — ${p.name} (${period})` });
          });
        } else if (p.schedule_frequency === 'quarterly') {
          Array.from(periodsSeen.quarterly).sort().forEach(period => {
            totalExpected++;
            const hit = Array.from(tested).some(d => quarterKey(d) === period);
            if (hit) totalLogged++;
            else missed.push({ date: to, logbook: 'ro', label: `${LOGBOOK_LABELS.ro} — ${p.name} (${period})` });
          });
        }
      });
    }

    if (myLogbooks.includes('qa')) {
      let machines = [];
      try { machines = await DB.listAllMachines(); } catch (e) { machines = []; }
      const rows = (await DB.listQaTests({ from, to, limit: 5000 })).filter(r => !(r.test_type === 'BI' && r.cycle_id));
      const byMachine = {};
      rows.forEach(r => { (byMachine[r.machine_id] = byMachine[r.machine_id] || []).push(r); });

      // BI — weekly, on each machine's own scheduled day.
      machines.filter(m => m.qa_schedule_day).forEach(m => {
        const dueDays = workingDays.filter(d => weekdayOf(d) === m.qa_schedule_day);
        dueDays.forEach(day => {
          totalExpected++;
          const weekEnd = new Date(day); weekEnd.setDate(weekEnd.getDate() + 6);
          const inWeek = (byMachine[m.machine_id] || []).filter(r => r.date_of_test >= day && r.date_of_test <= weekEnd.toISOString().slice(0, 10));
          if (inWeek.some(r => r.test_type === 'BI')) totalLogged++;
          else missed.push({ date: day, logbook: 'qa', label: `${LOGBOOK_LABELS.qa} — ${m.machine_id} (BI)`, machineId: m.machine_id });
        });
      });

      // Dummy/CI — daily, every working day, for any machine that
      // offers it — genuinely different cadence from BI, not tied to
      // the same single weekly qa_schedule_day.
      machines.filter(m => (m.applicable_tests || []).includes('Dummy')).forEach(m => {
        workingDays.forEach(day => {
          totalExpected++;
          const onDay = (byMachine[m.machine_id] || []).some(r => r.test_type === 'Dummy' && r.date_of_test === day);
          if (onDay) totalLogged++;
          else missed.push({ date: day, logbook: 'qa', label: `${LOGBOOK_LABELS.qa} — ${m.machine_id} (Dummy)`, machineId: m.machine_id });
        });
      });
    }

    missed.sort((a, b) => b.date.localeCompare(a.date));
    const compliancePct = totalExpected > 0 ? Math.round((totalLogged / totalExpected) * 100) : null;
    return { missed, compliancePct, totalExpected, totalLogged };
  }
};

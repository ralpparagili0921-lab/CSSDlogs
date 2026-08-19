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
  'temp-humidity': 'Temperature & Humidity',
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
      const machines = (await DB.listAllMachines()).filter(m => m.qa_schedule_day);
      if (machines.length > 0) {
        const dayIndex = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
        const todayIndex = dayIndex[todayWeekday];
        const weekStart = this._isoWeekStart(new Date()).toISOString().slice(0, 10);
        const qaThisWeek = await DB.listQaTests({ from: weekStart, to: today, limit: 2000 });
        // Implant-load BI tests (tied to a specific cycle) are event-driven,
        // not calendar-scheduled — they don't count toward, and aren't
        // held to, this machine's weekly BI/Dummy schedule.
        const scheduledTests = qaThisWeek.filter(r => !(r.test_type === 'BI' && r.cycle_id));

        const dueOrLate = [], late = [];
        machines.forEach(m => {
          const scheduledIndex = dayIndex[m.qa_schedule_day];
          if (todayIndex === undefined || scheduledIndex === undefined || todayIndex < scheduledIndex) return; // not this machine's week yet
          const forMachine = scheduledTests.filter(r => r.machine_id === m.machine_id);
          const hasBI = forMachine.some(r => r.test_type === 'BI');
          const hasDummy = forMachine.some(r => r.test_type === 'Dummy');
          if (hasBI && hasDummy) return; // both done this week — satisfied, regardless of which day
          const label = `${m.machine_id} (missing ${!hasBI ? 'BI' : ''}${!hasBI && !hasDummy ? '/' : ''}${!hasDummy ? 'Dummy' : ''})`;
          if (todayIndex === scheduledIndex) dueOrLate.push(label);
          else late.push(label);
        });
        if (dueOrLate.length > 0) {
          items.push({ type: 'qa', message: `QA testing (BI + Dummy) scheduled today (${todayWeekday}): ${dueOrLate.join(', ')}.`, assigned: assignments.qa });
        }
        if (late.length > 0) {
          items.push({ type: 'qa', message: `QA testing (BI + Dummy) is now LATE — past this machine's scheduled day: ${late.join(', ')}.`, assigned: assignments.qa });
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
        const loggedLocationIds = new Set(thToday.map(r => r.location_id));
        const missing = locations.filter(l => !loggedLocationIds.has(l.id));
        if (missing.length > 0) {
          items.push({
            type: 'temp-humidity',
            message: `Temperature & Humidity not yet logged today for: ${missing.map(l => l.name).join(', ')}.`,
            assigned: assignments['temp-humidity']
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
      const qaMachines = machines.filter(m => m.qa_schedule_day);
      const rows = (await DB.listQaTests({ from, to, limit: 5000 })).filter(r => !(r.test_type === 'BI' && r.cycle_id));
      const byMachine = {};
      rows.forEach(r => { (byMachine[r.machine_id] = byMachine[r.machine_id] || []).push(r); });
      qaMachines.forEach(m => {
        const dueDays = workingDays.filter(d => weekdayOf(d) === m.qa_schedule_day);
        dueDays.forEach(day => {
          totalExpected++;
          const weekEnd = new Date(day); weekEnd.setDate(weekEnd.getDate() + 6);
          const inWeek = (byMachine[m.machine_id] || []).filter(r => r.date_of_test >= day && r.date_of_test <= weekEnd.toISOString().slice(0, 10));
          const satisfied = inWeek.some(r => r.test_type === 'BI') && inWeek.some(r => r.test_type === 'Dummy');
          if (satisfied) totalLogged++;
          else missed.push({ date: day, logbook: 'qa', label: `${LOGBOOK_LABELS.qa} — ${m.machine_id} (BI + Dummy)`, machineId: m.machine_id });
        });
      });
    }

    missed.sort((a, b) => b.date.localeCompare(a.date));
    const compliancePct = totalExpected > 0 ? Math.round((totalLogged / totalExpected) * 100) : null;
    return { missed, compliancePct, totalExpected, totalLogged };
  }
};

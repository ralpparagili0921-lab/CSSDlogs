// ============================================================
// SCHEDULED ALARMS — a third alarm type, distinct from the other two
// (Cycle Log exposure-complete, QA BI incubation-complete), for
// logbooks with a defined, recurring time window each day/week
// (rather than a precise countdown timer). Fires at the START of the
// window if today's task isn't done yet, keeps repeating (respecting
// the same 5-minute mute cycle as every other alarm) until either the
// task is actually completed or the window's END time passes — at
// which point the loud alarm stops and it becomes a "genuinely late"
// entry, tracked by the existing missed-logs dashboard system
// instead (which runs alongside this the whole time regardless).
//
// In the final 25% of ANY window (proportional to that window's own
// length, not a fixed number of minutes — a repeatedly-muted alarm
// this late may mean the primary isn't actually on duty), the
// secondary-assigned staff member gets named alongside the primary,
// as a safety-net escalation.
//
// Unlike the other two alarms, there's no pre-existing database row
// to attach a "muted until" timestamp to when this one fires — the
// whole point is the task hasn't been started yet. So muting this
// type is tracked in memory here, not persisted — a page refresh
// resets the mute, a reasonable trade-off against needing an entire
// new table just to track this.
// ============================================================

const ScheduledAlarms = {
  _mutedUntil: {}, // key -> timestamp ms

  // Each window's own length sets its own "last 25%" — not a fixed
  // number of minutes. days: 0=Sun...6=Sat.
  WINDOWS: {
    bi:      { days: [1],           startMin: 7 * 60,       endMin: 8 * 60 + 30,  logbook: 'qa' },
    dummy:   { days: [1, 2, 3, 4, 5], startMin: 6 * 60 + 30,  endMin: 8 * 60,       logbook: 'qa' },
    ro:      { days: [0, 1, 2, 3, 4, 5, 6], startMin: 14 * 60, endMin: 14 * 60 + 30, logbook: 'ro' },
    brush:   { days: [3],           startMin: 14 * 60,      endMin: 14 * 60 + 30, logbook: 'brush' },
    thAm:    { days: [1, 2, 3, 4, 5], startMin: 7 * 60,       endMin: 8 * 60,       logbook: 'temp-humidity-am' },
    thPm:    { days: [1, 2, 3, 4, 5], startMin: 14 * 60,      endMin: 16 * 60,      logbook: 'temp-humidity-pm' },
    hk:      { days: [1, 2, 3, 4, 5], startMin: 15 * 60,      endMin: 15 * 60 + 30, logbook: 'housekeeping' }
  },

  // Generic window-state check reused by every alarm — active-or-not,
  // and whether we're in that specific window's own final 25%.
  _windowState(cfg, nowMin, day) {
    if (!cfg.days.includes(day) || nowMin < cfg.startMin || nowMin >= cfg.endMin) return { active: false, isLastQuarter: false };
    const duration = cfg.endMin - cfg.startMin;
    return { active: true, isLastQuarter: nowMin >= cfg.startMin + duration * 0.75 };
  },

  async tick() {
    const now = TrueTime.now();
    const day = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const states = {};
    Object.keys(this.WINDOWS).forEach(k => { states[k] = this._windowState(this.WINDOWS[k], nowMin, day); });
    const anyActive = Object.values(states).some(s => s.active);

    // One shared fetch per tick, reused by every check below — matches
    // missed-logs.js's established pattern — rather than each check
    // independently re-querying the same assignment data every minute.
    let primaryNames = {}, secondaryNames = {};
    if (anyActive) {
      try {
        const rows = await DB.listAssignments();
        rows.forEach(r => {
          const name = r.staff ? r.staff.name : null;
          if (r.priority_rank === 1) primaryNames[r.logbook] = name;
          if (r.priority_rank === 2) secondaryNames[r.logbook] = name;
        });
      } catch (e) { /* offline — checks below just show "no one assigned" this tick */ }
    }

    const run = (cfgKey, prefix, checkFn) => {
      const s = states[cfgKey];
      const logbook = this.WINDOWS[cfgKey].logbook;
      if (s.active) checkFn(primaryNames[logbook], s.isLastQuarter ? secondaryNames[logbook] : null);
      else this._clearAllWithPrefix(prefix);
    };

    run('bi', 'sched-bi-', (p, s) => this._checkBiStartWindow(p, s));
    run('dummy', 'sched-dummy-', (p, s) => this._checkDummyWindow(p, s));
    run('ro', 'sched-ro', (p, s) => this._checkRoWindow(p, s));
    run('brush', 'sched-brush-', (p, s) => this._checkBrushWindow(p, s));
    run('thAm', 'sched-th-am-', (p, s) => this._checkTempHumidityWindow('am', p, s));
    run('thPm', 'sched-th-pm-', (p, s) => this._checkTempHumidityWindow('pm', p, s));
    run('hk', 'sched-hk', (p, s) => this._checkHousekeepingWindow(p, s));

    // Handover turnaround — not a daily window like the 7 above, since
    // a handover can cross its 3-day deadline at any time of day. Runs
    // unconditionally every tick, self-contained (fetches its own
    // data), same shape as this file's original global backup checks.
    await this._checkHandoverTurnaround();

    // The two precise-timer alarms (Cycle Log exposure, QA BI
    // incubation) normally only run while that exact page is open —
    // each view's own 1-second tick clears/restarts on every render()
    // and stops any alarm for a cycle "just not on this page anymore."
    // These two checks are the global backup: same alarmKey naming, so
    // Alarm.start()/showBox()'s own guards (already-firing = no-op)
    // mean there's no duplicate/conflicting alarm when both the
    // page-specific tick AND this global one are active on the same
    // device at once — this one just also covers every other screen,
    // including pre-login, at a coarser 60s-latency backup cadence
    // rather than the page's smooth 1s one.
    await this._checkGlobalCycleExposure();
    await this._checkGlobalBiIncubation();
  },

  async _checkGlobalCycleExposure() {
    try {
      const cycles = await DB.listOpenCycles();
      cycles.forEach(cycle => {
        const due = CycleLogView.computeExposureDue(cycle);
        if (!due.computable) return;
        const alarmKey = `cycle-exposure-${cycle.id}`;
        if (!due.isOverdue) { Alarm.stop(alarmKey); return; }
        if (Alarm.isSnoozed(cycle.alarm_acknowledged_at) || Alarm.isLocallyMuted(alarmKey)) { Alarm.stop(alarmKey); return; }
        const initiatorPrefix = cycle.operator_start ? `${cycle.operator_start}, ` : '';
        const equipmentLabel = cycle.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : 'Autoclave';
        Alarm.start(alarmKey, `${initiatorPrefix}${equipmentLabel} ${cycle.machine_id}, exposure time is complete, please start to flush`, 'Cycle Alarm');
        Alarm.showBox(alarmKey, 'Exposure Time Complete', `${cycle.machine_id} — Cycle ${cycle.cycle_number}`, async () => {
          await DB.updateCycle(cycle.id, { alarm_acknowledged_at: TrueTime.nowISO(), alarm_acknowledged_by: Auth.currentStaff.name });
          Alarm.stop(alarmKey);
        });
      });
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkGlobalBiIncubation() {
    try {
      const rows = await DB.listIncubatingBiTests();
      // Same lightweight pre-pass pattern as the per-page tick — only
      // fetch the active-staff list if at least one test actually
      // needs the escalated (last-25%-of-30min) all-staff naming.
      let needsStaffList = false;
      rows.forEach(row => {
        const due = QaTestingView.computeBiDue(row);
        if (!due.computable || !due.isOverdue || Alarm.isSnoozed(row.alarm_acknowledged_at) || Alarm.isLocallyMuted(`bi-incubation-${row.machine_id}`)) return;
        if (Date.now() - due.dueAt.getTime() >= 30 * 60000 * 0.75) needsStaffList = true;
      });
      let allStaffNames = null;
      if (needsStaffList) {
        try {
          const staff = await DB.listActiveStaff();
          if (staff.length > 0) allStaffNames = staff.map(s => s.name).join(', ');
        } catch (e) { /* offline — falls back to the initiator's name this tick */ }
      }
      rows.forEach(row => {
        const due = QaTestingView.computeBiDue(row);
        if (!due.computable) return;
        const alarmKey = `bi-incubation-${row.machine_id}`;
        if (!due.isOverdue) { Alarm.stop(alarmKey); return; }
        if (Alarm.isSnoozed(row.alarm_acknowledged_at) || Alarm.isLocallyMuted(alarmKey)) { Alarm.stop(alarmKey); return; }
        const isLastQuarter = Date.now() - due.dueAt.getTime() >= 30 * 60000 * 0.75;
        const namePrefix = (isLastQuarter && allStaffNames) ? `${allStaffNames}, ` : (row.operator ? `${row.operator}, ` : '');
        Alarm.start(alarmKey, `${namePrefix}B I incubation complete for ${row.machine_id}`, 'QA Alert');
        Alarm.showBox(alarmKey, 'BI Incubation Complete', `${row.machine_id} — ready for a result`, async () => {
          await DB.updateQaTest(row.id, { alarm_acknowledged_at: TrueTime.nowISO(), alarm_acknowledged_by: Auth.currentStaff.name });
          Alarm.stop(alarmKey);
        });
      });
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkHandoverTurnaround() {
    try {
      const processing = await DB.listProcessingHandovers();
      const late = processing.filter(r => HandoverView.isLateRelease(r));
      const currentKeys = new Set(late.map(r => `sched-handover-${r.id}`));

      // A handover that WAS alarming (still Processing, still late) but
      // has since dropped off this list entirely — because it got
      // released, or because it's no longer late for some other reason
      // — never reappears in listProcessingHandovers() once its status
      // changes. This loop only sees currently-late items, so anything
      // that quietly left the set needs to be explicitly resolved here,
      // not just skipped.
      (this._lastLateHandoverKeys || new Set()).forEach(key => {
        if (!currentKeys.has(key)) { this._resolve(key); }
      });
      this._lastLateHandoverKeys = currentKeys;

      if (late.length === 0) return;
      const assignments = await DB.listAssignments();
      const primary = assignments.find(a => a.logbook === 'handover' && a.priority_rank === 1);
      const secondary = assignments.find(a => a.logbook === 'handover' && a.priority_rank === 2);
      const primaryName = primary && primary.staff ? primary.staff.name : null;
      const secondaryName = secondary && secondary.staff ? secondary.staff.name : null;
      late.forEach(r => {
        const key = `sched-handover-${r.id}`;
        // Same last-25%-style escalation spirit as the window checks —
        // here, "how overdue" substitutes for "how far into the
        // window," since there's no fixed window length to measure
        // against. 1.5x the 3-day target (4.5 days overdue) names the
        // secondary too.
        const overdueMs = TrueTime.now().getTime() - (new Date(r.received_at).getTime() + 3 * 86400000);
        const isVeryLate = overdueMs >= 1.5 * 86400000;
        this._fireOrResolve(
          key, false, primaryName, isVeryLate ? secondaryName : null,
          'Handover Alert',
          `${HandoverView._deptLabel(r)} handover ${r.serial_number} is past the 3-day release target`,
          'Handover Past Turnaround Target',
          `${HandoverView._deptLabel(r)} · ${r.serial_number} — submitted ${UI.fmtDate(r.received_at)}`
        );
      });
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  // Shared helper for every check below — handles the alarm
  // start/mute/resolve dance, AND the name-prefix construction
  // (including the last-25% secondary-name escalation), identically
  // regardless of which logbook is calling it.
  _fireOrResolve(key, isDone, primaryName, secondaryName, title, messageSuffix, boxTitle, boxMessageSuffix) {
    if (isDone) { this._resolve(key); return; }
    if (this._isMuted(key)) { Alarm.stop(key); return; }
    const names = secondaryName ? `${primaryName || 'no primary assigned'} and ${secondaryName}` : primaryName;
    const namePrefix = names ? `${names}, ` : '';
    Alarm.start(key, `${namePrefix}${messageSuffix}`, title);
    Alarm.showBox(key, boxTitle, `${boxMessageSuffix} · ${names || 'no one assigned'}`, async () => {
      this._mutedUntil[key] = TrueTime.now().getTime() + Alarm.snoozeMinutes * 60000;
      Alarm.stop(key);
    });
  },

  async _checkBiStartWindow(primaryName, secondaryName) {
    try {
      const machines = await DB.listAllMachines();
      const qaMachines = machines.filter(m => m.active && m.qa_schedule_day === 'Monday');
      if (qaMachines.length === 0) return;
      const today = UI.todayStr();
      const todaysBi = (await DB.listQaTests({ from: today, to: today, test_type: 'BI' })).filter(r => !r.cycle_id);
      const startedIds = new Set(todaysBi.map(r => r.machine_id));
      const stillRelevant = new Set();
      qaMachines.forEach(m => {
        const key = `sched-bi-${m.machine_id}`;
        if (!startedIds.has(m.machine_id)) stillRelevant.add(key);
        this._fireOrResolve(key, startedIds.has(m.machine_id), primaryName, secondaryName, 'Scheduled Task Due',
          `BI test needs to be started for ${m.machine_id}`,
          'BI Test Due', `${m.machine_id} — start by 8:30am`);
      });
      this._sweepMuted('sched-bi-', stillRelevant);
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkDummyWindow(primaryName, secondaryName) {
    try {
      const machines = await DB.listAllMachines();
      const dummyMachines = machines.filter(m => m.active && (m.applicable_tests || []).includes('Dummy'));
      if (dummyMachines.length === 0) return;
      const today = UI.todayStr();
      const todaysDummy = await DB.listQaTests({ from: today, to: today, test_type: 'Dummy' });
      const loggedIds = new Set(todaysDummy.map(r => r.machine_id));
      const stillRelevant = new Set();
      dummyMachines.forEach(m => {
        const key = `sched-dummy-${m.machine_id}`;
        if (!loggedIds.has(m.machine_id)) stillRelevant.add(key);
        this._fireOrResolve(key, loggedIds.has(m.machine_id), primaryName, secondaryName, 'Scheduled Task Due',
          `Dummy pack test needs to be logged for ${m.machine_id}`,
          'Dummy/CI Test Due', `${m.machine_id} — log by 8:00am`);
      });
      this._sweepMuted('sched-dummy-', stillRelevant);
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkRoWindow(primaryName, secondaryName) {
    try {
      const meta = await DB.getAppMeta();
      if (!meta.ro_monitoring_activated) { this._resolve('sched-ro'); return; }
      const today = UI.todayStr();
      const todaysRo = await DB.listRoLogs({ from: today, to: today, limit: 5 });
      const key = 'sched-ro';
      this._fireOrResolve(key, todaysRo.length > 0, primaryName, secondaryName, 'Scheduled Task Due',
        'RO Water Quality has not been logged today',
        'RO Water Quality Due', 'Not yet logged today');
      if (todaysRo.length > 0) this._sweepMuted('sched-ro', new Set());
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkBrushWindow(primaryName, secondaryName) {
    try {
      const brushes = await DB.listActiveBrushes();
      if (brushes.length === 0) return;
      const weekStart = BrushView._isoWeekStart(TrueTime.now());
      const weekLogs = await DB.listBrushLogs({ from: weekStart, to: UI.todayStr(), limit: 500 });
      const loggedIds = new Set(weekLogs.map(l => l.brush_id));
      const stillRelevant = new Set();
      brushes.forEach(b => {
        const key = `sched-brush-${b.brush_id}`;
        if (!loggedIds.has(b.brush_id)) stillRelevant.add(key);
        this._fireOrResolve(key, loggedIds.has(b.brush_id), primaryName, secondaryName, 'Scheduled Task Due',
          `${b.brush_id} has not been inspected this week`,
          'Weekly Brush Inspection Due', `${b.brush_id} — last chance this week`);
      });
      this._sweepMuted('sched-brush-', stillRelevant);
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkTempHumidityWindow(period, primaryName, secondaryName) {
    try {
      const locations = await DB.listTempHumidityLocations(true);
      if (locations.length === 0) return;
      const today = UI.todayStr();
      const todaysLogs = await DB.listTempHumidityLogs({ from: today, to: today, limit: 500 });
      const loggedIds = new Set(
        todaysLogs.filter(r => (period === 'am') ? (r.log_time || '') < '12:00:00' : (r.log_time || '') >= '12:00:00')
          .map(r => r.location_id)
      );
      const windowLabel = period === 'am' ? '8:00am' : '4:00pm';
      const prefix = `sched-th-${period}-`;
      const stillRelevant = new Set();
      locations.forEach(l => {
        const key = `${prefix}${l.id}`;
        if (!loggedIds.has(l.id)) stillRelevant.add(key);
        this._fireOrResolve(key, loggedIds.has(l.id), primaryName, secondaryName, 'Scheduled Task Due',
          `${l.name} ${period.toUpperCase()} reading is due`,
          `Temp/Humidity ${period.toUpperCase()} Reading Due`, `${l.name} — log by ${windowLabel}`);
      });
      this._sweepMuted(prefix, stillRelevant);
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  async _checkHousekeepingWindow(primaryName, secondaryName) {
    try {
      const today = UI.todayStr();
      const todaysHk = await DB.listHousekeepingLogs({ from: today, to: today, limit: 5 });
      const key = 'sched-hk';
      this._fireOrResolve(key, todaysHk.length > 0, primaryName, secondaryName, 'Scheduled Task Due',
        'Housekeeping checklist has not been logged today',
        'Housekeeping Checklist Due', 'Not yet logged today');
      if (todaysHk.length > 0) this._sweepMuted('sched-hk', new Set());
    } catch (e) { /* offline or unreachable — try again next tick */ }
  },

  _isMuted(key) {
    const until = this._mutedUntil[key];
    if (!until) return false;
    if (TrueTime.now().getTime() >= until) { delete this._mutedUntil[key]; return false; }
    return true;
  },

  _resolve(key) {
    Alarm.stop(key);
    Alarm.removeBox(key);
    delete this._mutedUntil[key];
  },

  // Anything muted-but-no-longer-relevant (item reconfigured, etc.)
  // shouldn't linger in memory forever.
  _sweepMuted(prefix, stillRelevant) {
    Object.keys(this._mutedUntil).forEach(k => { if (k.startsWith(prefix) && !stillRelevant.has(k)) delete this._mutedUntil[k]; });
  },

  _clearAllWithPrefix(prefix) {
    Alarm.activeKeys().forEach(k => { if (k.startsWith(prefix)) Alarm.stop(k); });
  }
};

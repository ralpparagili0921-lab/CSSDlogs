// ============================================================
// DB — all Supabase reads/writes live here.
// ============================================================

const supabaseClient = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

// Read-through cache for reference data forms need to render at all —
// staff (the login screen itself) and machines (Equipment/Cycle Log/QA
// dropdowns). On a successful fetch, cache the result; on failure (offline),
// fall back to the last-known copy instead of leaving the screen blank.
// This is deliberately NOT a full local mirror of every table — see
// backlog item #11's scope note in js/offline-queue.js.
function cacheReadThrough(cacheKey, fetchFn) {
  return fetchFn().then(data => {
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
    return data;
  }).catch(err => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    throw err;
  });
}

const DB = {
  // ---------- DTR RECORDS (GreatDay monthly attendance import) ----------
  async replaceDtrRecords(records, from, to) {
    // Delete-then-insert for the covered date range, so re-uploading the
    // same month after fixing a mismatch replaces cleanly rather than
    // duplicating.
    const { error: delError } = await supabaseClient.from('dtr_records').delete().gte('log_date', from).lte('log_date', to);
    if (delError) throw delError;
    if (records.length === 0) return { inserted: 0 };
    const { error: insError, count } = await supabaseClient.from('dtr_records').insert(records, { count: 'exact' });
    if (insError) throw insError;
    return { inserted: count || records.length };
  },
  async listDtrRecords({ from, to } = {}) {
    let q = supabaseClient.from('dtr_records').select('*');
    if (from) q = q.gte('log_date', from);
    if (to) q = q.lte('log_date', to);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // Shared serial-number generator — e.g. "EQ-0001", "QA-0047". Looks up
  // the highest existing number for this table/column/prefix and returns
  // the next one, zero-padded to 4 digits. NOTE: this is a read-then-write
  // pattern, not an atomic DB sequence — with this app's realistic usage
  // (a handful of staff, not high-concurrency simultaneous submissions),
  // the collision risk is low, but it's not impossible. If two entries
  // ever do land with the same number, that's what to know why.
  async generateSerialNumber(table, column, prefix) {
    const { data, error } = await supabaseClient.from(table).select(column).ilike(column, `${prefix}-%`).order(column, { ascending: false }).limit(1);
    if (error) throw error;
    let next = 1;
    if (data && data.length && data[0][column]) {
      const match = data[0][column].match(/-(\d+)$/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    return `${prefix}-${String(next).padStart(4, '0')}`;
  },


  // ---------- STAFF ----------
  async listActiveStaff() {
    return cacheReadThrough('cssd_cache_active_staff', async () => {
      const { data, error } = await supabaseClient.from('staff').select('*').eq('active', true).neq('role', 'department').order('name');
      if (error) throw error;
      return data;
    });
  },
  // ---------- DEPARTMENT ACCOUNTS (external ER/OPD/OR/Ward staff) ----------
  async listDepartmentAccounts(department) {
    let q = supabaseClient.from('staff').select('*').eq('role', 'department').eq('active', true).order('name');
    if (department) q = q.eq('department', department);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async isPinTaken(pin, excludeStaffId) {
    let q = supabaseClient.from('staff').select('id').eq('pin', pin).eq('active', true);
    if (excludeStaffId) q = q.neq('id', excludeStaffId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).length > 0;
  },
  async listAllStaff() {
    const { data, error } = await supabaseClient.from('staff').select('*').neq('role', 'department').order('active', { ascending: false }).order('name');
    if (error) throw error;
    return data;
  },
  async listSuperusers() {
    const { data, error } = await supabaseClient.from('staff').select('*').eq('role', 'superuser').eq('active', true).order('name');
    if (error) throw error;
    return data;
  },
  async addStaff(fields) {
    const { data, error } = await supabaseClient.from('staff').insert(fields).select().single();
    if (error) throw error;
    return data;
  },
  async updateStaff(id, fields) {
    const { error } = await supabaseClient.from('staff').update(fields).eq('id', id);
    if (error) throw error;
  },
  async deactivateStaff(id) {
    const { error } = await supabaseClient.from('staff').update({ active: false }).eq('id', id);
    if (error) throw error;
  },
  async activateStaff(id) {
    const { error } = await supabaseClient.from('staff').update({ active: true }).eq('id', id);
    if (error) throw error;
  },
  // Total entries this person has ever logged, across all six logbooks —
  // shown on the Archived Staff tab so a person's history stays visible
  // after archiving (backlog item #8).
  async countStaffLogs(staffId) {
    const tables = ['ro_water_quality', 'equipment_downtime', 'sterilization_cycles', 'sterilizer_qa_tests', 'brush_logs', 'instrument_maintenance'];
    const counts = await Promise.all(tables.map(t =>
      supabaseClient.from(t).select('id', { count: 'exact', head: true }).eq('staff_id', staffId)
    ));
    return counts.reduce((sum, r) => sum + (r.count || 0), 0);
  },
  async resetStaffPin(id) {
    const { error } = await supabaseClient.from('staff').update({
      pin: '0000', pin_changed: false,
      security_question_1: null, security_answer_1: null,
      security_question_2: null, security_answer_2: null
    }).eq('id', id);
    if (error) throw error;
  },

  // ---------- APP META ----------
  async getAppMeta() {
    const { data, error } = await supabaseClient.from('app_meta').select('*').eq('id', 1).single();
    if (error) throw error;
    return data;
  },
  async updateAppMeta(fields) {
    const { error } = await supabaseClient.from('app_meta').update(fields).eq('id', 1);
    if (error) throw error;
  },

  // ---------- LOGBOOK ASSIGNMENTS ----------
  async listAssignments() {
    const { data, error } = await supabaseClient.from('logbook_assignments').select('*, staff:staff_id(name)').order('logbook').order('priority_rank');
    if (error) throw error;
    return data;
  },
  async setAssignment(logbook, priorityRank, staff_id) {
    const { error } = await supabaseClient.from('logbook_assignments').upsert(
      { logbook, priority_rank: priorityRank, staff_id },
      { onConflict: 'logbook,priority_rank' }
    );
    if (error) throw error;
  },

  // ---------- RO PARAMETERS (admin-configurable catalog) ----------
  async listRoParameters(activeOnly) {
    return cacheReadThrough('cssd_cache_ro_params' + (activeOnly ? '_active' : ''), async () => {
      let q = supabaseClient.from('ro_parameters').select('*').order('sort_order');
      if (activeOnly) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    });
  },
  async addRoParameter(fields) {
    const { error } = await supabaseClient.from('ro_parameters').insert(fields);
    if (error) throw error;
  },
  async updateRoParameter(id, fields) {
    const { error } = await supabaseClient.from('ro_parameters').update(fields).eq('id', id);
    if (error) throw error;
  },

  // ---------- RO TESTERS (testing device/kit catalog) ----------
  async listRoTesters(activeOnly) {
    return cacheReadThrough('cssd_cache_ro_testers' + (activeOnly ? '_active' : ''), async () => {
      let q = supabaseClient.from('ro_testers').select('*').order('name');
      if (activeOnly) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    });
  },
  async addRoTester(fields) {
    const { error } = await supabaseClient.from('ro_testers').insert(fields);
    if (error) throw error;
  },
  async updateRoTester(id, fields) {
    const { error } = await supabaseClient.from('ro_testers').update(fields).eq('id', id);
    if (error) throw error;
  },

  // ---------- RO WATER QUALITY ----------
  async addRoLog(entry) {
    const serial_number = await this.generateSerialNumber('ro_water_quality', 'serial_number', 'RO');
    return OfflineQueue.submit('insert', 'ro_water_quality', { ...entry, serial_number });
  },
  async listRoLogs({ from, to, limit } = {}) {
    let q = supabaseClient.from('ro_water_quality').select('*').order('log_date', { ascending: false }).order('log_time', { ascending: false });
    if (from) q = q.gte('log_date', from);
    if (to) q = q.lte('log_date', to);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- MACHINES (autoclave + RO) ----------
  async listMachines(type) {
    return cacheReadThrough('cssd_cache_machines' + (type ? '_' + type : ''), async () => {
      let q = supabaseClient.from('machines').select('*').eq('active', true).order('machine_id');
      if (type) q = q.eq('machine_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    });
  },
  async listAllMachines() {
    return cacheReadThrough('cssd_cache_all_machines', async () => {
      const { data, error } = await supabaseClient.from('machines').select('*').order('machine_type').order('machine_id');
      if (error) throw error;
      return data;
    });
  },
  async addMachine(fields) {
    const { error } = await supabaseClient.from('machines').insert(fields);
    if (error) throw error;
  },
  async updateMachine(id, fields) {
    const { error } = await supabaseClient.from('machines').update(fields).eq('id', id);
    if (error) throw error;
  },
  async setMachineActive(id, active) {
    const { error } = await supabaseClient.from('machines').update({ active }).eq('id', id);
    if (error) throw error;
  },

  // ---------- EQUIPMENT DOWNTIME ----------
  async addDowntimeLog(entry) {
    const serial_number = await this.generateSerialNumber('equipment_downtime', 'serial_number', 'EQ');
    return OfflineQueue.submit('insert', 'equipment_downtime', { ...entry, serial_number });
  },
  async updateDowntimeLog(id, fields) {
    return OfflineQueue.submit('update', 'equipment_downtime', fields, id);
  },
  async listDowntimeLogs({ from, to, limit } = {}) {
    let q = supabaseClient.from('equipment_downtime').select('*').order('time_broken', { ascending: false });
    if (from) q = q.gte('time_broken', from);
    if (to) q = q.lte('time_broken', to + 'T23:59:59');
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async listOpenDowntimeLogs() {
    const { data, error } = await supabaseClient.from('equipment_downtime').select('*').eq('status', 'Open').order('time_broken', { ascending: false });
    if (error) throw error;
    return data;
  },

  // ---------- BRUSHES (master list) ----------
  async listActiveBrushes() {
    const { data, error } = await supabaseClient.from('brushes').select('*').eq('active', true).order('brush_id');
    if (error) throw error;
    return data;
  },
  async listAllBrushes() {
    const { data, error } = await supabaseClient.from('brushes').select('*').order('brush_id');
    if (error) throw error;
    return data;
  },
  async nextBrushId() {
    const { data, error } = await supabaseClient.from('brushes').select('brush_id').order('brush_id', { ascending: false }).limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return 'BR-001';
    const lastNum = parseInt((data[0].brush_id.match(/\d+/) || ['0'])[0], 10);
    return 'BR-' + String(lastNum + 1).padStart(3, '0');
  },
  async registerBrush(fields) {
    const { error } = await supabaseClient.from('brushes').insert(fields);
    if (error) throw error;
  },
  async setBrushActive(id, active) {
    const { error } = await supabaseClient.from('brushes').update({ active }).eq('id', id);
    if (error) throw error;
  },
  // Part of the same "log a replacement" flow as addBrushLog below — routed
  // through the offline queue too so both halves behave consistently when
  // there's no connection (backlog item #11).
  async markBrushReplaced(brushId, dateFirstUsed) {
    return OfflineQueue.submit('update', 'brushes', { date_first_used: dateFirstUsed }, brushId, 'brush_id');
  },

  // ---------- BRUSH LOGS ----------
  async addBrushLog(entry) {
    return OfflineQueue.submit('insert', 'brush_logs', entry);
  },
  async listBrushLogs({ from, to, limit, brush_id } = {}) {
    let q = supabaseClient.from('brush_logs').select('*').order('log_date', { ascending: false });
    if (from) q = q.gte('log_date', from);
    if (to) q = q.lte('log_date', to);
    if (brush_id) q = q.eq('brush_id', brush_id);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- STERILIZATION CYCLES ----------
  async addCycle(entry) {
    const cycle_number = await this.generateSerialNumber('sterilization_cycles', 'cycle_number', 'CYC');
    const result = await OfflineQueue.submit('insert', 'sterilization_cycles', { ...entry, cycle_number });
    return { ...result, cycle_number };
  },
  async updateCycle(id, fields) {
    return OfflineQueue.submit('update', 'sterilization_cycles', fields, id);
  },
  async listOpenCycles() {
    const { data, error } = await supabaseClient.from('sterilization_cycles').select('*').eq('status', 'In Progress').order('time_start', { ascending: false });
    if (error) throw error;
    return data;
  },
  async listDraftCycles() {
    const { data, error } = await supabaseClient.from('sterilization_cycles').select('*').eq('status', 'Draft').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async listCycles({ from, to, machine_id, limit } = {}) {
    let q = supabaseClient.from('sterilization_cycles').select('*').order('time_start', { ascending: false });
    if (from) q = q.gte('time_start', from);
    if (to) q = q.lte('time_start', to + 'T23:59:59');
    if (machine_id) q = q.eq('machine_id', machine_id);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- STERILIZER QA TESTS ----------
  // test_type is one of 'Bowie-Dick' | 'BI' | 'Dummy' (matches machines.applicable_tests
  // naming). Bowie-Dick and Dummy are single-entry; BI is a two-stage lifecycle
  // (status 'Incubating' -> 'Completed') tracked on one row.
  async addQaTest(entry) {
    const serial_number = await this.generateSerialNumber('sterilizer_qa_tests', 'serial_number', 'QA');
    return OfflineQueue.submit('insert', 'sterilizer_qa_tests', { ...entry, serial_number });
  },
  async updateQaTest(id, fields) {
    return OfflineQueue.submit('update', 'sterilizer_qa_tests', fields, id);
  },
  async getQaTestByCycle(cycleId) {
    const { data, error } = await supabaseClient.from('sterilizer_qa_tests').select('*').eq('cycle_id', cycleId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async listQaTestsByCycleIds(cycleIds) {
    if (!cycleIds || cycleIds.length === 0) return [];
    const { data, error } = await supabaseClient.from('sterilizer_qa_tests').select('*').in('cycle_id', cycleIds);
    if (error) throw error;
    return data;
  },
  async listIncubatingBiTests() {
    const { data, error } = await supabaseClient.from('sterilizer_qa_tests').select('*').eq('test_type', 'BI').eq('status', 'Incubating').order('bi_incubation_date', { ascending: true });
    if (error) throw error;
    return data;
  },
  async listQaTests({ from, to, machine_id, test_type, limit } = {}) {
    let q = supabaseClient.from('sterilizer_qa_tests').select('*').order('date_of_test', { ascending: false }).order('time_of_test', { ascending: false });
    if (from) q = q.gte('date_of_test', from);
    if (to) q = q.lte('date_of_test', to);
    if (machine_id) q = q.eq('machine_id', machine_id);
    if (test_type) q = q.eq('test_type', test_type);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- INSTRUMENT MAINTENANCE ----------
  async addInstrumentMaintenance(entry) {
    const serial_number = await this.generateSerialNumber('instrument_maintenance', 'serial_number', 'IM');
    return OfflineQueue.submit('insert', 'instrument_maintenance', { ...entry, serial_number });
  },
  async updateInstrumentMaintenance(id, fields) {
    return OfflineQueue.submit('update', 'instrument_maintenance', fields, id);
  },
  async listInstrumentMaintenance({ from, to, limit } = {}) {
    let q = supabaseClient.from('instrument_maintenance').select('*').order('created_at', { ascending: false });
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to + 'T23:59:59');
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async listOpenInstrumentMaintenance() {
    const { data, error } = await supabaseClient.from('instrument_maintenance').select('*').eq('status', 'Out').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // ---------- INSTRUMENT HANDOVER (7th logbook) ----------
  // Two-stage, same pattern as Equipment Downtime: Intake creates the row
  // ('Processing'), Release flips it ('Released'). No blocking-while-open —
  // a department can legitimately send several batches in one day.
  async addHandoverIntake(entry) {
    const serial_number = await this.generateSerialNumber('instrument_handovers', 'serial_number', 'HO');
    return OfflineQueue.submit('insert', 'instrument_handovers', { ...entry, serial_number });
  },
  async releaseHandover(id, fields) {
    return OfflineQueue.submit('update', 'instrument_handovers', fields, id);
  },
  async listProcessingHandovers() {
    const { data, error } = await supabaseClient.from('instrument_handovers').select('*').eq('status', 'Processing').order('received_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async listReleasedForDepartment(department) {
    const { data, error } = await supabaseClient.from('instrument_handovers').select('*').eq('status', 'Released').eq('department', department).order('released_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async listProcessingForDepartment(department) {
    const { data, error } = await supabaseClient.from('instrument_handovers').select('*').eq('status', 'Processing').eq('department', department).order('received_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async listPendingBalanceForDepartment(department) {
    const { data, error } = await supabaseClient.from('instrument_handovers').select('*').eq('has_pending_balance', true).eq('department', department).order('received_verified_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async listPendingBalanceAll() {
    const { data, error } = await supabaseClient.from('instrument_handovers').select('*').eq('has_pending_balance', true).order('received_verified_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async updateHandoverItems(handoverId, items, hasPendingBalance) {
    return OfflineQueue.submit('update', 'instrument_handovers', { load_contents: items, has_pending_balance: hasPendingBalance }, handoverId);
  },
  async verifyHandoverReceived(id, fields) {
    return OfflineQueue.submit('update', 'instrument_handovers', fields, id);
  },
  async listHandovers({ from, to, limit } = {}) {
    let q = supabaseClient.from('instrument_handovers').select('*').order('received_at', { ascending: false });
    if (from) q = q.gte('received_at', from);
    if (to) q = q.lte('received_at', to + 'T23:59:59');
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- TEMPERATURE & HUMIDITY LOG (8th logbook) ----------
  async listTempHumidityLocations(activeOnly) {
    return cacheReadThrough('cssd_cache_th_locations' + (activeOnly ? '_active' : ''), async () => {
      let q = supabaseClient.from('temp_humidity_locations').select('*').order('sort_order');
      if (activeOnly) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    });
  },
  async addTempHumidityLocation(fields) {
    const { error } = await supabaseClient.from('temp_humidity_locations').insert(fields);
    if (error) throw error;
  },
  async updateTempHumidityLocation(id, fields) {
    const { error } = await supabaseClient.from('temp_humidity_locations').update(fields).eq('id', id);
    if (error) throw error;
  },
  async addTempHumidityLog(entry) {
    const serial_number = await this.generateSerialNumber('temp_humidity_logs', 'serial_number', 'TH');
    return OfflineQueue.submit('insert', 'temp_humidity_logs', { ...entry, serial_number });
  },
  async listTempHumidityLogs({ from, to, limit } = {}) {
    let q = supabaseClient.from('temp_humidity_logs').select('*').order('log_date', { ascending: false }).order('log_time', { ascending: false });
    if (from) q = q.gte('log_date', from);
    if (to) q = q.lte('log_date', to);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- CSSD HOUSEKEEPING LOG (9th logbook) ----------
  async addHousekeepingLog(entry) {
    return OfflineQueue.submit('insert', 'housekeeping_logs', entry);
  },
  async listHousekeepingLogs({ from, to, limit } = {}) {
    let q = supabaseClient.from('housekeeping_logs').select('*').order('log_date', { ascending: false }).order('created_at', { ascending: false });
    if (from) q = q.gte('log_date', from);
    if (to) q = q.lte('log_date', to);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // ---------- SCHEDULE EXCEPTIONS (holidays, breaks, closures) ----------
  async listExceptions() {
    const { data, error } = await supabaseClient.from('schedule_exceptions').select('*').order('date_from', { ascending: false });
    if (error) throw error;
    return data;
  },
  async addException(entry) {
    const { error } = await supabaseClient.from('schedule_exceptions').insert(entry);
    if (error) throw error;
  },
  async deleteException(id) {
    const { error } = await supabaseClient.from('schedule_exceptions').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- PENDING EXCEPTIONS (approval queue) ----------
  async listPendingExceptions() {
    const { data, error } = await supabaseClient.from('pending_exceptions').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },
  async addPendingException(entry) {
    const { error } = await supabaseClient.from('pending_exceptions').insert(entry);
    if (error) throw error;
  },
  async approvePendingException(pending) {
    const { error: insErr } = await supabaseClient.from('schedule_exceptions').insert({
      exception_type: pending.exception_type,
      date_from: pending.date_from,
      date_to: pending.date_to,
      reason: pending.reason,
      created_by: pending.requested_by
    });
    if (insErr) throw insErr;
    const { error: delErr } = await supabaseClient.from('pending_exceptions').delete().eq('id', pending.id);
    if (delErr) throw delErr;
  },
  async declinePendingException(id) {
    const { error } = await supabaseClient.from('pending_exceptions').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- DUPLICATE-SUBMISSION CHECK (backlog item #13) ----------
  // Soft warning, not a block — distinct from item #2's hard block on
  // still-open entries. This is for "two people didn't realize this was
  // already done today" (RO reading, a specific test on a specific
  // machine, a brush) where multiple completed entries per day are NOT
  // normal, unlike cycles/incidents which legitimately repeat.
  async findExistingLog(table, matchFields) {
    let q = supabaseClient.from(table).select('*');
    Object.keys(matchFields).forEach(k => { q = q.eq(k, matchFields[k]); });
    const { data, error } = await q.limit(1);
    if (error) throw error;
    return (data && data.length) ? data[0] : null;
  },

  // ---------- DATA RETENTION (backlog item #9) — manual purge only ----------
  _RETENTION_TABLES: [
    { table: 'ro_water_quality', dateCol: 'log_date', label: 'RO Water Quality' },
    { table: 'equipment_downtime', dateCol: 'time_broken', label: 'Equipment Downtime' },
    { table: 'sterilizer_qa_tests', dateCol: 'date_of_test', label: 'QA Testing Log' },
    { table: 'sterilization_cycles', dateCol: 'time_start', label: 'Sterilization Cycle Log' },
    { table: 'brush_logs', dateCol: 'log_date', label: 'Cleaning Brush' },
    { table: 'instrument_maintenance', dateCol: 'created_at', label: 'Instrument Maintenance' },
    { table: 'instrument_handovers', dateCol: 'received_at', label: 'Instrument/Supplies Handover' },
    { table: 'temp_humidity_logs', dateCol: 'log_date', label: 'Temperature & Humidity' },
    { table: 'housekeeping_logs', dateCol: 'log_date', label: 'CSSD Housekeeping' }
  ],
  async countStaleLogs(cutoffDate) {
    return Promise.all(this._RETENTION_TABLES.map(async (t) => {
      const { count, error } = await supabaseClient.from(t.table).select('id', { count: 'exact', head: true }).lt(t.dateCol, cutoffDate);
      if (error) throw error;
      return { table: t.table, label: t.label, count: count || 0 };
    }));
  },
  async purgeStaleLogs(cutoffDate) {
    return Promise.all(this._RETENTION_TABLES.map(async (t) => {
      const { error, count } = await supabaseClient.from(t.table).delete({ count: 'exact' }).lt(t.dateCol, cutoffDate);
      if (error) throw error;
      return { table: t.table, label: t.label, deleted: count || 0 };
    }));
  },

  // ---------- RESET TO FRESH LAUNCH STATE (superuser only, irreversible) ----------
  // Wipes every logged entry plus historical exceptions, but deliberately
  // leaves staff, machines, RO parameters/testers, and temp/humidity
  // locations untouched — those are setup/configuration, not accumulated
  // data, and re-doing that setup isn't the point of this button. Also
  // un-launches the app so the pre-launch gate (and its Activate button)
  // shows again.
  // ---------- TIER 1: reset logged data only (keeps machines/staff/config) ----------
  async resetDataOnly() {
    const results = [];
    for (const t of this._RETENTION_TABLES) {
      const { error, count } = await supabaseClient.from(t.table).delete({ count: 'exact' }).gte(t.dateCol, '1900-01-01');
      if (error) throw new Error(`${t.label}: ${error.message}`);
      results.push({ label: t.label, deleted: count || 0 });
    }
    const { error: e1, count: c1 } = await supabaseClient.from('pending_exceptions').delete({ count: 'exact' }).gte('created_at', '1900-01-01');
    if (e1) throw new Error(`Pending Exceptions: ${e1.message}`);
    results.push({ label: 'Pending Exceptions', deleted: c1 || 0 });
    const { error: e2, count: c2 } = await supabaseClient.from('schedule_exceptions').delete({ count: 'exact' }).gte('created_at', '1900-01-01');
    if (e2) throw new Error(`Schedule Exceptions: ${e2.message}`);
    results.push({ label: 'Schedule Exceptions', deleted: c2 || 0 });
    await this.updateAppMeta({ launched: false, launch_date: null });
    return results;
  },

  // ---------- TIER 2: delete everything (data + machines/devices/config), keeps staff accounts ----------
  // Staff are deliberately kept even here — a fully empty staff table would
  // lock everyone out of the app entirely, with no way back in short of
  // direct SQL. Everything else genuinely resets to nothing.
  async deleteAllExceptStaff() {
    const results = await this.resetDataOnly();
    const configTables = [
      { table: 'machines', label: 'Machines', pk: 'id' },
      { table: 'ro_parameters', label: 'RO Parameters', pk: 'id' },
      { table: 'ro_testers', label: 'RO Testers', pk: 'id' },
      { table: 'temp_humidity_locations', label: 'Temp/Humidity Locations', pk: 'id' },
      { table: 'logbook_assignments', label: 'Logbook Assignments', pk: 'logbook' },
      { table: 'brushes', label: 'Brushes', pk: 'id' }
    ];
    for (const t of configTables) {
      const filterVal = t.pk === 'id' ? '00000000-0000-0000-0000-000000000000' : '__none__';
      const { error, count } = await supabaseClient.from(t.table).delete({ count: 'exact' }).neq(t.pk, filterVal);
      if (error) throw new Error(`${t.label}: ${error.message}`);
      results.push({ label: t.label, deleted: count || 0 });
    }
    return results;
  }
};

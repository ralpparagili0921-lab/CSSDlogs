// ============================================================
// STERILIZER QA TESTING LOG — v2, per-machine cards.
// Per AAMI/ANSI ST79. Bowie-Dick, BI, and Dummy/CI are three fully
// independent tests (backlog item #3) — each machine gets one card,
// expanding to up to three test sub-cards depending on that machine's
// applicable_tests (set in Admin — item #1). Bowie-Dick and Dummy are
// single-entry. BI is a real two-stage lifecycle: Initiate Test
// (status='Incubating') then, once the expected incubation window has
// passed, Log Result (status='Completed') — which also satisfies
// item #2 for BI, since a machine with an incubating BI simply never
// shows the Initiate form again until that row is resolved.
// ============================================================

const QaTestingView = {
  _machines: [],
  _summary: {},      // machine_id -> { 'Bowie-Dick': row|null, 'BI': row|null, 'Dummy': row|null }
  _expanded: null,    // machine_id currently expanded, or null

  // Shared across all three tests — "steps taken" after a failure can
  // genuinely overlap (e.g. reported to biomed AND load quarantined),
  // so this is a multi-select, not a single choice.
  _FAIL_ACTIONS: ['Reported to Biomedical Engineer', 'Load Quarantined', 'Sterilizer Taken Out of Service', 'Re-tested', 'Other'],
  _failActionFieldHtml(prefix, hiddenByDefault) {
    return `
      <div class="field field-full${hiddenByDefault ? ' hidden' : ''}" id="${prefix}-action-wrap">
        <label>Action(s) taken</label>
        <div class="radio-row" id="${prefix}-action-row">
          ${this._FAIL_ACTIONS.map(a => `<button type="button" class="radio-chip" data-val="${a}">${a}</button>`).join('')}
        </div>
        <input type="text" id="${prefix}-action-other" class="hidden" placeholder="Specify other action" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
      </div>
    `;
  },
  _wireFailActionChips(prefix) {
    const row = document.getElementById(`${prefix}-action-row`);
    const otherInput = document.getElementById(`${prefix}-action-other`);
    const state = { selected: new Set() };
    row.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      const val = chip.dataset.val;
      if (state.selected.has(val)) { state.selected.delete(val); chip.className = 'radio-chip'; }
      else { state.selected.add(val); chip.className = 'radio-chip active-bad'; }
      otherInput.classList.toggle('hidden', !state.selected.has('Other'));
    }));
    return state;
  },

  // A failed test usually means the machine needs biomed attention —
  // offer to jump straight into a pre-filled Equipment Downtime incident
  // rather than making staff remember to do it separately.
  _promptDowntimeIfFailed(machineId, testLabel, failed) {
    if (!failed) return;
    const modal = UI.showModal(`
      <h3>Test failed</h3>
      <div class="modal-desc">${UI.escapeHtml(testLabel)} failed for ${UI.escapeHtml(machineId)}. Log an Equipment Downtime incident now?</div>
      <div class="modal-actions">
        <button class="btn" id="qa-fail-skip">Not now</button>
        <button class="btn btn-primary" id="qa-fail-log">Log incident</button>
      </div>
    `);
    modal.querySelector('#qa-fail-skip').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#qa-fail-log').addEventListener('click', () => {
      UI.closeModal();
      App.pendingEquipmentMachine = machineId;
      App.navigate('equipment');
    });
  },

  async render() {
    const el = document.getElementById('view-qa');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook · AAMI/ANSI ST79</div>
          <h1>Sterilizer QA Testing Log</h1>
          <div class="desc">Bowie-Dick, Biological Indicator, and Dummy/CI tests — one card per machine.</div>
        </div>
        ${Auth.currentStaff.role === 'superuser' ? `<button class="btn btn-sm" id="qa-add-machine">+ Add a machine</button>` : ''}
      </div>

      <div id="qa-machine-cards"></div>

      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Recent tests <span class="count" id="qa-count">—</span></span>
        <button class="btn btn-sm" id="qa-view-history">View all history →</button>
      </div>
      ${SearchBar.render('qa-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Date</th><th>Machine</th><th>Test</th><th>Status</th><th>Key result</th><th>Operator</th><th></th><th></th></tr></thead>
        <tbody id="qa-tbody"><tr><td colspan="9" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;
    document.getElementById('qa-view-history').addEventListener('click', () => App.navigate('qa-history'));
    await this._loadCards();
    this._loadTable();
    this._startBiCountdownWatcher();
    const addMachineBtn = document.getElementById('qa-add-machine');
    if (addMachineBtn) addMachineBtn.addEventListener('click', () => {
      window.onMachineAdded = async () => { await this._loadCards(); window.onMachineAdded = null; };
      AdminView._machineModal();
    });
    if (App.pendingBackfillDate) {
      UI.toast(`Backfilling ${UI.fmtDate(App.pendingBackfillDate)} — expand the machine below and set that date on the test you're logging.`);
      App.pendingBackfillDate = null;
    }
    if (App.pendingQaMachine) {
      this._expanded = App.pendingQaMachine;
      App.pendingQaMachine = null;
      this._renderCards();
    }
  },

  async _loadCards() {
    const wrap = document.getElementById('qa-machine-cards');
    try {
      const [allMachines, recent, incubating] = await Promise.all([
        DB.listAllMachines(),
        DB.listQaTests({ from: UI.daysAgoStr(90), limit: 500 }),
        DB.listIncubatingBiTests()
      ]);
      this._machines = allMachines.filter(m => m.active && (m.machine_type === 'autoclave' || m.machine_type === 'flash_sterilizer') && (m.applicable_tests || []).length > 0);

      this._summary = {};
      this._machines.forEach(m => { this._summary[m.machine_id] = { 'Bowie-Dick': null, 'BI': null, 'Dummy': null }; });
      // Most recent completed row per machine+type, newest first since listQaTests already orders that way.
      recent.forEach(r => {
        if (!this._summary[r.machine_id]) return;
        if (!this._summary[r.machine_id][r.test_type]) this._summary[r.machine_id][r.test_type] = r;
      });
      // Incubating BI always wins over an older completed BI for the summary badge.
      incubating.forEach(r => { if (this._summary[r.machine_id]) this._summary[r.machine_id]['BI'] = r; });

      this._renderCards();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load machines: ${UI.escapeHtml(e.message)}</div>`;
    }
  },

  _renderCards() {
    const wrap = document.getElementById('qa-machine-cards');
    if (this._machines.length === 0) {
      wrap.innerHTML = `<div class="card card-pad empty-state">No sterilizers configured with QA tests — set them up in Admin → Machines.</div>`;
      return;
    }
    wrap.innerHTML = `<div class="kpi-grid" style="margin-bottom:22px;">${this._machines.map(m => this._machineCardHtml(m)).join('')}</div>`;
    wrap.querySelectorAll('[data-expand]').forEach(card => card.addEventListener('click', (e) => {
      if (e.target.closest('[data-noexpand]')) return;
      this._expanded = this._expanded === card.dataset.expand ? null : card.dataset.expand;
      this._renderCards();
    }));
    if (this._expanded) this._renderExpanded(this._expanded);
  },

  _testBadge(row, testType) {
    if (testType === 'BI' && row && row.status === 'Incubating') {
      const due = this.computeBiDue(row);
      if (due.computable && due.isOverdue) return `<span class="badge badge-fail">BI overdue</span>`;
      return `<span class="badge badge-open">BI incubating</span>`;
    }
    if (!row) return `<span class="badge" style="background:var(--surface-sunken);color:var(--ink-soft);">${testType} — not tested</span>`;
    const key = testType === 'Bowie-Dick' ? row.bd_result
      : testType === 'Dummy' ? [row.dummy_result, row.dummy_ci_result].filter(Boolean).join(' · ')
      : row.bi_final_result;
    const bad = (key || '').includes('Fail') || (key || '').includes('FAIL') || (key || '').includes('Invalid');
    return `<span class="badge ${bad ? 'badge-fail' : 'badge-pass'}">${testType}: ${UI.escapeHtml(key || '—')}</span>`;
  },

  _machineCardHtml(m) {
    const s = this._summary[m.machine_id] || {};
    const isOpen = this._expanded === m.machine_id;
    return `
      <div class="card" data-expand="${m.machine_id}" style="cursor:pointer;${isOpen ? `border-color:var(--brand);box-shadow:0 0 0 2px rgba(127,159,73,0.15);` : ''}">
        <div class="card-pad" style="padding-bottom:${isOpen ? '14px' : '20px'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div>
              <strong style="font-size:15px;">${UI.escapeHtml(m.machine_id)}</strong>
              <div style="font-size:12px;color:var(--ink-soft);">${UI.escapeHtml(m.label || '')}</div>
            </div>
            <span style="font-size:18px;color:var(--ink-soft);">${isOpen ? '−' : '+'}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">
            ${(m.applicable_tests || []).map(t => this._testBadge(s[t], t)).join('')}
          </div>
        </div>
        ${isOpen ? `<div class="card-pad" style="border-top:1px solid var(--line);padding-top:16px;" data-noexpand id="qa-expanded-${m.machine_id}"></div>` : ''}
      </div>
    `;
  },

  _renderExpanded(machineId) {
    const host = document.getElementById(`qa-expanded-${machineId}`);
    if (!host) return;
    const m = this._machines.find(x => x.machine_id === machineId);
    const tests = m.applicable_tests || [];
    this._testCollapsed = this._testCollapsed || {};
    const testBox = (testKey, testLabel, containerId) => {
      const collapseKey = `${machineId}-${testKey}`;
      const isCollapsed = !!this._testCollapsed[collapseKey];
      return `
        <div>
          <button type="button" class="test-box-toggle" data-collapse-key="${collapseKey}" style="width:100%;display:flex;justify-content:space-between;align-items:center;background:none;border:none;padding:4px 0;cursor:pointer;font-weight:700;font-size:13px;color:var(--ink);">
            <span>${testLabel}</span>
            <span style="color:var(--ink-soft);">${isCollapsed ? '▸' : '▾'}</span>
          </button>
          <div id="${containerId}" class="${isCollapsed ? 'hidden' : ''}"></div>
        </div>
      `;
    };
    host.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
      ${tests.includes('Bowie-Dick') ? testBox('Bowie-Dick', 'Bowie-Dick test', `qa-bd-${machineId}`) : ''}
      ${tests.includes('BI') ? testBox('BI', 'BI test', `qa-bi-${machineId}`) : ''}
      ${tests.includes('Dummy') ? testBox('Dummy', 'Dummy test kit', `qa-dummy-${machineId}`) : ''}
    </div>`;
    if (tests.includes('Bowie-Dick')) this._renderBowieDickCard(m);
    if (tests.includes('BI')) this._renderBiCard(m);
    if (tests.includes('Dummy')) this._renderDummyCard(m);
    host.querySelectorAll('.test-box-toggle').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.collapseKey;
      this._testCollapsed[key] = !this._testCollapsed[key];
      this._renderExpanded(machineId);
    }));
  },

  // ---------------- BOWIE-DICK (single-entry) ----------------
  _renderBowieDickCard(m) {
    const host = document.getElementById(`qa-bd-${m.machine_id}`);
    host.innerHTML = `
      <div class="card card-pad" style="background:var(--surface-sunken);">
        <div class="section-title" style="margin:0 0 12px;">Bowie-Dick test</div>
        <form id="qa-bd-form-${m.machine_id}">
          <div class="form-grid">
            <div class="field"><label>Date of test</label><input type="date" name="date_of_test" value="${UI.todayStr()}" required></div>
            <div class="field"><label>Temperature</label><input type="text" name="bd_temperature"></div>
            <div class="field"><label>Exposure time</label><input type="text" name="bd_exposure_time"></div>
            <div class="field"><label>Drying time</label><input type="text" name="bd_drying_time"></div>
            <div class="field"><label>Serial/Lot number</label><input type="text" name="bd_serial_lot"></div>
            <div class="field"><label>Result</label>
              <div class="radio-row" data-chip-row="bd_result"><button type="button" class="radio-chip active-good" data-val="Pass">Pass</button><button type="button" class="radio-chip" data-val="Fail">Fail</button></div>
            </div>
            ${this._failActionFieldHtml(`qa-bd-${m.machine_id}`, true)}
            <div class="field field-full"><label>Remarks</label><textarea name="bd_remarks"></textarea></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-sm">Save Bowie-Dick result</button></div>
        </form>
      </div>
    `;
    const chipState = { bd_result: 'Pass' };
    const failState = this._wireFailActionChips(`qa-bd-${m.machine_id}`);
    host.querySelectorAll('[data-chip-row] .radio-chip').forEach(chip => chip.addEventListener('click', () => {
      chip.closest('[data-chip-row]').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip ' + (chip.dataset.val === 'Pass' ? 'active-good' : 'active-bad');
      chipState.bd_result = chip.dataset.val;
      document.getElementById(`qa-bd-${m.machine_id}-action-wrap`).classList.toggle('hidden', chip.dataset.val !== 'Fail');
    }));
    FormDraft.attach(document.getElementById(`qa-bd-form-${m.machine_id}`), `qa-bd-form-${m.machine_id}`, {
      getExtra: () => ({ result: chipState.bd_result, failActions: Array.from(failState.selected) }),
      setExtra: (extra) => {
        if (extra.result === 'Fail') host.querySelector('[data-chip-row] [data-val="Fail"]').click();
        (extra.failActions || []).forEach(val => {
          const chip = document.querySelector(`#qa-bd-${m.machine_id}-action-row [data-val="${val}"]`);
          if (chip) chip.click();
        });
      }
    });
    document.getElementById(`qa-bd-form-${m.machine_id}`).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const entry = {
        machine_id: m.machine_id, test_type: 'Bowie-Dick', status: 'Completed',
        date_of_test: fd.get('date_of_test') || UI.todayStr(), time_of_test: UI.nowTimeStr(), operator: Auth.currentStaff.name,
        bd_temperature: fd.get('bd_temperature') || null, bd_exposure_time: fd.get('bd_exposure_time') || null,
        bd_drying_time: fd.get('bd_drying_time') || null,
        bd_serial_lot: fd.get('bd_serial_lot') || null, bd_result: chipState.bd_result,
        bd_fail_action: chipState.bd_result === 'Fail' ? Array.from(failState.selected) : null,
        bd_fail_action_other: failState.selected.has('Other') ? (document.getElementById(`qa-bd-${m.machine_id}-action-other`).value || null) : null,
        bd_remarks: fd.get('bd_remarks') || null,
        staff_id: Auth.currentStaff.id, staff_name: Auth.currentStaff.name
      };
      const btn = e.target.querySelector('button[type="submit"]');
      await UI.withLoading(btn, async () => {
        try {
          try {
            const existing = await DB.findExistingLog('sterilizer_qa_tests', { machine_id: m.machine_id, date_of_test: entry.date_of_test, test_type: 'Bowie-Dick' });
            if (existing) {
              const proceed = await UI.confirmDuplicate(`${UI.escapeHtml(existing.staff_name)} already logged a Bowie-Dick test for ${UI.escapeHtml(m.machine_id)} on ${UI.fmtDate(entry.date_of_test)}.`);
              if (!proceed) return;
            }
          } catch (e2) { /* offline or check failed — don't block the save over this */ }
          const result = await DB.addQaTest(entry); UI.writeResultToast(result, 'Bowie-Dick result saved'); FormDraft.clear(`qa-bd-form-${m.machine_id}`); await this._loadCards(); this._loadTable();
          this._promptDowntimeIfFailed(m.machine_id, 'Bowie-Dick test', entry.bd_result === 'Fail');
        }
        catch (err) { UI.toast('Could not save: ' + err.message, true); }
      });
    });
  },

  // ---------------- DUMMY / CI (single-entry, two results) ----------------
  _renderDummyCard(m) {
    const host = document.getElementById(`qa-dummy-${m.machine_id}`);
    host.innerHTML = `
      <div class="card card-pad" style="background:var(--surface-sunken);">
        <div class="section-title" style="margin:0 0 4px;">Dummy test kit</div>
        <div class="hint" style="margin-bottom:12px;">Level 1 tape (equipment check) plus a chemical indicator sandwiched inside the same challenge pack.</div>
        <form id="qa-dummy-form-${m.machine_id}">
          <div class="form-grid">
            <div class="field"><label>Date of test</label><input type="date" name="date_of_test" value="${UI.todayStr()}" required></div>
            <div class="field"><label>Level 1 tape result</label>
              <div class="radio-row" data-chip-row="dummy_result">
                <button type="button" class="radio-chip active-good" data-val="Pass">Pass</button>
                <button type="button" class="radio-chip" data-val="Fail">Fail</button>
                <button type="button" class="radio-chip" data-val="Unavailable">Unavailable</button>
              </div>
            </div>
            <div class="field"><label>Chemical indicator result</label>
              <div class="radio-row" data-chip-row="dummy_ci_result">
                <button type="button" class="radio-chip active-good" data-val="Pass">Pass</button>
                <button type="button" class="radio-chip" data-val="Fail">Fail</button>
              </div>
            </div>
            ${this._failActionFieldHtml(`qa-dummy-${m.machine_id}`, true)}
            <div class="field field-full"><label>Remarks</label><textarea name="dummy_remarks"></textarea></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-sm">Save Dummy/CI result</button></div>
        </form>
      </div>
    `;
    const chipState = { dummy_result: 'Pass', dummy_ci_result: 'Pass' };
    const failState = this._wireFailActionChips(`qa-dummy-${m.machine_id}`);
    const syncActionVisibility = () => {
      const failed = chipState.dummy_result === 'Fail' || chipState.dummy_ci_result === 'Fail';
      document.getElementById(`qa-dummy-${m.machine_id}-action-wrap`).classList.toggle('hidden', !failed);
    };
    host.querySelectorAll('[data-chip-row]').forEach(row => {
      const key = row.dataset.chipRow;
      row.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
        row.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
        const good = chip.dataset.val === 'Pass';
        chip.className = 'radio-chip ' + (chip.dataset.val === 'Unavailable' ? '' : (good ? 'active-good' : 'active-bad'));
        chipState[key] = chip.dataset.val;
        syncActionVisibility();
      }));
    });
    FormDraft.attach(document.getElementById(`qa-dummy-form-${m.machine_id}`), `qa-dummy-form-${m.machine_id}`, {
      getExtra: () => ({ dummyResult: chipState.dummy_result, ciResult: chipState.dummy_ci_result, failActions: Array.from(failState.selected) }),
      setExtra: (extra) => {
        if (extra.dummyResult && extra.dummyResult !== 'Pass') host.querySelector(`[data-chip-row="dummy_result"] [data-val="${extra.dummyResult}"]`).click();
        if (extra.ciResult && extra.ciResult !== 'Pass') host.querySelector(`[data-chip-row="dummy_ci_result"] [data-val="${extra.ciResult}"]`).click();
        (extra.failActions || []).forEach(val => {
          const chip = document.querySelector(`#qa-dummy-${m.machine_id}-action-row [data-val="${val}"]`);
          if (chip) chip.click();
        });
      }
    });
    document.getElementById(`qa-dummy-form-${m.machine_id}`).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const failed = chipState.dummy_result === 'Fail' || chipState.dummy_ci_result === 'Fail';
      const entry = {
        machine_id: m.machine_id, test_type: 'Dummy', status: 'Completed',
        date_of_test: fd.get('date_of_test') || UI.todayStr(), time_of_test: UI.nowTimeStr(), operator: Auth.currentStaff.name,
        dummy_result: chipState.dummy_result, dummy_ci_result: chipState.dummy_ci_result,
        dummy_fail_action: failed ? Array.from(failState.selected) : null,
        dummy_fail_action_other: failState.selected.has('Other') ? (document.getElementById(`qa-dummy-${m.machine_id}-action-other`).value || null) : null,
        dummy_remarks: fd.get('dummy_remarks') || null,
        staff_id: Auth.currentStaff.id, staff_name: Auth.currentStaff.name
      };
      const btn = e.target.querySelector('button[type="submit"]');
      await UI.withLoading(btn, async () => {
        try {
          try {
            const existing = await DB.findExistingLog('sterilizer_qa_tests', { machine_id: m.machine_id, date_of_test: entry.date_of_test, test_type: 'Dummy' });
            if (existing) {
              const proceed = await UI.confirmDuplicate(`${UI.escapeHtml(existing.staff_name)} already logged a Dummy/CI test for ${UI.escapeHtml(m.machine_id)} on ${UI.fmtDate(entry.date_of_test)}.`);
              if (!proceed) return;
            }
          } catch (e2) { /* offline or check failed — don't block the save over this */ }
          const result = await DB.addQaTest(entry); UI.writeResultToast(result, 'Dummy/CI result saved'); FormDraft.clear(`qa-dummy-form-${m.machine_id}`); await this._loadCards(); this._loadTable();
          this._promptDowntimeIfFailed(m.machine_id, 'Dummy/CI test', failed);
        }
        catch (err) { UI.toast('Could not save: ' + err.message, true); }
      });
    });
  },

  // ---------------- BI (two-stage: Initiate Test -> Log Result) ----------------
  // Expected incubation hours drives a due/overdue indicator (shown here and
  // as a Home-screen prompt via computeBiDue(), called from categories.js).
  computeBiDue(row) {
    if (!row || row.status !== 'Incubating') return { computable: false };
    const hours = parseFloat(row.bi_expected_incubation_hours);
    if (!row.bi_incubation_date || !row.bi_time_in_incubator || isNaN(hours)) return { computable: false };
    const start = new Date(`${row.bi_incubation_date}T${row.bi_time_in_incubator}`);
    if (isNaN(start)) return { computable: false };
    const dueAt = new Date(start.getTime() + hours * 3600000);
    const now = TrueTime.now();
    return { computable: true, dueAt, isOverdue: now >= dueAt, hoursRemaining: (dueAt - now) / 3600000 };
  },

  // Ticks every second while QA Testing is open — same pattern as Cycle
  // Log's exposure-time watcher. Cleared and restarted on every
  // render() so repeated navigation never stacks up intervals, and any
  // alarm for a machine that's no longer incubating gets stopped too.
  _startBiCountdownWatcher() {
    if (this._biCountdownInterval) clearInterval(this._biCountdownInterval);
    this._biCountdownInterval = setInterval(() => this._tickBiCountdowns(), 1000);
    this._tickBiCountdowns();
  },

  async _tickBiCountdowns() {
    const stillRelevantKeys = new Set();
    const machines = this._machines || [];

    // Lightweight synchronous pre-pass — only fetch the active-staff
    // list (a real network call, not a cheap cached read) if at least
    // one machine actually needs it this tick, rather than doing it
    // unconditionally every second.
    let needsStaffList = false;
    machines.forEach(m => {
      const row = this._summary[m.machine_id] && this._summary[m.machine_id]['BI'];
      if (!row || row.status !== 'Incubating') return;
      const due = this.computeBiDue(row);
      if (!due.computable || !due.isOverdue) return;
      if (Alarm.isSnoozed(row.alarm_acknowledged_at)) return;
      const overdueMs = Date.now() - due.dueAt.getTime();
      if (overdueMs >= 30 * 60000 * 0.75) needsStaffList = true;
    });
    let allStaffNames = null;
    if (needsStaffList) {
      try {
        const staff = await DB.listActiveStaff();
        if (staff.length > 0) allStaffNames = staff.map(s => s.name).join(', ');
      } catch (e) { /* offline — falls back to just the initiator's name this tick */ }
    }

    machines.forEach(m => {
      const row = this._summary[m.machine_id] && this._summary[m.machine_id]['BI'];
      if (!row || row.status !== 'Incubating') return;
      const due = this.computeBiDue(row);
      if (!due.computable) return;
      const countdownEl = document.getElementById(`qa-bi-countdown-${m.machine_id}`);
      const cardEl = document.getElementById(`qa-bi-card-${m.machine_id}`);
      const alarmKey = `bi-incubation-${m.machine_id}`;

      if (!due.isOverdue) {
        const remainingMs = due.dueAt.getTime() - Date.now();
        const hh = String(Math.floor(remainingMs / 3600000)).padStart(2, '0');
        const mm = String(Math.floor((remainingMs % 3600000) / 60000)).padStart(2, '0');
        const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
        if (countdownEl) countdownEl.innerHTML = `<span class="hint" style="font-weight:400;">Time remaining:</span> ${hh}:${mm}:${ss}`;
        if (cardEl) cardEl.classList.remove('card-alarm');
        Alarm.stop(alarmKey);
      } else {
        stillRelevantKeys.add(alarmKey);
        if (cardEl) cardEl.classList.add('card-alarm');
        const snoozed = Alarm.isSnoozed(row.alarm_acknowledged_at);
        if (snoozed) {
          const resumesAt = new Date(new Date(row.alarm_acknowledged_at).getTime() + Alarm.snoozeMinutes * 60000);
          if (countdownEl) countdownEl.innerHTML = `⚠ INCUBATION COMPLETE <span class="hint" style="font-weight:400;">— muted by ${UI.escapeHtml(row.alarm_acknowledged_by)} at ${UI.fmtDateTime(row.alarm_acknowledged_at)}, resumes ${UI.fmtDateTime(resumesAt.toISOString())} if still unresolved</span>`;
          Alarm.stop(alarmKey);
        } else {
          if (countdownEl) countdownEl.innerHTML = `⚠ INCUBATION COMPLETE`;
          // Escalates to naming every active staff member once it's
          // been overdue 22.5+ min (the last 25% of a 30-min window) —
          // stays escalated indefinitely past that point too, rather
          // than reverting, since an unresolved implant-related BI
          // result keeps mattering the longer it sits.
          const overdueMs = Date.now() - due.dueAt.getTime();
          const isLastQuarter = overdueMs >= 30 * 60000 * 0.75;
          const namePrefix = (isLastQuarter && allStaffNames) ? `${allStaffNames}, ` : (row.operator ? `${row.operator}, ` : '');
          Alarm.start(alarmKey, `${namePrefix}B I incubation complete for ${m.machine_id}`, 'QA Alert');
          Alarm.showBox(alarmKey, 'BI Incubation Complete', `${m.machine_id} — ready for a result`, async () => {
            await DB.updateQaTest(row.id, { alarm_acknowledged_at: TrueTime.nowISO(), alarm_acknowledged_by: Auth.currentStaff.name });
            row.alarm_acknowledged_at = TrueTime.nowISO();
            row.alarm_acknowledged_by = Auth.currentStaff.name;
            Alarm.stop(alarmKey);
          });
        }
      }
    });
    // Resolving (logging the result) clears the alarm and its box even
    // if nobody explicitly acknowledged it first.
    Alarm.activeKeys().forEach(key => {
      if (key.startsWith('bi-incubation-') && !stillRelevantKeys.has(key)) { Alarm.stop(key); Alarm.removeBox(key); }
    });
  },

  _renderBiCard(m) {
    const host = document.getElementById(`qa-bi-${m.machine_id}`);
    const incubating = this._summary[m.machine_id] && this._summary[m.machine_id]['BI'] && this._summary[m.machine_id]['BI'].status === 'Incubating'
      ? this._summary[m.machine_id]['BI'] : null;
    if (incubating) { this._renderBiLogResult(host, m, incubating); return; }
    this._renderBiInitiate(host, m);
  },

  _renderBiInitiate(host, m) {
    host.innerHTML = `
      <div class="card card-pad" style="background:var(--surface-sunken);">
        <div class="section-title" style="margin:0 0 12px;">BI test — initiate</div>
        <form id="qa-bi-init-form-${m.machine_id}">
          <div class="form-grid">
            <div class="field field-full"><label>BI type <span class="hint">different BI products read in different windows — the Preliminary 1-hour check only applies to the 24-hour type</span></label>
              <select name="bi_type" id="qa-bi-type-${m.machine_id}" required>
                <option value="">—</option>
                <option value="Minutes Result">Minutes Result</option>
                <option value="4-6 Hours Result">4-6 Hours Result</option>
                <option value="24 Hours Result">24 Hours Result</option>
              </select>
            </div>
            <div class="field"><label>Reason for BI test</label>
              <select name="bi_reason"><option value="">—</option><option>Routine Scheduled Test</option><option>Implant Load Test</option><option>After Sterilizer Repair</option><option>Other</option></select>
            </div>
            <div class="field"><label>Incubation date</label><input type="date" name="bi_incubation_date" value="${UI.todayStr()}" required></div>
            <div class="field"><label>Time in incubator</label><input type="time" name="bi_time_in_incubator" value="${UI.nowTimeStr()}" required></div>
            <div class="field"><label>BI serial/lot number</label><input type="text" name="bi_serial_lot"></div>
            <div class="field"><label>BI chamber location</label><input type="text" name="bi_chamber_location"></div>
            <div class="field"><label>Expected incubation hours <span class="hint">pre-filled from BI type, editable</span></label>
              <input type="text" name="bi_expected_incubation_hours" id="qa-bi-hours-${m.machine_id}" placeholder="e.g. 1">
            </div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-sm">Initiate BI test</button></div>
        </form>
      </div>
    `;
    // BI type drives a sensible default for expected hours — still editable,
    // since not every brand within a type reads at exactly the same mark.
    document.getElementById(`qa-bi-type-${m.machine_id}`).addEventListener('change', (e) => {
      const hoursInput = document.getElementById(`qa-bi-hours-${m.machine_id}`);
      const defaults = { 'Minutes Result': '1', '4-6 Hours Result': '5', '24 Hours Result': '24' };
      hoursInput.value = defaults[e.target.value] || '';
    });
    FormDraft.attach(document.getElementById(`qa-bi-init-form-${m.machine_id}`), `qa-bi-init-form-${m.machine_id}`);
    document.getElementById(`qa-bi-init-form-${m.machine_id}`).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const entry = {
        machine_id: m.machine_id, test_type: 'BI', status: 'Incubating',
        date_of_test: fd.get('bi_incubation_date') || UI.todayStr(), time_of_test: UI.nowTimeStr(), operator: Auth.currentStaff.name,
        bi_type: fd.get('bi_type') || null,
        bi_reason: fd.get('bi_reason') || null, bi_incubation_date: fd.get('bi_incubation_date'),
        bi_time_in_incubator: fd.get('bi_time_in_incubator'), bi_serial_lot: fd.get('bi_serial_lot') || null,
        bi_chamber_location: fd.get('bi_chamber_location') || null,
        bi_expected_incubation_hours: fd.get('bi_expected_incubation_hours') || null,
        staff_id: Auth.currentStaff.id, staff_name: Auth.currentStaff.name
      };
      const btn = e.target.querySelector('button[type="submit"]');
      await UI.withLoading(btn, async () => {
        try {
          const result = await DB.addQaTest(entry);
          if (result && result.queued) {
            UI.toast('BI test initiated — offline, saved on this device. This card will keep showing "Initiate Test" until it syncs — check Recent Tests below before starting another.');
          } else {
            UI.toast('BI test initiated — incubating');
          }
          await this._loadCards(); this._loadTable();
          FormDraft.clear(`qa-bi-init-form-${m.machine_id}`);
        }
        catch (err) { UI.toast('Could not save: ' + err.message, true); }
      });
    });
  },

  _renderBiLogResult(host, m, row) {
    const due = this.computeBiDue(row);
    let dueLine;
    if (!due.computable) dueLine = `<span style="color:var(--ink-soft);">Incubating since ${UI.fmtDateTime(row.bi_incubation_date + 'T' + row.bi_time_in_incubator)} — no fixed duration set, log the result whenever it's ready.</span>`;
    else if (due.isOverdue) dueLine = `<span style="color:var(--red);font-weight:600;">Due for result — ready since ${UI.fmtDateTime(due.dueAt.toISOString())}.</span>`;
    else dueLine = `<span style="color:var(--amber);">Incubating — ready at ${UI.fmtDateTime(due.dueAt.toISOString())} (in ${UI.durationHM(due.hoursRemaining * 60)}).</span>`;
    const canLogNow = !due.computable || due.isOverdue;
    const showPrelim = row.bi_type === '24 Hours Result';
    host.innerHTML = `
      <div class="card card-pad pending-highlight" id="qa-bi-card-${m.machine_id}">
        <div class="section-title" style="margin:0 0 4px;">BI test — log result</div>
        <div style="font-size:12.5px;margin-bottom:8px;">${dueLine}</div>
        <div id="qa-bi-countdown-${m.machine_id}" style="font-weight:700;margin-bottom:10px;"></div>
        <div class="hint" style="margin-bottom:12px;">Initiated by ${UI.escapeHtml(row.staff_name)} · Type: ${UI.escapeHtml(row.bi_type || '—')} · Serial/Lot ${UI.escapeHtml(row.bi_serial_lot || '—')} · Reason: ${UI.escapeHtml(row.bi_reason || '—')}</div>
        ${showPrelim ? `<div id="qa-bi-prelim-${m.machine_id}" style="margin-bottom:14px;"></div>` : ''}
        ${!canLogNow ? `<button class="btn btn-sm" id="qa-bi-early-${m.machine_id}" data-noexpand>Log result early anyway</button><div id="qa-bi-form-wrap-${m.machine_id}" class="hidden"></div>` : `<div id="qa-bi-form-wrap-${m.machine_id}"></div>`}
      </div>
    `;
    if (showPrelim) this._renderBiPrelim(m, row);
    const formWrap = document.getElementById(`qa-bi-form-wrap-${m.machine_id}`);
    const buildForm = () => {
      formWrap.innerHTML = `
        <form id="qa-bi-result-form-${m.machine_id}" style="margin-top:12px;">
          <div class="form-grid">
            <div class="field"><label>Time out of incubator</label><input type="time" name="bi_time_out_incubator" value="${UI.nowTimeStr()}" required></div>
            <div class="field"><label>Test vial result</label>
              <div class="radio-row" data-chip-row="bi_test_vial_result"><button type="button" class="radio-chip active-bad" data-val="Positive Growth">Positive Growth</button><button type="button" class="radio-chip active-good" data-val="Negative Growth">Negative Growth</button></div>
            </div>
            <div class="field"><label>Control result <span class="hint">(expected: positive)</span></label>
              <div class="radio-row" data-chip-row="bi_control_result"><button type="button" class="radio-chip active-good" data-val="Positive Growth">Positive Growth</button><button type="button" class="radio-chip" data-val="Negative Growth">Negative Growth</button></div>
            </div>
            <div class="field"><label>Final result</label>
              <select name="bi_final_result" id="qa-bi-final-${m.machine_id}"><option value="">—</option><option>FINAL PASS</option><option>FINAL FAIL</option><option>Other</option></select>
            </div>
            ${this._failActionFieldHtml(`qa-bi-${m.machine_id}`, true)}
            <div class="field field-full"><label>Remarks</label><textarea name="bi_remarks"></textarea></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-sm">Save BI result</button></div>
        </form>
      `;
      const chipState = {};
      const failState = this._wireFailActionChips(`qa-bi-${m.machine_id}`);
      document.getElementById(`qa-bi-final-${m.machine_id}`).addEventListener('change', (e) => {
        document.getElementById(`qa-bi-${m.machine_id}-action-wrap`).classList.toggle('hidden', e.target.value !== 'FINAL FAIL');
      });
      formWrap.querySelectorAll('[data-chip-row]').forEach(r => {
        const key = r.dataset.chipRow;
        chipState[key] = r.querySelector('.radio-chip.active-good, .radio-chip.active-bad')?.dataset.val || null;
        r.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
          r.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
          const good = key === 'bi_control_result' ? chip.dataset.val === 'Positive Growth' : chip.dataset.val === 'Negative Growth';
          chip.className = 'radio-chip ' + (good ? 'active-good' : 'active-bad');
          chipState[key] = chip.dataset.val;
        }));
      });
      FormDraft.attach(document.getElementById(`qa-bi-result-form-${m.machine_id}`), `qa-bi-result-form-${m.machine_id}`, {
        getExtra: () => ({ vialResult: chipState.bi_test_vial_result, controlResult: chipState.bi_control_result, failActions: Array.from(failState.selected) }),
        setExtra: (extra) => {
          if (extra.vialResult) formWrap.querySelector(`[data-chip-row="bi_test_vial_result"] [data-val="${extra.vialResult}"]`).click();
          if (extra.controlResult) formWrap.querySelector(`[data-chip-row="bi_control_result"] [data-val="${extra.controlResult}"]`).click();
          (extra.failActions || []).forEach(val => {
            const chip = document.querySelector(`#qa-bi-${m.machine_id}-action-row [data-val="${val}"]`);
            if (chip) chip.click();
          });
          document.getElementById(`qa-bi-${m.machine_id}-action-wrap`).classList.toggle('hidden', document.getElementById(`qa-bi-final-${m.machine_id}`).value !== 'FINAL FAIL');
        }
      });
      document.getElementById(`qa-bi-result-form-${m.machine_id}`).addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const finalResult = fd.get('bi_final_result') || null;
        const failed = finalResult === 'FINAL FAIL';
        const fields = {
          status: 'Completed',
          bi_time_out_incubator: fd.get('bi_time_out_incubator'),
          bi_test_vial_result: chipState.bi_test_vial_result || null,
          bi_control_result: chipState.bi_control_result || null,
          bi_final_result: finalResult,
          bi_fail_action: failed ? Array.from(failState.selected) : null,
          bi_fail_action_other: failState.selected.has('Other') ? (document.getElementById(`qa-bi-${m.machine_id}-action-other`).value || null) : null,
          bi_remarks: fd.get('bi_remarks') || null,
          bi_early_read: !canLogNow
        };
        const btn = e.target.querySelector('button[type="submit"]');
        await UI.withLoading(btn, async () => {
          try {
            const result = await DB.updateQaTest(row.id, fields); UI.writeResultToast(result, 'BI result saved'); FormDraft.clear(`qa-bi-result-form-${m.machine_id}`); await this._loadCards(); this._loadTable();
            this._promptDowntimeIfFailed(m.machine_id, 'BI test', failed);
          }
          catch (err) { UI.toast('Could not save: ' + err.message, true); }
        });
      });
    };
    if (canLogNow) buildForm();
    else document.getElementById(`qa-bi-early-${m.machine_id}`).addEventListener('click', () => {
      if (row.bi_type === '24 Hours Result') {
        const warnModal = UI.showModal(`
          <h3 style="color:var(--red);">⚠ Not yet due — 24-hour incubation hasn't lapsed</h3>
          <div class="modal-desc">This is a <strong>24-hour BI</strong> and the full incubation period hasn't passed yet. Logging a result now is <strong style="color:var(--red);">prohibited under AAMI/ANSI ST79</strong> — an early read is not valid for this BI type. Continuing anyway will be recorded as an out-of-protocol early read.</div>
          <div class="modal-actions">
            <button class="btn" id="bi-warn-cancel">Cancel</button>
            <button class="btn btn-danger" id="bi-warn-continue">Continue anyway</button>
          </div>
        `);
        warnModal.querySelector('#bi-warn-cancel').addEventListener('click', () => UI.closeModal());
        warnModal.querySelector('#bi-warn-continue').addEventListener('click', () => {
          UI.closeModal();
          formWrap.classList.remove('hidden');
          buildForm();
        });
        return;
      }
      formWrap.classList.remove('hidden'); buildForm();
    });
  },

  // 1-hour Preliminary Read — only applies to the 24-hour BI type. An
  // optional early checkpoint, doesn't change status or block the main
  // Final Result flow once it becomes due.
  _renderBiPrelim(m, row) {
    const host = document.getElementById(`qa-bi-prelim-${m.machine_id}`);
    if (!host) return;
    if (row.bi_prelim_result) {
      const bad = row.bi_prelim_result.indexOf('FAIL') !== -1;
      host.innerHTML = `<div style="font-size:12.5px;"><strong>Preliminary read (1hr):</strong> <span class="badge ${bad ? 'badge-fail' : 'badge-pass'}">${UI.escapeHtml(row.bi_prelim_result)}</span> at ${UI.fmtDateTime(row.bi_prelim_read_at)}</div>`;
      return;
    }
    host.innerHTML = `
      <div style="border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px 12px;">
        <div style="font-size:12.5px;font-weight:600;margin-bottom:8px;">Preliminary read (1hr) <span class="hint" style="font-weight:400;">optional early checkpoint</span></div>
        <div class="radio-row">
          <button type="button" class="radio-chip active-good" data-noexpand data-prelim="Preliminary PASS - No color change">Preliminary PASS — no color change</button>
          <button type="button" class="radio-chip" data-noexpand data-prelim="Preliminary FAIL - Color change">Preliminary FAIL — color change</button>
        </div>
      </div>
    `;
    host.querySelectorAll('[data-prelim]').forEach(btn => btn.addEventListener('click', async () => {
      try {
        const result = await DB.updateQaTest(row.id, { bi_prelim_result: btn.dataset.prelim, bi_prelim_read_at: TrueTime.nowISO() });
        UI.writeResultToast(result, 'Preliminary read recorded');
        row.bi_prelim_result = btn.dataset.prelim;
        row.bi_prelim_read_at = TrueTime.nowISO();
        this._renderBiPrelim(m, row);
      } catch (e) { UI.toast('Could not save: ' + e.message, true); }
    }));
  },

  // ---------------- Recent tests table ----------------
  _keyResult(r) {
    if (r.test_type === 'BI') return r.status === 'Incubating' ? 'Incubating' : (r.bi_final_result || '—');
    if (r.test_type === 'Bowie-Dick') return r.bd_result || '—';
    if (r.test_type === 'Dummy') return [r.dummy_result, r.dummy_ci_result].filter(Boolean).join(' · ') || '—';
    return '—';
  },
  _keyResultBadgeClass(r) {
    const v = this._keyResult(r) || '';
    if (v === 'Incubating') return 'badge-open';
    if (v.includes('Unavailable')) return 'badge-worn';
    if (v.includes('FAIL') || v.includes('Fail') || v.includes('Positive Growth')) return 'badge-fail';
    if (v.includes('PASS') || v.includes('Pass') || v.includes('Negative')) return 'badge-pass';
    return 'badge-worn';
  },

  async _loadTable() {
    const tbody = document.getElementById('qa-tbody');
    try {
      const rows = await DB.listQaTests({ from: UI.daysAgoStr(30), limit: 100 });
      this._tableRows = rows;
      SearchBar.wire('qa-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'date_of_test', ['machine_id', 'test_type', 'operator'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Couldn't load tests: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  _renderTable(rows, tbodyId = 'qa-tbody', countId = 'qa-count') {
    const tbody = document.getElementById(tbodyId);
    document.getElementById(countId).textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No tests match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td>${UI.fmtDate(r.date_of_test)}</td>
          <td><strong>${UI.escapeHtml(r.machine_id)}</strong></td>
          <td>${UI.escapeHtml(r.test_type)}</td>
          <td><span class="badge ${r.status === 'Incubating' ? 'badge-open' : 'badge-resolved'}">${r.status}</span></td>
          <td><span class="badge ${this._keyResultBadgeClass(r)}">${UI.escapeHtml(this._keyResult(r))}</span>${r.bi_early_read ? ' <span class="badge badge-fail" title="Logged before the full incubation window lapsed">Early read</span>' : ''}</td>
          <td>${UI.escapeHtml(r.operator)}</td>
          <td><button class="btn btn-sm" data-details-toggle="${r.id}">Details ▸</button></td>
          <td><button class="btn btn-sm" data-print="${r.id}">Print</button></td>
        </tr>
        <tr id="qa-details-row-${r.id}" style="display:none;"><td colspan="9" style="padding:14px 16px;background:var(--surface-sunken);">${this._renderTestDetails(r)}</td></tr>
      `).join('');
    tbody.querySelectorAll('[data-details-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trWrap = document.getElementById(`qa-details-row-${btn.dataset.detailsToggle}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? 'Details ▾' : 'Details ▸';
      });
    });
    tbody.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printTest(rows.find(r => r.id === btn.dataset.print)));
    });
  },

  _printTest(r) {
    const rows = [
      ['Machine', r.machine_id], ['Test type', r.test_type], ['Status', r.status],
      ['Date of test', UI.fmtDate(r.date_of_test)], ['Operator', r.operator],
      ['Key result', this._keyResult(r)]
    ];
    if (r.test_type === 'BI') {
      rows.push(['BI type', r.bi_type], ['Incubation start', r.bi_incubation_date ? UI.fmtDateTime(r.bi_incubation_date + 'T' + r.bi_time_in_incubator) : '—'],
        ['Serial/Lot', r.bi_serial_lot], ['Reason', r.bi_reason], ['Early read', r.bi_early_read ? 'Yes' : 'No'],
        ['Alarm acknowledged', r.alarm_acknowledged_at ? `${UI.fmtDateTime(r.alarm_acknowledged_at)} by ${r.alarm_acknowledged_by || '—'}` : '—']);
    }
    const failActions = r.bd_fail_action || r.dummy_fail_action || r.bi_fail_action;
    const failOther = r.bd_fail_action_other || r.dummy_fail_action_other || r.bi_fail_action_other;
    if (failActions) rows.push(['Fail action(s)', failActions.join(', ') + (failOther ? ` — ${failOther}` : '')]);
    rows.push(['Remarks', r.remarks]);
    PrintReport.generate({ title: 'QA TESTING LOG REPORT', refNumber: r.serial_number, sections: [{ heading: 'Test Details', rows }] });
  },

  _renderTestDetails(r) {
    const row = (label, value) => value ? `<div style="margin-bottom:4px;"><span class="hint">${label}:</span> ${value}</div>` : '';
    const failActions = r.bd_fail_action || r.dummy_fail_action || r.bi_fail_action;
    const failOther = r.bd_fail_action_other || r.dummy_fail_action_other || r.bi_fail_action_other;
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          ${row('Time of test', UI.fmtDateTime(r.date_of_test + 'T' + (r.time_of_test || '00:00')))}
          ${r.test_type === 'BI' ? row('BI type', UI.escapeHtml(r.bi_type)) : ''}
          ${r.test_type === 'BI' ? row('Incubation start', r.bi_incubation_date ? UI.fmtDateTime(r.bi_incubation_date + 'T' + r.bi_time_in_incubator) : null) : ''}
          ${r.test_type === 'BI' ? row('Serial/Lot', UI.escapeHtml(r.bi_serial_lot)) : ''}
          ${r.test_type === 'BI' ? row('Reason', UI.escapeHtml(r.bi_reason)) : ''}
          ${row('Alarm acknowledged', r.alarm_acknowledged_at ? `${UI.fmtDateTime(r.alarm_acknowledged_at)} by ${UI.escapeHtml(r.alarm_acknowledged_by) || '—'}` : null)}
        </div>
        <div>
          ${failActions ? row('Fail action(s)', UI.escapeHtml(failActions.join(', ')) + (failOther ? ` — ${UI.escapeHtml(failOther)}` : '')) : ''}
          ${row('Remarks', UI.escapeHtml(r.remarks))}
        </div>
      </div>
    `;
  }
};

const QaTestingHistoryView = {
  async render() {
    const container = document.getElementById('view-qa-history');
    const { tableWrap, setCount } = HistoryView.renderShell({
      container, title: 'QA Testing — Full History', backView: 'qa',
      onFilterChange: (filters) => this._load(filters, setCount)
    });
    tableWrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ref #</th><th>Date</th><th>Machine</th><th>Test</th><th>Status</th><th>Key result</th><th>Operator</th><th></th><th></th></tr></thead>
          <tbody id="qa-hist-tbody"><tr><td colspan="9" class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
  },

  async _load(filters, setCount) {
    const tbody = document.getElementById('qa-hist-tbody');
    try {
      const rows = await DB.listQaTests({ from: filters.from, to: filters.to, limit: 1000 });
      const filtered = filters.search ? SearchBar.filter(rows, { text: filters.search }, 'date_of_test', ['machine_id', 'test_type', 'operator']) : rows;
      setCount(filtered.length);
      QaTestingView._renderTable.call(QaTestingView, filtered, 'qa-hist-tbody', 'hv-count');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Couldn't load history: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  }
};

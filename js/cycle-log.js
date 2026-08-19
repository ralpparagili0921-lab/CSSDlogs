// ============================================================
// STERILIZATION CYCLE LOG
// One row per cycle, logged in two passes: start (parameters +
// load contents) and end (flush/dry/cooldown times + results).
// The flash sterilizer (FS-01) shows extra fields for immediate-use
// tracking (patient/procedure/surgeon/OR/reason) since flash cycles
// are usually an urgent single-instrument response.
// ============================================================

// ============================================================
// STERILIZATION CYCLE LOG
// Phased workflow: Phase 1 (machine + load contents + implant flag,
// Commit assigns a cycle number and creates a Draft) -> Phase 2
// (Start Cycle button, or Back to edit Phase 1 first) -> Phase 3
// (pressures/temp/exposure entered once the cycle is actually
// running, matching real sterilizer operation) -> Complete (existing
// flush/dry/cooldown end-of-cycle flow, unchanged).
// The flash sterilizer (FS-01) shows extra fields for immediate-use
// tracking (patient/procedure/surgeon/OR/reason) since flash cycles
// are usually an urgent single-instrument response.
// ============================================================

const CycleLogView = {
  _machines: [],
  _editingDraftId: null,

  async render() {
    const el = document.getElementById('view-cycles');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>Sterilization Cycle Log</h1>
          <div class="desc">Phase 1: commit the load info. Phase 2: start the cycle when the machine actually runs. Phase 3: record pressures/temp/exposure once it's going.</div>
        </div>
      </div>

      <div class="card card-pad">
        <div id="cyc-phase1-gate">
          <button class="btn btn-primary" id="cyc-new-cycle" style="width:100%;padding:14px;">+ New Cycle</button>
          <div class="hint" style="margin-top:8px;text-align:center;">Reserves a cycle number immediately — if two people start one on different devices at once, each gets their own number right away, before either fills anything else in.</div>
        </div>
        <div id="cyc-phase1-form-wrap" class="hidden">
          <h3 id="cyc-phase1-title" style="font-size:14px;margin-bottom:4px;"></h3>
          <div class="hint" id="cyc-phase1-subtitle" style="margin-bottom:14px;"></div>
          <div id="cyc-open-warning" class="hidden" style="background:rgba(196,67,46,0.08);border:1px solid rgba(196,67,46,0.35);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:13px;color:var(--red);"></div>
          <form id="cyc-form">
            <div class="form-grid">
              <div class="field">
                <label>Machine</label>
                <select name="machine_id" id="cyc-machine" required></select>
              </div>
              <div class="field">
                <label>Load includes orthopedic implants? <span class="hint">policy: implant loads must be accompanied by a BI test</span></label>
                <div class="radio-row" id="cyc-implant-row">
                  <button type="button" class="radio-chip active-good" data-val="false">No</button>
                  <button type="button" class="radio-chip" data-val="true">Yes</button>
                </div>
                <div class="hint hidden" id="cyc-implant-note" style="margin-top:6px;">A BI test panel will appear on this cycle once it's running — the cycle can still complete on schedule, but stays flagged "BI verification pending" until that test has a result.</div>
              </div>
              <div class="field field-full">
                <label>Load contents <span class="hint">type an item, press Enter to start a new line, then type the next one — one item per line</span></label>
                <textarea name="load_contents" rows="4" placeholder="e.g.&#10;Major instrument set&#10;2x towel packs&#10;Laparoscope"></textarea>
              </div>
            </div>
            <div class="hint" style="margin:10px 0;">Ready to sterilize? Close the chamber door and commit to this cycle.</div>
            <div class="form-actions">
              <button type="button" class="btn" id="cyc-cancel-edit">Cancel</button>
              <button type="submit" class="btn btn-primary" id="cyc-submit">Commit</button>
            </div>
          </form>
        </div>
      </div>

      <div class="section-title">Awaiting start (Phase 2) <span class="count" id="cyc-draft-count">—</span></div>
      <div id="cyc-draft-list"></div>

      <div class="section-title">In-progress cycles (Phase 3) <span class="count" id="cyc-open-count">—</span></div>
      <div id="cyc-open-list"></div>

      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Recent cycles <span class="count" id="cyc-count">—</span></span>
        <button class="btn btn-sm" id="cyc-view-history">View all history →</button>
      </div>
      ${SearchBar.render('cyc-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Machine</th><th>Cycle #</th><th>Start</th><th>End</th><th>Temperature</th><th>Exposure</th><th>BI Verification</th><th>Status</th><th></th><th></th><th></th></tr></thead>
        <tbody id="cyc-tbody"><tr><td colspan="12" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;

    try {
      this._machines = (await DB.listAllMachines()).filter(m => m.active && (m.machine_type === 'autoclave' || m.machine_type === 'flash_sterilizer'));
    } catch (e) { this._machines = []; }
    const sel = document.getElementById('cyc-machine');
    sel.innerHTML = this._machines.length
      ? this._machines.map(m => `<option value="${UI.escapeHtml(m.machine_id)}" data-type="${m.machine_type}">${UI.escapeHtml(m.machine_id)} — ${UI.escapeHtml(m.label || '')}</option>`).join('')
      : `<option value="">No sterilizers configured — add one in Admin</option>`;
    sel.addEventListener('change', () => this._syncOpenWarning(sel.value));
    let includesImplants = false;
    document.getElementById('cyc-implant-row').querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      document.getElementById('cyc-implant-row').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip ' + (chip.dataset.val === 'true' ? 'active-bad' : 'active-good');
      includesImplants = chip.dataset.val === 'true';
      document.getElementById('cyc-implant-note').classList.toggle('hidden', !includesImplants);
    }));
    this._implantGetter = () => includesImplants;
    this._implantSetter = (val) => { document.querySelector(`#cyc-implant-row [data-val="${val}"]`).click(); };

    document.getElementById('cyc-new-cycle').addEventListener('click', () => this._startNewCycle());
    document.getElementById('cyc-form').addEventListener('submit', (e) => this._submit(e));
    document.getElementById('cyc-cancel-edit').addEventListener('click', () => this._cancelPhase1());
    document.getElementById('cyc-view-history').addEventListener('click', () => App.navigate('cycles-history'));
    await this._restoreFormDraft();
    DB.cleanupOrphanedCycleDrafts(this._editingDraftId); // fire-and-forget — a background best-effort sweep, excluding whatever this session just restored so it can't be deleted out from under it
    this._loadDrafts();
    this._loadOpen();
    this._loadTable();
    this._startCountdownWatcher();
  },

  // Ticks every second while Cycle Log is open — updates each
  // in-progress card's countdown, and flips it into the red alarm
  // state (glow + repeating tone/voice/notification/vibration) once
  // exposure time is reached. Cleared and restarted on every render()
  // so navigating to this view repeatedly never stacks up intervals,
  // and any alarm for a cycle that's no longer in progress (completed,
  // stopped, or just not on this page anymore) gets stopped too.
  _startCountdownWatcher() {
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this._countdownInterval = setInterval(() => this._tickCountdowns(), 1000);
    this._tickCountdowns();
  },

  _tickCountdowns() {
    const openRows = this._openByMachine ? Object.values(this._openByMachine) : [];
    const stillRelevantKeys = new Set();
    openRows.forEach(cycle => {
      const timelineEl = document.getElementById(`cyc-timeline-${cycle.id}`);
      if (timelineEl) this._renderTimeline(timelineEl, cycle);
      if (!cycle.time_start || !cycle.exposure_time_minutes) return;
      const minutes = parseInt(cycle.exposure_time_minutes, 10);
      if (!minutes) return;
      const dueAt = new Date(cycle.time_start).getTime() + minutes * 60000;
      const remainingMs = dueAt - TrueTime.now().getTime();
      const countdownEl = document.getElementById(`cyc-countdown-${cycle.id}`);
      const cardEl = countdownEl ? countdownEl.closest('.card') : null;
      const alarmKey = `cycle-exposure-${cycle.id}`;

      if (remainingMs > 0) {
        const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
        const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
        if (countdownEl) countdownEl.innerHTML = `<span class="hint" style="font-weight:400;">Exposure time remaining:</span> ${mm}:${ss}`;
        if (cardEl) cardEl.classList.remove('card-alarm');
        Alarm.stop(alarmKey);
      } else {
        stillRelevantKeys.add(alarmKey);
        // The glow is unconditional — it's the persistent visual reminder
        // and only ever clears when the cycle is actually completed/
        // stopped, never by acknowledging the popup.
        if (cardEl) cardEl.classList.add('card-alarm');
        const snoozed = Alarm.isSnoozed(cycle.alarm_acknowledged_at);
        if (snoozed) {
          const resumesAt = new Date(new Date(cycle.alarm_acknowledged_at).getTime() + Alarm.snoozeMinutes * 60000);
          if (countdownEl) countdownEl.innerHTML = `⚠ EXPOSURE TIME COMPLETE <span class="hint" style="font-weight:400;">— acknowledged ${UI.fmtDateTime(cycle.alarm_acknowledged_at)} by ${UI.escapeHtml(cycle.alarm_acknowledged_by)}, snoozed until ${UI.fmtDateTime(resumesAt.toISOString())}</span>`;
          Alarm.stop(alarmKey);
        } else {
          if (countdownEl) countdownEl.innerHTML = `⚠ EXPOSURE TIME COMPLETE`;
          Alarm.start(alarmKey, `Exposure time complete for ${cycle.machine_id}`, 'Cycle Alarm');
          Alarm.showBox(alarmKey, 'Exposure Time Complete', `${cycle.machine_id} — Cycle ${cycle.cycle_number}`, async () => {
            await DB.updateCycle(cycle.id, { alarm_acknowledged_at: TrueTime.nowISO(), alarm_acknowledged_by: Auth.currentStaff.name });
            cycle.alarm_acknowledged_at = TrueTime.nowISO();
            cycle.alarm_acknowledged_by = Auth.currentStaff.name;
            Alarm.stop(alarmKey);
          });
        }
      }
    });
    // Stop any alarm (and its box) whose cycle isn't in the current
    // in-progress list anymore (completed/stopped elsewhere, or simply
    // not on this page) — resolving the cycle clears it even if nobody
    // explicitly clicked Acknowledge.
    Alarm.activeKeys().forEach(key => {
      if (key.startsWith('cycle-exposure-') && !stillRelevantKeys.has(key)) { Alarm.stop(key); Alarm.removeBox(key); }
    });
  },

  // Silently restores an in-progress, uncommitted Phase 1 entry after a
  // refresh or accidental navigation — including which reserved draft
  // row was being filled in, not just the typed field values. Validates
  // that reservation still genuinely exists and is still a Draft first
  // (it could have been aborted or already started from another device
  // in the meantime) rather than trusting a stale local copy blindly.
  async _restoreFormDraft() {
    const found = FormDraft.restore(document.getElementById('cyc-form'), 'cyc-phase1', (extra) => {
      this._restoredExtra = extra;
    });
    if (!found || !this._restoredExtra || !this._restoredExtra.editingDraftId) return;
    const { editingDraftId, isFreshReservation } = this._restoredExtra;
    try {
      const rows = await DB.listDraftCycles();
      const stillValid = rows.find(r => r.id === editingDraftId);
      if (!stillValid) {
        // Reserved row is gone (aborted elsewhere, or already started) —
        // nothing to restore into, discard the stale draft silently.
        FormDraft.clear('cyc-phase1');
        return;
      }
      this._editingDraftId = editingDraftId;
      this._isFreshReservation = isFreshReservation;
      this._implantSetter(this._restoredExtra.includesImplants ? 'true' : 'false');
      const title = isFreshReservation ? `New Cycle — ${stillValid.cycle_number}` : `Editing ${stillValid.cycle_number}`;
      this._showPhase1Form(title, 'Restored your unsaved entry from before — pick up where you left off, or Cancel to discard it.');
      if (!isFreshReservation) document.getElementById('cyc-submit').textContent = 'Save changes';
      this._attachFormDraft();
    } catch (e) { /* offline or unreachable — leave the gate showing rather than guess */ }
  },

  _showPhase1Form(title, subtitle) {
    document.getElementById('cyc-phase1-gate').classList.add('hidden');
    document.getElementById('cyc-phase1-form-wrap').classList.remove('hidden');
    document.getElementById('cyc-phase1-title').textContent = title;
    document.getElementById('cyc-phase1-subtitle').textContent = subtitle;
  },

  _resetPhase1Form() {
    FormDraft.clear('cyc-phase1');
    this._editingDraftId = null;
    this._isFreshReservation = false;
    document.getElementById('cyc-form').reset();
    this._implantSetter('false');
    document.getElementById('cyc-machine').disabled = false;
    document.getElementById('cyc-phase1-gate').classList.remove('hidden');
    document.getElementById('cyc-phase1-form-wrap').classList.add('hidden');
  },

  // "New Cycle" reserves the cycle number the instant it's clicked, before
  // any other field is filled in — two people on different devices each
  // get their own number right away, no race condition from both filling
  // out a form before either commits. If this gets canceled before Commit,
  // the row is deleted entirely so the number frees up for the next one.
  async _startNewCycle() {
    const btn = document.getElementById('cyc-new-cycle');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addCycle({ status: 'Draft', staff_id: Auth.currentStaff.id, staff_name: Auth.currentStaff.name });
        this._editingDraftId = result.id || null;
        this._isFreshReservation = true;
        document.getElementById('cyc-form').reset();
        this._implantSetter('false');
        this._showPhase1Form(`New Cycle — ${result.cycle_number}`, 'Cycle number reserved. Fill in the rest, or Cancel to release this number.');
        FormDraft.clear('cyc-phase1'); // a stale leftover draft shouldn't clobber this brand new reservation
        this._attachFormDraft();
      } catch (e) { UI.toast('Could not reserve a cycle number: ' + e.message, true); }
    });
  },

  _attachFormDraft() {
    FormDraft.attach(document.getElementById('cyc-form'), 'cyc-phase1', {
      getExtra: () => ({
        editingDraftId: this._editingDraftId,
        isFreshReservation: this._isFreshReservation,
        includesImplants: this._implantGetter ? this._implantGetter() : false
      }),
      setExtra: () => {} // restoring the extra state is handled explicitly by _restoreFormDraft on page load, not here
    });
  },

  _editDraft(row) {
    this._editingDraftId = row.id;
    this._isFreshReservation = false; // this draft already has real committed data — canceling an edit shouldn't delete it
    document.getElementById('cyc-machine').value = row.machine_id || '';
    document.querySelector('textarea[name="load_contents"]').value = (row.load_contents || []).join('\n');
    this._implantSetter(row.includes_implants ? 'true' : 'false');
    this._showPhase1Form(`Editing ${row.cycle_number}`, 'Machine, implant status, and load contents can all be changed here.');
    document.getElementById('cyc-submit').textContent = 'Save changes';
    this._syncOpenWarning(row.machine_id || '');
    FormDraft.clear('cyc-phase1'); // start fresh — a stale draft shouldn't override what's actually committed for this row
    this._attachFormDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async _cancelPhase1() {
    if (this._isFreshReservation && this._editingDraftId) {
      // Never actually committed — delete it outright so the reserved
      // cycle number becomes available again, per the concurrency design.
      try {
        await DB.deleteCycleDraft(this._editingDraftId);
      } catch (e) { UI.toast('Could not release the cycle number: ' + e.message, true); }
    }
    FormDraft.clear('cyc-phase1');
    this._resetPhase1Form();
    this._loadDrafts();
  },

  _openStopModal(row) {
    const modal = UI.showModal(`
      <h3 style="color:var(--red);">Stop Cycle ${row ? UI.escapeHtml(row.cycle_number) : ''}</h3>
      <div class="modal-desc">This cycle already started — stopping it is a real event, not a deletion. A reason is required.</div>
      <div class="field" style="margin:14px 0;"><label>Remarks <span class="hint">why this cycle is being stopped</span></label><textarea id="cyc-stop-remarks" required></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="cyc-stop-cancel">Cancel</button>
        <button class="btn btn-danger" id="cyc-stop-confirm">Stop Cycle</button>
      </div>
    `);
    modal.querySelector('#cyc-stop-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#cyc-stop-confirm').addEventListener('click', async () => {
      const remarks = document.getElementById('cyc-stop-remarks').value.trim();
      if (!remarks) { UI.toast('Remarks are required to stop a cycle', true); return; }
      try {
        const result = await DB.updateCycle(row.id, {
          status: 'Stopped',
          stopped_at: TrueTime.nowISO(),
          stopped_by: Auth.currentStaff.name,
          stop_remarks: remarks
        });
        UI.writeResultToast(result, 'Cycle stopped');
        UI.closeModal();
        this._loadOpen();
        this._loadTable();
      } catch (e) { UI.toast('Could not stop: ' + e.message, true); }
    });
  },

  _selectedMachineType(machineId) {
    const m = this._machines.find(x => x.machine_id === machineId);
    return m ? m.machine_type : 'autoclave';
  },

  async _submit(e) {
    e.preventDefault();
    if (!this._editingDraftId) return; // Commit should never be reachable without a reserved draft first
    const machineId = document.getElementById('cyc-machine').value;
    const conflictsWithOther = (this._openByMachine && this._openByMachine[machineId])
      || (this._draftRows || []).find(d => d.machine_id === machineId && d.id !== this._editingDraftId);
    if (conflictsWithOther) {
      UI.toast(`${machineId} already has a cycle in progress or awaiting start — complete or resolve it first`, true);
      return;
    }
    const machine = this._machines.find(m => m.machine_id === machineId);
    const loadContents = (document.querySelector('textarea[name="load_contents"]').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const fields = {
      machine_id: machineId,
      machine_type: machine ? machine.machine_type : 'autoclave',
      includes_implants: this._implantGetter ? this._implantGetter() : false,
      load_contents: loadContents
    };
    const btn = document.getElementById('cyc-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.updateCycle(this._editingDraftId, fields);
        if (this._isFreshReservation) {
          this._isFreshReservation = false;
          this._resetPhase1Form();
          this._loadDrafts();
          this._showCommitConfirmation({ ...result, cycle_number: document.getElementById('cyc-phase1-title').textContent.replace('New Cycle — ', '') });
        } else {
          UI.writeResultToast(result, 'Draft updated');
          this._resetPhase1Form();
          this._loadDrafts();
        }
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  // A toast alone was easy to miss — staff need a clear, unmissable
  // confirmation of the assigned cycle number and where to go next
  // (Phase 2, below), not just a small notification in the corner.
  _showCommitConfirmation(result) {
    const cycleNumber = (result && result.cycle_number) || '';
    const offline = result && result.queued;
    const modal = UI.showModal(`
      <h3 style="color:var(--green);">✓ Committed${cycleNumber ? ` — ${UI.escapeHtml(cycleNumber)}` : ''}</h3>
      <div class="modal-desc">${offline
        ? 'Saved on this device — will sync and get its official cycle number once you\'re back online.'
        : 'This cycle now has its number and is waiting in the "Awaiting start" section below. Load the chamber, then tap Start Cycle there when it\'s actually running.'}</div>
      <div class="modal-actions"><button class="btn btn-primary" id="cyc-commit-ok">Got it</button></div>
    `);
    modal.querySelector('#cyc-commit-ok').addEventListener('click', () => UI.closeModal());
  },

  async _loadDrafts() {
    const wrap = document.getElementById('cyc-draft-list');
    try {
      // Only show drafts that have actually been through Commit at least
      // once (machine_id set) — a freshly-reserved cycle still being
      // filled in for the first time shouldn't appear here yet, it's
      // still sitting in the Phase 1 form itself.
      const rows = (await DB.listDraftCycles()).filter(r => r.machine_id);
      this._draftRows = rows;
      document.getElementById('cyc-draft-count').textContent = rows.length;
      this._syncOpenWarning(document.getElementById('cyc-machine').value);
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing committed and waiting to start.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
            <div>
              <strong>${UI.escapeHtml(r.machine_id)}</strong> · ${UI.escapeHtml(r.cycle_number)}${r.includes_implants ? ' · <span style="color:var(--red);">Implant load</span>' : ''}
              <div class="hint" style="margin-top:4px;white-space:pre-line;">${UI.escapeHtml((r.load_contents || []).join(', ')) || '(no items listed)'}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:flex-end;">
              <div class="field" style="margin-bottom:0;">
                <label class="hint">Exposure time</label>
                <select id="cyc-draft-exposure-${r.id}">
                  <option value="">—</option>
                  ${['4 minutes','15 minutes','20 minutes','25 minutes','30 minutes','45 minutes'].map(v => `<option ${r.exposure_time_minutes === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
              <button class="btn btn-sm" data-abort="${r.id}">Abort</button>
              <button class="btn btn-sm" data-edit-draft="${r.id}">Back / Edit</button>
              <button class="btn btn-sm btn-primary" data-start="${r.id}">Start Cycle</button>
            </div>
          </div>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-edit-draft]').forEach(btn => btn.addEventListener('click', () => this._editDraft(this._draftRows.find(r => r.id === btn.dataset.editDraft))));
      wrap.querySelectorAll('[data-start]').forEach(btn => btn.addEventListener('click', () => this._startCycle(btn.dataset.start)));
      wrap.querySelectorAll('[data-abort]').forEach(btn => btn.addEventListener('click', () => this._abortDraft(btn.dataset.abort)));
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load drafts.</div>`;
    }
  },

  async _startCycle(id) {
    const exposureSelect = document.getElementById(`cyc-draft-exposure-${id}`);
    const exposure_time_minutes = exposureSelect ? exposureSelect.value : '';
    if (!exposure_time_minutes) {
      UI.toast('Pick the exposure time before starting the cycle', true);
      exposureSelect.focus();
      return;
    }
    try {
      const result = await DB.updateCycle(id, {
        status: 'In Progress',
        time_start: TrueTime.nowISO(),
        operator_start: Auth.currentStaff.name,
        exposure_time_minutes
      });
      UI.writeResultToast(result, 'Cycle started');
      this._loadDrafts();
      this._loadOpen();
    } catch (e) { UI.toast('Could not start: ' + e.message, true); }
  },

  _abortDraft(id) {
    const row = (this._draftRows || []).find(r => r.id === id);
    const modal = UI.showModal(`
      <h3 style="color:var(--red);">Abort Cycle ${row ? UI.escapeHtml(row.cycle_number) : ''}?</h3>
      <div class="modal-desc">This cycle never actually started — its number will be released and can be used by the next one. This cannot be undone.</div>
      <div class="modal-actions">
        <button class="btn" id="cyc-abort-cancel">Cancel</button>
        <button class="btn btn-danger" id="cyc-abort-confirm">Abort</button>
      </div>
    `);
    modal.querySelector('#cyc-abort-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#cyc-abort-confirm').addEventListener('click', async () => {
      try {
        await DB.deleteCycleDraft(id);
        if (this._editingDraftId === id) { FormDraft.clear('cyc-phase1'); this._resetPhase1Form(); }
        UI.toast('Cycle aborted — number released');
        UI.closeModal();
        this._loadDrafts();
      } catch (e) { UI.toast('Could not abort: ' + e.message, true); }
    });
  },

  // Block committing/saving a Draft for a machine that already has a
  // DIFFERENT open cycle or draft (backlog item #2) — same pattern as
  // Equipment Downtime. When editing, the draft being edited must not
  // count as a conflict with itself (its own machine_id is fine to keep).
  _syncOpenWarning(machineId) {
    const warn = document.getElementById('cyc-open-warning');
    const submitBtn = document.getElementById('cyc-submit');
    const openInProgress = this._openByMachine && this._openByMachine[machineId];
    const openDraft = (this._draftRows || []).find(d => d.machine_id === machineId && d.id !== this._editingDraftId);
    const open = openInProgress || openDraft;
    if (open) {
      warn.classList.remove('hidden');
      warn.innerHTML = open.time_start
        ? `<strong>${UI.escapeHtml(machineId)}</strong> already has a cycle in progress, started by ${UI.escapeHtml(open.operator_start)} at ${UI.fmtDateTime(open.time_start)}. Complete it below before starting a new one for this machine.`
        : `<strong>${UI.escapeHtml(machineId)}</strong> already has a committed draft (${UI.escapeHtml(open.cycle_number)}) awaiting start below.`;
      submitBtn.disabled = true;
    } else {
      warn.classList.add('hidden');
      submitBtn.disabled = false;
    }
  },

  async _loadOpen() {
    const wrap = document.getElementById('cyc-open-list');
    try {
      const rows = await DB.listOpenCycles();
      this._openByMachine = {};
      rows.forEach(r => { this._openByMachine[r.machine_id] = r; });
      document.getElementById('cyc-open-count').textContent = rows.length;
      this._syncOpenWarning(document.getElementById('cyc-machine').value);
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">No cycles currently in progress.</div>`;
        return;
      }
      const implantRows = rows.filter(r => r.includes_implants);
      let biByCycle = {};
      if (implantRows.length > 0) {
        try {
          const biRows = await DB.listQaTestsByCycleIds(implantRows.map(r => r.id));
          biRows.forEach(b => { biByCycle[b.cycle_id] = b; });
        } catch (e) { /* leave empty — inline section will show Initiate */ }
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
            <div>
              <strong>${UI.escapeHtml(r.machine_id)}</strong>${r.cycle_number ? ` · Cycle ${UI.escapeHtml(r.cycle_number)}` : ''}
              <div class="hint" style="margin-top:4px;">Started ${UI.fmtDateTime(r.time_start)} by ${UI.escapeHtml(r.operator_start)}</div>
            </div>
            <button class="btn btn-sm" data-stop="${r.id}">Stop</button>
          </div>
          <div style="margin-top:10px;font-size:13px;">
            <span class="hint">Items in this cycle:</span> ${UI.escapeHtml((r.load_contents || []).join(', ')) || '(none listed)'}
          </div>
          <div style="border-top:1px solid rgba(244,202,20,0.5);margin-top:12px;padding-top:12px;" id="cyc-open-params-${r.id}"></div>
          <div style="border-top:1px solid rgba(244,202,20,0.5);margin-top:12px;padding-top:12px;" id="cyc-timeline-${r.id}"></div>
          ${r.includes_implants ? `<div style="border-top:1px solid rgba(244,202,20,0.5);margin-top:12px;padding-top:12px;" id="cyc-open-bi-${r.id}"></div>` : ''}
        </div>
      `).join('');
      wrap.querySelectorAll('[data-stop]').forEach(btn => {
        btn.addEventListener('click', () => this._openStopModal(rows.find(r => r.id === btn.dataset.stop)));
      });
      rows.forEach(r => this._renderPhase3Params(document.getElementById(`cyc-open-params-${r.id}`), r));
      rows.forEach(r => this._renderTimeline(document.getElementById(`cyc-timeline-${r.id}`), r));
      this._openRows = rows; // referenced by the 1s tick to keep countdowns/timeline live
      implantRows.forEach(r => {
        const container = document.getElementById(`cyc-open-bi-${r.id}`);
        if (container) this._renderInlineBi(container, r, biByCycle[r.id], () => this._loadOpen());
      });
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load in-progress cycles.</div>`;
    }
  },

  // ---------------- Phase 3: pressures/temp/exposure, entered once the
  // cycle is actually running rather than upfront ----------------
  _renderPhase3Params(container, cycle) {
    if (!container) return;
    const isFlash = cycle.machine_type === 'flash_sterilizer';
    const highOption = isFlash ? '135°C' : '138°C';
    const filled = cycle.temperature_set_point || cycle.exposure_time_minutes;
    const tapeVal = cycle.class1_tape_changed || '';
    const showFailedPacks = tapeVal === 'No' || tapeVal === 'Cannot Be Determined';
    container.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">Phase 3 — Cycle parameters ${filled ? '<span class="hint" style="font-weight:400;">· saved, edit and re-save if needed</span>' : ''}</div>
      <div class="form-grid">
        ${isFlash ? `
          <div class="field">
            <label>Cycle type</label>
            <select id="cyc-p3-type-${cycle.id}">
              <option value="">—</option>
              <option ${cycle.cycle_type === 'Unwrapped Non-Porous (Metal Instruments)' ? 'selected' : ''}>Unwrapped Non-Porous (Metal Instruments)</option>
              <option ${cycle.cycle_type === 'Unwrapped Porous (Rubber / Silicone components)' ? 'selected' : ''}>Unwrapped Porous (Rubber / Silicone components)</option>
              <option ${cycle.cycle_type === 'Terminal/Wrapped (Pouched)' ? 'selected' : ''}>Terminal/Wrapped (Pouched)</option>
              <option value="Other" ${cycle.cycle_type && !['Unwrapped Non-Porous (Metal Instruments)','Unwrapped Porous (Rubber / Silicone components)','Terminal/Wrapped (Pouched)'].includes(cycle.cycle_type) ? 'selected' : ''}>Other</option>
            </select>
            <input type="text" id="cyc-p3-type-other-${cycle.id}" placeholder="Specify cycle type" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;" value="${cycle.cycle_type && !['Unwrapped Non-Porous (Metal Instruments)','Unwrapped Porous (Rubber / Silicone components)','Terminal/Wrapped (Pouched)'].includes(cycle.cycle_type) ? UI.escapeHtml(cycle.cycle_type) : ''}">
          </div>
        ` : `
          <div class="field"><label>Boil pressure</label><input type="text" id="cyc-p3-boil-${cycle.id}" value="${UI.escapeHtml(cycle.boil_pressure) || ''}"></div>
          <div class="field"><label>Jacket pressure</label><input type="text" id="cyc-p3-jacket-${cycle.id}" value="${UI.escapeHtml(cycle.jacket_pressure) || ''}"></div>
          <div class="field"><label>Chamber pressure</label><input type="text" id="cyc-p3-chamber-${cycle.id}" value="${UI.escapeHtml(cycle.chamber_pressure) || ''}"></div>
        `}
        <div class="field">
          <label>Temperature set point</label>
          <select id="cyc-p3-temp-${cycle.id}">
            <option value="">—</option><option ${cycle.temperature_set_point === '121°C' ? 'selected' : ''}>121°C</option>
            <option ${cycle.temperature_set_point === '132°C' ? 'selected' : ''}>132°C</option>
            <option ${cycle.temperature_set_point === highOption ? 'selected' : ''}>${highOption}</option>
          </select>
        </div>
        <div class="field">
          <label>Exposure time <span class="hint">decided at Start Cycle</span></label>
          <input type="text" value="${UI.escapeHtml(cycle.exposure_time_minutes) || '—'}" disabled style="color:var(--ink-soft);">
        </div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>Level 1 (Type 1) autoclave indicator tape Color Change</label>
        <div class="radio-row" id="cyc-p3-tape-row-${cycle.id}">
          <button type="button" class="radio-chip ${tapeVal === 'Yes' ? 'active-good' : ''}" data-val="Yes">Yes</button>
          <button type="button" class="radio-chip ${tapeVal === 'No' ? 'active-bad' : ''}" data-val="No">No</button>
          <button type="button" class="radio-chip ${tapeVal === 'Cannot Be Determined' ? 'active-bad' : ''}" data-val="Cannot Be Determined">Cannot Be Determined</button>
        </div>
        <div id="cyc-p3-tape-packs-wrap-${cycle.id}" class="${showFailedPacks ? '' : 'hidden'}" style="margin-top:8px;">
          <label class="hint">List the pack(s) that did NOT color change</label>
          <textarea id="cyc-p3-tape-packs-${cycle.id}" rows="2">${UI.escapeHtml(cycle.class1_tape_failed_packs) || ''}</textarea>
        </div>
      </div>
      ${isFlash ? `
        <div class="field" style="margin-top:10px;"><label>Usage disposition</label>
          <select id="cyc-p3-usage-${cycle.id}">
            <option value="">—</option>
            <option ${cycle.usage_disposition === 'For Storage' ? 'selected' : ''}>For Storage</option>
            <option ${cycle.usage_disposition === 'For Immediate Use' ? 'selected' : ''}>For Immediate Use</option>
          </select>
          <div class="hint" style="margin-top:6px;">For Storage: confirm the pouch and cassette are fully dry first — sterility can't be assured for long-term storage otherwise, and storage is capped at 60 minutes max.</div>
        </div>
        <div id="cyc-p3-storage-fields-${cycle.id}" class="${cycle.usage_disposition === 'For Storage' ? '' : 'hidden'}">
          ${this._captureTimeField('storage-end-' + cycle.id, 'Time end of sterilization')}
        </div>
        <div id="cyc-p3-immediate-fields-${cycle.id}" class="${cycle.usage_disposition === 'For Immediate Use' ? '' : 'hidden'}">
          <div class="form-grid">
            <div class="field"><label>Surgeon</label><input type="text" id="cyc-p3-surgeon-${cycle.id}" value="${UI.escapeHtml(cycle.surgeon) || ''}"></div>
            <div class="field"><label>Operating room</label>
              <select id="cyc-p3-or-${cycle.id}">
                <option value="">—</option>
                <option ${cycle.operating_room === 'OR 1' ? 'selected' : ''}>OR 1</option>
                <option ${cycle.operating_room === 'OR 2' ? 'selected' : ''}>OR 2</option>
                <option ${cycle.operating_room === 'OR 3' ? 'selected' : ''}>OR 3</option>
                <option value="Other" ${cycle.operating_room && !['OR 1','OR 2','OR 3'].includes(cycle.operating_room) ? 'selected' : ''}>Other</option>
              </select>
              <input type="text" id="cyc-p3-or-other-${cycle.id}" placeholder="Specify" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;" value="${cycle.operating_room && !['OR 1','OR 2','OR 3'].includes(cycle.operating_room) ? UI.escapeHtml(cycle.operating_room) : ''}">
            </div>
          </div>
          <div class="field" style="margin-top:10px;"><label>Reason for flash sterilization</label>
            <div class="radio-row" id="cyc-p3-reason-row-${cycle.id}">
              ${['Dropped/Critical Instrument', 'Additional Unanticipated Need', 'Set Incomplete', 'Other'].map(v => `<button type="button" class="radio-chip ${(cycle.flash_reason || []).includes(v) ? 'active-good' : ''}" data-val="${v}">${v === 'Additional Unanticipated Need' ? 'Additional Need' : v}</button>`).join('')}
            </div>
            <input type="text" id="cyc-p3-reason-other-${cycle.id}" placeholder="Specify reason" class="${(cycle.flash_reason || []).includes('Other') ? '' : 'hidden'}" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;" value="${UI.escapeHtml((cycle.flash_reason || []).find(v => !['Dropped/Critical Instrument','Additional Unanticipated Need','Set Incomplete','Other'].includes(v))) || ''}">
          </div>
          ${this._captureTimeField('delivered-' + cycle.id, 'Time delivered to sterile field')}
          <div class="field"><label>Received by (OR nurse/surgeon)</label><input type="text" id="cyc-p3-received-${cycle.id}" value="${UI.escapeHtml(cycle.received_by) || ''}"></div>
        </div>
      ` : ''}
      <div class="field" style="margin-top:10px;"><label>Remarks</label><textarea id="cyc-p3-remarks-${cycle.id}" rows="2">${UI.escapeHtml(cycle.remarks) || ''}</textarea></div>
      <div id="cyc-countdown-${cycle.id}" style="margin-top:10px;font-weight:700;"></div>
    `;

    const tapeRow = document.getElementById(`cyc-p3-tape-row-${cycle.id}`);
    tapeRow.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      tapeRow.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = chip.dataset.val === 'Yes' ? 'radio-chip active-good' : 'radio-chip active-bad';
      document.getElementById(`cyc-p3-tape-packs-wrap-${cycle.id}`).classList.toggle('hidden', chip.dataset.val === 'Yes');
    }));

    if (isFlash) {
      document.getElementById(`cyc-p3-usage-${cycle.id}`).addEventListener('change', (e) => {
        document.getElementById(`cyc-p3-immediate-fields-${cycle.id}`).classList.toggle('hidden', e.target.value !== 'For Immediate Use');
        document.getElementById(`cyc-p3-storage-fields-${cycle.id}`).classList.toggle('hidden', e.target.value !== 'For Storage');
      });
      document.getElementById(`cyc-p3-or-${cycle.id}`).addEventListener('change', (e) => {
        document.getElementById(`cyc-p3-or-other-${cycle.id}`).classList.toggle('hidden', e.target.value !== 'Other');
      });
      const reasonRow = document.getElementById(`cyc-p3-reason-row-${cycle.id}`);
      reasonRow.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
        chip.classList.toggle('active-good');
        document.getElementById(`cyc-p3-reason-other-${cycle.id}`).classList.toggle('hidden', !reasonRow.querySelector('[data-val="Other"]').classList.contains('active-good'));
      }));
      this._wireCaptureField(document, 'storage-end-' + cycle.id);
      this._wireCaptureField(document, 'delivered-' + cycle.id);
    }
  },

  // Standardized durations, per the SOP — flush is always 1 minute,
  // drying is always 30 minutes. Cooldown has no fixed duration (it
  // depends on the load), so that step is manually marked complete
  // once cooldown is actually observed to be done, rather than timed.
  FLUSH_MS: 60 * 1000,
  DRYING_MS: 30 * 60 * 1000,

  _renderTimeline(container, cycle) {
    if (!container) return;
    const now = TrueTime.now().getTime();
    const flushAt = cycle.time_knob_to_flush ? new Date(cycle.time_knob_to_flush).getTime() : null;
    const dryingAt = cycle.time_knob_to_drying ? new Date(cycle.time_knob_to_drying).getTime() : null;
    const hatchAt = cycle.time_knob_off_hatch_open ? new Date(cycle.time_knob_off_hatch_open).getTime() : null;
    const cooldownEndAt = cycle.cooldown_end ? new Date(cycle.cooldown_end).getTime() : null;

    const flushDueAt = flushAt ? flushAt + this.FLUSH_MS : null;
    const dryingDueAt = dryingAt ? dryingAt + this.DRYING_MS : null;
    const flushReady = flushDueAt && now >= flushDueAt;
    const dryingReady = dryingDueAt && now >= dryingDueAt;

    const step = (label, state, extra) => {
      // state: 'done' | 'active' | 'waiting' | 'pending'
      const cls = state === 'done' ? 'done' : state === 'pending' ? 'pending' : '';
      return `<div class="cyc-timeline-step ${cls}"><div style="font-weight:700;font-size:12.5px;">${label}</div>${extra}</div>`;
    };
    const arrow = `<div class="cyc-timeline-arrow">→</div>`;
    const countdown = (dueAt) => {
      const ms = Math.max(0, dueAt - now);
      const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
      const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      return `<div class="mono" style="font-size:15px;">${mm}:${ss}</div>`;
    };

    let html = '<div class="cyc-timeline">';

    // Step 1 — Knob to Flush
    if (!flushAt) {
      html += step('Knob to Flush', 'active', `<button class="btn btn-sm btn-primary" data-tl-flush="${cycle.id}">Start</button>`);
    } else {
      html += step('Knob to Flush', 'done', `<div class="hint" style="font-size:11px;">${UI.fmtDateTime(cycle.time_knob_to_flush)}</div>`);
    }
    html += arrow;

    // Step 2 — Knob to Drying (gated on the 1-minute flush timer)
    if (!flushAt) {
      html += step('Knob to Drying', 'pending', `<div class="hint" style="font-size:11px;">1 min after flush</div>`);
    } else if (dryingAt) {
      html += step('Knob to Drying', 'done', `<div class="hint" style="font-size:11px;">${UI.fmtDateTime(cycle.time_knob_to_drying)}</div>`);
    } else if (!flushReady) {
      html += step('Knob to Drying', '', countdown(flushDueAt));
    } else {
      html += step('Knob to Drying', 'active', `<button class="btn btn-sm btn-glow" data-tl-drying="${cycle.id}">Start</button>`);
    }
    html += arrow;

    // Step 3 — Open Hatch (gated on the 30-minute drying timer)
    if (!dryingAt) {
      html += step('Open Hatch', 'pending', `<div class="hint" style="font-size:11px;">30 min after drying</div>`);
    } else if (hatchAt) {
      html += step('Open Hatch', 'done', `<div class="hint" style="font-size:11px;">${UI.fmtDateTime(cycle.time_knob_off_hatch_open)}</div>`);
    } else if (!dryingReady) {
      html += step('Open Hatch', '', countdown(dryingDueAt));
    } else {
      html += step('Open Hatch', 'active', `<button class="btn btn-sm btn-glow" data-tl-hatch="${cycle.id}">Open Hatch</button>`);
    }
    html += arrow;

    // Step 4 — Cooldown (starts automatically on Open Hatch; no fixed
    // duration, so it's marked complete manually once actually done)
    if (!hatchAt) {
      html += step('Cooldown', 'pending', `<div class="hint" style="font-size:11px;">after hatch opens</div>`);
    } else if (cooldownEndAt) {
      html += step('Cooldown', 'done', `<div class="hint" style="font-size:11px;">${UI.fmtDateTime(cycle.cooldown_end)}</div>`);
    } else {
      const elapsedMs = now - hatchAt;
      const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
      const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');
      html += step('Cool Down Initiated', 'active', `<div class="mono" style="font-size:15px;">${mm}:${ss}</div><button class="btn btn-sm" data-tl-cooldown="${cycle.id}" style="margin-top:4px;">Mark Complete</button>`);
    }
    html += arrow;

    // Step 5 — Completed (only reachable once cooldown is marked done)
    if (!cooldownEndAt) {
      html += step('Completed', 'pending', `<div class="hint" style="font-size:11px;">after cooldown</div>`);
    } else {
      html += step('Completed', 'active', `<button class="btn btn-sm btn-primary" data-tl-complete="${cycle.id}">Completed</button>`);
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelector('[data-tl-flush]')?.addEventListener('click', () => this._advanceTimeline(cycle, { time_knob_to_flush: TrueTime.nowISO() }));
    container.querySelector('[data-tl-drying]')?.addEventListener('click', () => this._advanceTimeline(cycle, { time_knob_to_drying: TrueTime.nowISO() }));
    container.querySelector('[data-tl-hatch]')?.addEventListener('click', () => this._advanceTimeline(cycle, { time_knob_off_hatch_open: TrueTime.nowISO(), cooldown_start: TrueTime.nowISO() }));
    container.querySelector('[data-tl-cooldown]')?.addEventListener('click', () => this._advanceTimeline(cycle, { cooldown_end: TrueTime.nowISO() }));
    container.querySelector('[data-tl-complete]')?.addEventListener('click', () => this._completeCycle(cycle));
  },

  async _advanceTimeline(cycle, fields) {
    try {
      const result = await DB.updateCycle(cycle.id, fields);
      Object.assign(cycle, fields);
      UI.writeResultToast(result);
      this._renderTimeline(document.getElementById(`cyc-timeline-${cycle.id}`), cycle);
    } catch (e) { UI.toast('Could not save: ' + e.message, true); }
  },

  // The final step — reads the parameter fields (still entered inline,
  // just no longer saved via their own separate button), validates
  // nothing required is blank, and saves everything plus time_end in
  // one go. Blocking on blanks here (rather than at each individual
  // field) means the parameters can be filled in gradually throughout
  // the cycle without being forced to commit early, while still
  // guaranteeing nothing is missing by the time the cycle is done.
  async _completeCycle(cycle) {
    const isFlash = cycle.machine_type === 'flash_sterilizer';
    const fields = isFlash
      ? { cycle_type: document.getElementById(`cyc-p3-type-${cycle.id}`).value === 'Other' ? (document.getElementById(`cyc-p3-type-other-${cycle.id}`).value || '') : (document.getElementById(`cyc-p3-type-${cycle.id}`).value || '') }
      : {
          boil_pressure: document.getElementById(`cyc-p3-boil-${cycle.id}`).value || '',
          jacket_pressure: document.getElementById(`cyc-p3-jacket-${cycle.id}`).value || '',
          chamber_pressure: document.getElementById(`cyc-p3-chamber-${cycle.id}`).value || ''
        };
    fields.temperature_set_point = document.getElementById(`cyc-p3-temp-${cycle.id}`).value || '';

    const tapeChip = document.querySelector(`#cyc-p3-tape-row-${cycle.id} .radio-chip.active-good, #cyc-p3-tape-row-${cycle.id} .radio-chip.active-bad`);
    fields.class1_tape_changed = tapeChip ? tapeChip.dataset.val : '';
    const tapePacks = document.getElementById(`cyc-p3-tape-packs-${cycle.id}`).value.trim();

    const blankLabels = { cycle_type: 'Cycle type', boil_pressure: 'Boil pressure', jacket_pressure: 'Jacket pressure', chamber_pressure: 'Chamber pressure', temperature_set_point: 'Temperature', class1_tape_changed: 'Tape color change' };
    const blanks = Object.entries(fields).filter(([, v]) => !v).map(([k]) => blankLabels[k]);
    if ((fields.class1_tape_changed === 'No' || fields.class1_tape_changed === 'Cannot Be Determined') && !tapePacks) {
      blanks.push('List of packs that did not color change');
    }
    if (blanks.length > 0) {
      UI.toast(`Fill in before completing: ${blanks.join(', ')}`, true);
      return;
    }
    fields.class1_tape_failed_packs = (fields.class1_tape_changed === 'No' || fields.class1_tape_changed === 'Cannot Be Determined') ? tapePacks : null;

    if (isFlash) {
      const orVal = document.getElementById(`cyc-p3-or-${cycle.id}`).value;
      fields.usage_disposition = document.getElementById(`cyc-p3-usage-${cycle.id}`).value || '';
      fields.surgeon = document.getElementById(`cyc-p3-surgeon-${cycle.id}`).value || '';
      fields.operating_room = orVal === 'Other' ? (document.getElementById(`cyc-p3-or-other-${cycle.id}`).value || '') : (orVal || '');
      const reasonRow = document.getElementById(`cyc-p3-reason-row-${cycle.id}`);
      const reasonVals = Array.from(reasonRow.querySelectorAll('.radio-chip.active-good')).map(c => c.dataset.val);
      const reasonOtherText = document.getElementById(`cyc-p3-reason-other-${cycle.id}`).value;
      const deliveredVal = document.getElementById(`cc-delivered-${cycle.id}`)?.value || '';
      fields.received_by = document.getElementById(`cyc-p3-received-${cycle.id}`).value || '';
      const storageEndVal = document.getElementById(`cc-storage-end-${cycle.id}`)?.value || '';

      const flashBlanks = [];
      if (!fields.usage_disposition) flashBlanks.push('Usage disposition');
      if (fields.usage_disposition === 'For Storage' && !storageEndVal) flashBlanks.push('Time end of sterilization');
      if (fields.usage_disposition === 'For Immediate Use') {
        if (!fields.surgeon) flashBlanks.push('Surgeon');
        if (!fields.operating_room) flashBlanks.push('Operating room');
        if (reasonVals.length === 0) flashBlanks.push('Reason for flash sterilization');
        if (!deliveredVal) flashBlanks.push('Time delivered to sterile field');
        if (!fields.received_by) flashBlanks.push('Received by');
      }
      if (flashBlanks.length > 0) {
        UI.toast(`Fill in before completing: ${flashBlanks.join(', ')}`, true);
        return;
      }

      fields.flash_reason = reasonVals.includes('Other')
        ? reasonVals.filter(v => v !== 'Other').concat(reasonOtherText ? [reasonOtherText] : ['Other'])
        : reasonVals;
      fields.time_delivered_to_sterile_field = deliveredVal || null;
      fields.storage_end_time = storageEndVal || null;
    }
    fields.remarks = document.getElementById(`cyc-p3-remarks-${cycle.id}`).value || null;

    Object.keys(fields).forEach(k => { if (fields[k] === '') fields[k] = null; });
    fields.parameters_saved_at = TrueTime.nowISO();
    fields.time_end = TrueTime.nowISO();
    fields.status = 'Completed';

    try {
      const result = await DB.updateCycle(cycle.id, fields);
      UI.writeResultToast(result, 'Cycle completed');
      this._loadOpen();
      this._loadDrafts();
      this._loadTable();
    } catch (e) { UI.toast('Could not complete: ' + e.message, true); }
  },

  _captureTimeField(id, label) {
    return `
      <div class="field" style="margin-bottom:10px;">
        <label>${label}</label>
        <div style="display:flex;align-items:center;gap:10px;">
          <button type="button" class="btn btn-sm" id="cc-capture-${id}">Record now</button>
          <span class="hint" id="cc-captured-${id}"></span>
        </div>
        <input type="hidden" id="cc-${id}">
      </div>
    `;
  },

  _wireCaptureField(modal, id) {
    modal.querySelector(`#cc-capture-${id}`).addEventListener('click', () => {
      const now = TrueTime.now();
      modal.querySelector(`#cc-${id}`).value = now.toISOString();
      modal.querySelector(`#cc-captured-${id}`).textContent = `✓ ${UI.fmtDateTime(now.toISOString())} — tap to recapture`;
      modal.querySelector(`#cc-capture-${id}`).textContent = 'Recapture';
    });
  },

  _printCycle(r) {
    const isFlash = r.machine_type === 'flash_sterilizer';
    const rows = [
      ['Machine', r.machine_id], ['Cycle number', r.cycle_number], ['Status', r.status],
      ['Committed', UI.fmtDateTime(r.created_at)],
      ['Started', r.time_start ? `${UI.fmtDateTime(r.time_start)} by ${r.operator_start || '—'}` : '—'],
      ['Parameters saved', UI.fmtDateTime(r.parameters_saved_at)],
      ['Knob to flush', UI.fmtDateTime(r.time_knob_to_flush)],
      ['Knob to drying', UI.fmtDateTime(r.time_knob_to_drying)],
      ['Knob off / hatch open', UI.fmtDateTime(r.time_knob_off_hatch_open)],
      ['Cooldown start', UI.fmtDateTime(r.cooldown_start)],
      ['Cooldown end', UI.fmtDateTime(r.cooldown_end)],
      ['Completed', UI.fmtDateTime(r.time_end)],
      ['Stopped', r.stopped_at ? `${UI.fmtDateTime(r.stopped_at)} by ${r.stopped_by || '—'}` : '—'],
      ['Stop reason', r.stop_remarks],
      ['Alarm acknowledged', r.alarm_acknowledged_at ? `${UI.fmtDateTime(r.alarm_acknowledged_at)} by ${r.alarm_acknowledged_by || '—'}` : '—']
    ];
    const paramRows = isFlash
      ? [['Cycle type', r.cycle_type]]
      : [['Boil pressure', r.boil_pressure], ['Jacket pressure', r.jacket_pressure], ['Chamber pressure', r.chamber_pressure]];
    paramRows.push(['Temperature', r.temperature_set_point], ['Exposure time', r.exposure_time_minutes], ['Level 1 (Type 1) tape color change', r.class1_tape_changed], ['Packs that did not color change', r.class1_tape_failed_packs]);
    const sections = [
      { heading: 'Cycle Information', rows },
      { heading: 'Parameters', rows: paramRows },
      { heading: 'Load Contents', rows: [['Items', (r.load_contents || []).join(', ') || '(none listed)']] }
    ];
    if (isFlash) {
      sections.push({ heading: 'Disposition', rows: [
        ['Usage disposition', r.usage_disposition], ['Storage end time', UI.fmtDateTime(r.storage_end_time)],
        ['Surgeon', r.surgeon],
        ['Operating room', r.operating_room], ['Reason', r.flash_reason],
        ['Delivered to sterile field', UI.fmtDateTime(r.time_delivered_to_sterile_field)], ['Received by', r.received_by]
      ]});
    }
    PrintReport.generate({ title: 'STERILIZATION CYCLE LOG REPORT', refNumber: r.serial_number || r.cycle_number, sections });
  },

  _renderCycleDetails(r) {
    const isFlash = r.machine_type === 'flash_sterilizer';
    const row = (label, value) => value ? `<div style="margin-bottom:4px;"><span class="hint">${label}:</span> ${value}</div>` : '';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-weight:700;margin-bottom:6px;">Timeline</div>
          ${row('Committed', UI.fmtDateTime(r.created_at))}
          ${row('Started', r.time_start ? `${UI.fmtDateTime(r.time_start)} by ${UI.escapeHtml(r.operator_start) || '—'}` : null)}
          ${row('Parameters saved', UI.fmtDateTime(r.parameters_saved_at))}
          ${row('Alarm acknowledged', r.alarm_acknowledged_at ? `${UI.fmtDateTime(r.alarm_acknowledged_at)} by ${UI.escapeHtml(r.alarm_acknowledged_by) || '—'}` : null)}
          ${row('Knob to flush', UI.fmtDateTime(r.time_knob_to_flush))}
          ${row('Knob to drying', UI.fmtDateTime(r.time_knob_to_drying))}
          ${row('Knob off / hatch open', UI.fmtDateTime(r.time_knob_off_hatch_open))}
          ${row('Cooldown start', UI.fmtDateTime(r.cooldown_start))}
          ${row('Cooldown end', UI.fmtDateTime(r.cooldown_end))}
          ${row('Completed', UI.fmtDateTime(r.time_end))}
          ${row('Stopped', r.stopped_at ? `${UI.fmtDateTime(r.stopped_at)} by ${UI.escapeHtml(r.stopped_by) || '—'}` : null)}
          ${r.stop_remarks ? row('Stop reason', UI.escapeHtml(r.stop_remarks)) : ''}
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:6px;">Parameters</div>
          ${isFlash ? row('Cycle type', UI.escapeHtml(r.cycle_type)) : ''}
          ${!isFlash ? row('Boil pressure', UI.escapeHtml(r.boil_pressure)) : ''}
          ${!isFlash ? row('Jacket pressure', UI.escapeHtml(r.jacket_pressure)) : ''}
          ${!isFlash ? row('Chamber pressure', UI.escapeHtml(r.chamber_pressure)) : ''}
          ${row('Temperature', UI.escapeHtml(r.temperature_set_point))}
          ${row('Exposure time', UI.escapeHtml(r.exposure_time_minutes))}
          ${row('Level 1 (Type 1) tape color change', r.class1_tape_changed)}
          ${r.class1_tape_failed_packs ? row('Packs that did not color change', UI.escapeHtml(r.class1_tape_failed_packs)) : ''}
        </div>
      </div>
      ${isFlash ? `
      <div style="margin-top:12px;">
        <div style="font-weight:700;margin-bottom:6px;">Disposition</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            ${row('Usage disposition', UI.escapeHtml(r.usage_disposition))}
            ${row('Storage end time', UI.fmtDateTime(r.storage_end_time))}
          </div>
          <div>
            ${row('Surgeon', UI.escapeHtml(r.surgeon))}
            ${row('Operating room', UI.escapeHtml(r.operating_room))}
            ${row('Reason', UI.escapeHtml(r.flash_reason))}
            ${row('Delivered to sterile field', UI.fmtDateTime(r.time_delivered_to_sterile_field))}
            ${row('Received by', UI.escapeHtml(r.received_by))}
          </div>
        </div>
      </div>` : ''}
      <div style="margin-top:12px;">
        <div style="font-weight:700;margin-bottom:6px;">Load contents</div>
        <div style="white-space:pre-line;">${UI.escapeHtml((r.load_contents || []).join('\n')) || '(no items listed)'}</div>
      </div>
    `;
  },

  async _loadTable() {
    const tbody = document.getElementById('cyc-tbody');
    try {
      const rows = await DB.listCycles({ from: UI.daysAgoStr(30), limit: 100 });
      this._tableRows = rows;
      SearchBar.wire('cyc-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'time_start', ['machine_id', 'cycle_number', 'load_contents', 'operator_start'])));
      await this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">Couldn't load cycles: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  async _renderTable(rows, tbodyId = 'cyc-tbody', countId = 'cyc-count') {
    const tbody = document.getElementById(tbodyId);
    document.getElementById(countId).textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">No cycles match.</td></tr>`;
      return;
    }
    const implantCycles = rows.filter(r => r.includes_implants);
    let biByCycle = {};
    if (implantCycles.length > 0) {
      try {
        const biRows = await DB.listQaTestsByCycleIds(implantCycles.map(r => r.id));
        biRows.forEach(b => { biByCycle[b.cycle_id] = b; });
      } catch (e) { /* leave empty — inline section will show Initiate */ }
    }
    tbody.innerHTML = rows.map(r => {
      const bi = r.includes_implants ? biByCycle[r.id] : null;
      const biVerified = bi && bi.bi_final_result;
      const biPending = r.includes_implants && !biVerified;
      return `
      <tr class="${biPending ? 'pending-highlight' : ''}">
        <td class="mono">${UI.escapeHtml(r.serial_number || r.cycle_number) || '—'}</td>
        <td><strong>${UI.escapeHtml(r.machine_id)}</strong></td>
        <td>${UI.escapeHtml(r.cycle_number) || '—'}</td>
        <td>${UI.fmtDateTime(r.time_start)}</td>
        <td>${UI.fmtDateTime(r.time_end)}</td>
        <td>${UI.escapeHtml(r.temperature_set_point) || '—'}</td>
        <td>${UI.escapeHtml(r.exposure_time_minutes) || '—'}</td>
        <td>${r.includes_implants ? (biVerified ? `<span class="badge ${bi.bi_final_result === 'FINAL PASS' ? 'badge-pass' : 'badge-fail'}">${bi.bi_final_result}</span>` : `<span class="badge badge-open">Pending</span>`) : '—'}</td>
        <td><span class="badge ${r.status === 'In Progress' ? 'badge-open' : 'badge-resolved'}">${r.status}</span></td>
        <td>
          ${biPending ? `<button class="btn btn-sm" data-bi-expand="${r.id}">${bi ? 'Log BI Result' : 'Initiate BI'}</button>` : ''}
        </td>
        <td><button class="btn btn-sm" data-details-toggle="${r.id}">Details ▸</button></td>
        <td><button class="btn btn-sm" data-print="${r.id}">Print</button></td>
      </tr>
      <tr id="cyc-details-row-${r.id}" style="display:none;"><td colspan="12" style="padding:14px 16px;background:var(--surface-sunken);">${this._renderCycleDetails(r)}</td></tr>
      ${biPending ? `<tr class="pending-highlight" id="cyc-bi-row-${r.id}" style="display:none;"><td colspan="12" style="padding:14px;"></td></tr>` : ''}
    `; }).join('');
    tbody.querySelectorAll('[data-print]').forEach(btn => {
      btn.addEventListener('click', () => this._printCycle(rows.find(r => r.id === btn.dataset.print)));
    });
    tbody.querySelectorAll('[data-details-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trWrap = document.getElementById(`cyc-details-row-${btn.dataset.detailsToggle}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? 'Details ▾' : 'Details ▸';
      });
    });
    tbody.querySelectorAll('[data-bi-expand]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = rows.find(r => r.id === btn.dataset.biExpand);
        const trWrap = document.getElementById(`cyc-bi-row-${row.id}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        if (isHidden) this._renderInlineBi(trWrap.querySelector('td'), row, biByCycle[row.id], () => this._loadTable());
      });
    });
  },

  // ---------------- Inline BI test (implant-load cycles) ----------------
  // Reuses QaTestingView.computeBiDue() for the incubation-window math and
  // the same 24-hour early-log safeguard, so the two entry points (here and
  // the QA Testing page) never disagree on timing. Bi_reason is locked to
  // "Implant Load Test" since that's the only reason this flow exists.
  _renderInlineBi(container, cycle, biRow, onSaved) {
    if (!biRow) {
      container.innerHTML = `
        <div style="font-weight:700;margin-bottom:8px;">Initiate BI test — ${UI.escapeHtml(cycle.machine_id)}</div>
        <div class="form-grid">
          <div class="field"><label>BI type</label>
            <select id="cyc-bi-type-${cycle.id}">
              <option value="">—</option>
              <option value="Minutes Result">Minutes Result</option>
              <option value="4-6 Hours Result">4-6 Hours Result</option>
              <option value="24 Hours Result">24 Hours Result</option>
            </select>
          </div>
          <div class="field"><label>Expected incubation hours</label><input type="text" id="cyc-bi-hours-${cycle.id}" placeholder="e.g. 1"></div>
          <div class="field"><label>BI serial/lot number</label><input type="text" id="cyc-bi-lot-${cycle.id}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="cyc-bi-initiate-${cycle.id}">Initiate BI test</button></div>
      `;
      document.getElementById(`cyc-bi-type-${cycle.id}`).addEventListener('change', (e) => {
        const defaults = { 'Minutes Result': '1', '4-6 Hours Result': '5', '24 Hours Result': '24' };
        document.getElementById(`cyc-bi-hours-${cycle.id}`).value = defaults[e.target.value] || '';
      });
      document.getElementById(`cyc-bi-initiate-${cycle.id}`).addEventListener('click', async () => {
        const biType = document.getElementById(`cyc-bi-type-${cycle.id}`).value;
        if (!biType) { UI.toast('Select a BI type', true); return; }
        const now = TrueTime.now();
        try {
          const result = await DB.addQaTest({
            machine_id: cycle.machine_id, cycle_id: cycle.id, test_type: 'BI', status: 'Incubating',
            date_of_test: UI.todayStr(), time_of_test: UI.nowTimeStr(), operator: Auth.currentStaff.name,
            bi_type: biType, bi_reason: 'Implant Load Test',
            bi_incubation_date: UI.todayStr(), bi_time_in_incubator: UI.nowTimeStr(),
            bi_serial_lot: document.getElementById(`cyc-bi-lot-${cycle.id}`).value || null,
            bi_expected_incubation_hours: document.getElementById(`cyc-bi-hours-${cycle.id}`).value || null,
            staff_id: Auth.currentStaff.id, staff_name: Auth.currentStaff.name
          });
          UI.writeResultToast(result, 'BI test initiated — incubating');
          onSaved();
        } catch (e) { UI.toast('Could not save: ' + e.message, true); }
      });
      return;
    }

    const due = QaTestingView.computeBiDue(biRow);
    const canLogNow = !due.computable || due.isOverdue;
    let dueLine;
    if (!due.computable) dueLine = `<span class="hint">Incubating — log the result whenever it's ready.</span>`;
    else if (due.isOverdue) dueLine = `<span style="color:var(--red);font-weight:700;">Due for result — ready since ${UI.fmtDateTime(due.dueAt.toISOString())}.</span>`;
    else dueLine = `<span style="color:var(--amber);">Incubating — ready at ${UI.fmtDateTime(due.dueAt.toISOString())} (in ${UI.durationHM(due.hoursRemaining * 60)}).</span>`;

    const buildForm = () => {
      container.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px;">BI test — log result — ${UI.escapeHtml(cycle.machine_id)}</div>
        <div style="margin-bottom:10px;">${dueLine}</div>
        <div class="form-grid">
          <div class="field"><label>Time out of incubator</label><input type="time" id="cyc-bi-timeout-${cycle.id}" value="${UI.nowTimeStr()}"></div>
          <div class="field"><label>Test vial result</label>
            <div class="radio-row" id="cyc-bi-vial-${cycle.id}"><button type="button" class="radio-chip active-bad" data-val="Positive Growth">Positive Growth</button><button type="button" class="radio-chip active-good" data-val="Negative Growth">Negative Growth</button></div>
          </div>
          <div class="field"><label>Control result</label>
            <div class="radio-row" id="cyc-bi-control-${cycle.id}"><button type="button" class="radio-chip active-good" data-val="Positive Growth">Positive Growth</button><button type="button" class="radio-chip" data-val="Negative Growth">Negative Growth</button></div>
          </div>
          <div class="field"><label>Final result</label>
            <select id="cyc-bi-final-${cycle.id}"><option value="">—</option><option>FINAL PASS</option><option>FINAL FAIL</option><option>Other</option></select>
          </div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="cyc-bi-save-${cycle.id}">Save BI result</button></div>
      `;
      const chipState = {};
      ['cyc-bi-vial-' + cycle.id, 'cyc-bi-control-' + cycle.id].forEach(id => {
        const row = document.getElementById(id);
        chipState[id] = row.querySelector('.active-good, .active-bad')?.dataset.val || null;
        row.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
          row.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
          const good = id.includes('control') ? chip.dataset.val === 'Positive Growth' : chip.dataset.val === 'Negative Growth';
          chip.className = 'radio-chip ' + (good ? 'active-good' : 'active-bad');
          chipState[id] = chip.dataset.val;
        }));
      });
      document.getElementById(`cyc-bi-save-${cycle.id}`).addEventListener('click', async () => {
        const finalResult = document.getElementById(`cyc-bi-final-${cycle.id}`).value;
        try {
          const result = await DB.updateQaTest(biRow.id, {
            status: 'Completed',
            bi_time_out_incubator: document.getElementById(`cyc-bi-timeout-${cycle.id}`).value,
            bi_test_vial_result: chipState['cyc-bi-vial-' + cycle.id] || null,
            bi_control_result: chipState['cyc-bi-control-' + cycle.id] || null,
            bi_final_result: finalResult || null,
            bi_early_read: !canLogNow
          });
          UI.writeResultToast(result, 'BI result saved');
          onSaved();
        } catch (e) { UI.toast('Could not save: ' + e.message, true); }
      });
    };

    if (canLogNow) { buildForm(); return; }
    container.innerHTML = `<div style="margin-bottom:8px;">${dueLine}</div><button class="btn btn-sm" id="cyc-bi-early-${cycle.id}">Log result early anyway</button>`;
    document.getElementById(`cyc-bi-early-${cycle.id}`).addEventListener('click', () => {
      if (biRow.bi_type === '24 Hours Result') {
        const warnModal = UI.showModal(`
          <h3 style="color:var(--red);">⚠ Not yet due — 24-hour incubation hasn't lapsed</h3>
          <div class="modal-desc">This is a <strong>24-hour BI</strong> and the full incubation period hasn't passed yet. Logging a result now is <strong style="color:var(--red);">prohibited under AAMI/ANSI ST79</strong>. Continuing anyway will be recorded as an out-of-protocol early read.</div>
          <div class="modal-actions">
            <button class="btn" id="cyc-bi-warn-cancel">Cancel</button>
            <button class="btn btn-danger" id="cyc-bi-warn-continue">Continue anyway</button>
          </div>
        `);
        warnModal.querySelector('#cyc-bi-warn-cancel').addEventListener('click', () => UI.closeModal());
        warnModal.querySelector('#cyc-bi-warn-continue').addEventListener('click', () => { UI.closeModal(); buildForm(); });
        return;
      }
      buildForm();
    });
  }
};

const CycleLogHistoryView = {
  async render() {
    const container = document.getElementById('view-cycles-history');
    const { tableWrap, setCount } = HistoryView.renderShell({
      container, title: 'Sterilization Cycle Log — Full History', backView: 'cycles',
      onFilterChange: (filters) => this._load(filters, setCount)
    });
    tableWrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ref #</th><th>Machine</th><th>Cycle #</th><th>Start</th><th>End</th><th>Temperature</th><th>Exposure</th><th>BI Verification</th><th>Status</th><th></th><th></th><th></th></tr></thead>
          <tbody id="cyc-hist-tbody"><tr><td colspan="12" class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
  },

  async _load(filters, setCount) {
    const tbody = document.getElementById('cyc-hist-tbody');
    try {
      const rows = await DB.listCycles({ from: filters.from, to: filters.to, limit: 1000 });
      const filtered = filters.search ? SearchBar.filter(rows, { text: filters.search }, 'time_start', ['machine_id', 'cycle_number', 'load_contents', 'operator_start']) : rows;
      setCount(filtered.length);
      await CycleLogView._renderTable.call(CycleLogView, filtered, 'cyc-hist-tbody', 'hv-count');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">Couldn't load history: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  }
};

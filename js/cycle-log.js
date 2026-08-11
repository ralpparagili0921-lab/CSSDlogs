// ============================================================
// STERILIZATION CYCLE LOG
// One row per cycle, logged in two passes: start (parameters +
// load contents) and end (flush/dry/cooldown times + results).
// The flash sterilizer (FS-01) shows extra fields for immediate-use
// tracking (patient/procedure/surgeon/OR/reason) since flash cycles
// are usually an urgent single-instrument response.
// ============================================================

const CycleLogView = {
  _machines: [],

  async render() {
    const el = document.getElementById('view-cycles');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>Sterilization Cycle Log</h1>
          <div class="desc">One entry per cycle. Start it when you begin, close it out once flush/dry/cooldown are done.</div>
        </div>
      </div>

      <div class="card card-pad">
        <h3 style="font-size:14px;margin-bottom:14px;">Start a new cycle</h3>
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
            <div class="field">
              <label>Cycle number <span class="hint">from machine display</span></label>
              <input type="text" name="cycle_number">
            </div>
            <div class="field">
              <label>Time start</label>
              <input type="datetime-local" name="time_start" required>
            </div>
            <div class="field" id="cyc-cycletype-wrap">
              <label>Cycle type</label>
              <select name="cycle_type" id="cyc-cycletype">
                <option value="">—</option>
                <option>Unwrapped Non-Porous (Metal Instruments)</option>
                <option>Unwrapped Porous (Rubber / Silicone components)</option>
                <option>Terminal/Wrapped (Pouched)</option>
                <option value="Other">Other</option>
              </select>
              <input type="text" id="cyc-cycletype-other" class="hidden" placeholder="Specify cycle type" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
            </div>
            <div class="field" id="cyc-pressures-wrap-1"><label>Boil pressure</label><input type="text" name="boil_pressure"></div>
            <div class="field" id="cyc-pressures-wrap-2"><label>Jacket pressure</label><input type="text" name="jacket_pressure"></div>
            <div class="field" id="cyc-pressures-wrap-3"><label>Chamber pressure</label><input type="text" name="chamber_pressure"></div>
            <div class="field">
              <label>Temperature set point</label>
              <select name="temperature_set_point"><option value="">—</option><option>121°C</option><option>132°C</option><option>135°C</option></select>
            </div>
            <div class="field">
              <label>Exposure time (minutes)</label>
              <select name="exposure_time_minutes"><option value="">—</option><option>4 minutes</option><option>15 minutes</option><option>20 minutes</option><option>25 minutes</option><option>30 minutes</option><option>45 minutes</option></select>
            </div>
            <div class="field field-full">
              <label>Load contents <span class="hint">type an item, press Enter to start a new line, then type the next one — one item per line</span></label>
              <textarea name="load_contents" rows="4" placeholder="e.g.&#10;Major instrument set&#10;2x towel packs&#10;Laparoscope"></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="cyc-submit">Start cycle</button>
          </div>
        </form>
      </div>

      <div class="section-title">In-progress cycles <span class="count" id="cyc-open-count">—</span></div>
      <div id="cyc-open-list"></div>

      <div class="section-title">Recent cycles <span class="count" id="cyc-count">—</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Machine</th><th>Cycle #</th><th>Start</th><th>End</th><th>Chemical Indicator</th><th>BI Verification</th><th>Status</th><th></th></tr></thead>
        <tbody id="cyc-tbody"><tr><td colspan="8" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;

    try {
      this._machines = (await DB.listAllMachines()).filter(m => m.active && (m.machine_type === 'autoclave' || m.machine_type === 'flash_sterilizer'));
    } catch (e) { this._machines = []; }
    const sel = document.getElementById('cyc-machine');
    sel.innerHTML = this._machines.length
      ? this._machines.map(m => `<option value="${UI.escapeHtml(m.machine_id)}" data-type="${m.machine_type}">${UI.escapeHtml(m.machine_id)} — ${UI.escapeHtml(m.label || '')}</option>`).join('')
      : `<option value="">No sterilizers configured — add one in Admin</option>`;
    document.querySelector('input[name="time_start"]').value = new Date().toISOString().slice(0, 16);
    this._toggleMachineFields();
    sel.addEventListener('change', () => { this._toggleMachineFields(); this._syncOpenWarning(sel.value); });
    let includesImplants = false;
    document.getElementById('cyc-implant-row').querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      document.getElementById('cyc-implant-row').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip ' + (chip.dataset.val === 'true' ? 'active-bad' : 'active-good');
      includesImplants = chip.dataset.val === 'true';
      document.getElementById('cyc-implant-note').classList.toggle('hidden', !includesImplants);
    }));
    this._implantGetter = () => includesImplants;
    document.getElementById('cyc-cycletype').addEventListener('change', (e) => {
      document.getElementById('cyc-cycletype-other').classList.toggle('hidden', e.target.value !== 'Other');
    });

    document.getElementById('cyc-form').addEventListener('submit', (e) => this._submit(e));
    this._loadOpen();
    this._loadTable();
  },

  // Block starting a new cycle for a machine that already has one in
  // progress (backlog item #2) — same pattern as Equipment Downtime.
  _syncOpenWarning(machineId) {
    const warn = document.getElementById('cyc-open-warning');
    const submitBtn = document.getElementById('cyc-submit');
    const open = this._openByMachine && this._openByMachine[machineId];
    if (open) {
      warn.classList.remove('hidden');
      warn.innerHTML = `<strong>${UI.escapeHtml(machineId)}</strong> already has a cycle in progress, started by ${UI.escapeHtml(open.operator_start)} at ${UI.fmtDateTime(open.time_start)}. Complete it below before starting a new one for this machine.`;
      submitBtn.disabled = true;
    } else {
      warn.classList.add('hidden');
      submitBtn.disabled = false;
    }
  },

  _selectedMachineType() {
    const sel = document.getElementById('cyc-machine');
    const opt = sel.options[sel.selectedIndex];
    return opt ? opt.dataset.type : 'autoclave';
  },

  _toggleMachineFields() {
    const isFlash = this._selectedMachineType() === 'flash_sterilizer';
    document.getElementById('cyc-cycletype-wrap').classList.toggle('hidden', !isFlash);
    ['cyc-pressures-wrap-1', 'cyc-pressures-wrap-2', 'cyc-pressures-wrap-3'].forEach(id => document.getElementById(id).classList.toggle('hidden', isFlash));
    // Autoclaves run 121/132/138°C; only the flash sterilizer uses 135°C —
    // these are genuinely different machine specs, not interchangeable.
    const tempSel = document.querySelector('select[name="temperature_set_point"]');
    const current = tempSel.value;
    const highOption = isFlash ? '135°C' : '138°C';
    tempSel.innerHTML = `<option value="">—</option><option>121°C</option><option>132°C</option><option>${highOption}</option>`;
    tempSel.value = (current === '121°C' || current === '132°C' || current === highOption) ? current : '';
  },

  async _submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const machineId = fd.get('machine_id');
    if (this._openByMachine && this._openByMachine[machineId]) {
      UI.toast(`${machineId} already has a cycle in progress — complete it first`, true);
      return;
    }
    const machine = this._machines.find(m => m.machine_id === machineId);
    const loadContents = (fd.get('load_contents') || '').split('\n').map(s => s.trim()).filter(Boolean);
    const entry = {
      machine_id: machineId,
      machine_type: machine ? machine.machine_type : 'autoclave',
      cycle_number: fd.get('cycle_number') || null,
      includes_implants: this._implantGetter ? this._implantGetter() : false,
      operator_start: Auth.currentStaff.name,
      time_start: fd.get('time_start'),
      cycle_type: fd.get('cycle_type') === 'Other' ? (document.getElementById('cyc-cycletype-other').value || 'Other') : (fd.get('cycle_type') || null),
      boil_pressure: fd.get('boil_pressure') || null,
      jacket_pressure: fd.get('jacket_pressure') || null,
      chamber_pressure: fd.get('chamber_pressure') || null,
      temperature_set_point: fd.get('temperature_set_point') || null,
      exposure_time_minutes: fd.get('exposure_time_minutes') || null,
      load_contents: loadContents,
      status: 'In Progress',
      staff_id: Auth.currentStaff.id,
      staff_name: Auth.currentStaff.name
    };
    const btn = document.getElementById('cyc-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addCycle(entry);
        UI.writeResultToast(result, 'Cycle started');
        e.target.reset();
        document.querySelector('input[name="time_start"]').value = new Date().toISOString().slice(0, 16);
        this._toggleMachineFields();
        document.querySelector('#cyc-implant-row [data-val="false"]').click();
        this._loadOpen();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
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
            <button class="btn btn-sm btn-primary" data-complete="${r.id}">Complete cycle</button>
          </div>
          ${r.includes_implants ? `<div style="border-top:1px solid rgba(244,202,20,0.5);margin-top:12px;padding-top:12px;" id="cyc-open-bi-${r.id}"></div>` : ''}
        </div>
      `).join('');
      wrap.querySelectorAll('[data-complete]').forEach(btn => {
        btn.addEventListener('click', () => this._openCompleteModal(rows.find(r => r.id === btn.dataset.complete)));
      });
      implantRows.forEach(r => {
        const container = document.getElementById(`cyc-open-bi-${r.id}`);
        if (container) this._renderInlineBi(container, r, biByCycle[r.id], () => this._loadOpen());
      });
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load in-progress cycles.</div>`;
    }
  },

  _openCompleteModal(row) {
    const nowLocal = new Date().toISOString().slice(0, 16);
    const isFlash = row.machine_type === 'flash_sterilizer';
    const modal = UI.showModal(`
      <h3>Complete cycle — ${UI.escapeHtml(row.machine_id)}</h3>
      <div class="modal-desc">Started ${UI.fmtDateTime(row.time_start)}</div>
      <div class="field" style="margin-bottom:10px;"><label>Time — knob to flush</label><input type="datetime-local" id="cc-flush" value="${nowLocal}"></div>
      <div class="field" style="margin-bottom:10px;"><label>Chemical indicator result</label>
        <select id="cc-chem"><option value="">—</option><option>Pass</option><option>Fail</option><option>Unavailable</option></select>
      </div>
      <div class="field" style="margin-bottom:10px;"><label>Time — knob to drying</label><input type="datetime-local" id="cc-drying"></div>
      <div class="field" style="margin-bottom:10px;"><label>Time — knob off / hatch door open</label><input type="datetime-local" id="cc-off"></div>
      <div class="field" style="margin-bottom:10px;"><label>Cooldown start</label><input type="datetime-local" id="cc-cool-start"></div>
      <div class="field" style="margin-bottom:10px;"><label>Cooldown end</label><input type="datetime-local" id="cc-cool-end"></div>
      <div class="field" style="margin-bottom:10px;">
        <label>Class 1 process indicator — did all autoclave tapes change to dark stripes in all packs applied?</label>
        <div class="radio-row" id="cc-tape-row"><button type="button" class="radio-chip active-good" data-val="true">Yes</button><button type="button" class="radio-chip" data-val="false">No</button></div>
      </div>
      ${isFlash ? `
        <div class="field" style="margin-bottom:10px;"><label>Usage disposition</label>
          <select id="cc-usage"><option value="">—</option><option>For Storage</option><option>For Immediate Use</option></select>
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:6px;">For Storage: confirm the pouch and cassette are fully dry first — sterility can't be assured for long-term storage otherwise, and storage is capped at 60 minutes max.</div>
        </div>
        <div id="cc-storage-fields" class="hidden">
          <div class="field" style="margin-bottom:10px;"><label>Time end of sterilization</label><input type="datetime-local" id="cc-storage-end"></div>
        </div>
        <div id="cc-immediate-fields" class="hidden">
          <div class="field" style="margin-bottom:10px;"><label>Patient number</label><input type="text" id="cc-patient"></div>
          <div class="field" style="margin-bottom:10px;"><label>Procedure</label><input type="text" id="cc-procedure"></div>
          <div class="field" style="margin-bottom:10px;"><label>Surgeon</label><input type="text" id="cc-surgeon"></div>
          <div class="field" style="margin-bottom:10px;"><label>Operating room</label>
            <select id="cc-or">
              <option value="">—</option>
              <option>OR 1</option>
              <option>OR 2</option>
              <option>OR 3</option>
              <option value="Other">Other</option>
            </select>
            <input type="text" id="cc-or-other" class="hidden" placeholder="Specify" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
          </div>
          <div class="field" style="margin-bottom:10px;"><label>Reason for flash sterilization</label>
            <div class="radio-row" id="cc-reason-row">
              <button type="button" class="radio-chip" data-val="Dropped/Critical Instrument">Dropped/Critical Instrument</button>
              <button type="button" class="radio-chip" data-val="Additional Unanticipated Need">Additional Need</button>
              <button type="button" class="radio-chip" data-val="Set Incomplete">Set Incomplete</button>
              <button type="button" class="radio-chip" data-val="Other">Other</button>
            </div>
            <input type="text" id="cc-reason-other" class="hidden" placeholder="Specify reason" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
          </div>
          <div class="field" style="margin-bottom:10px;"><label>Time delivered to sterile field</label><input type="datetime-local" id="cc-delivered"></div>
          <div class="field" style="margin-bottom:10px;"><label>Received by (OR nurse/surgeon)</label><input type="text" id="cc-received"></div>
        </div>
      ` : ''}
      <div class="field" style="margin-bottom:10px;"><label>Remarks</label><textarea id="cc-remarks"></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="cc-cancel">Cancel</button>
        <button class="btn btn-primary" id="cc-save">Complete cycle</button>
      </div>
    `);
    const tapeRow = modal.querySelector('#cc-tape-row');
    let tapeVal = 'true';
    tapeRow.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      tapeRow.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = chip.dataset.val === 'true' ? 'radio-chip active-good' : 'radio-chip active-bad';
      tapeVal = chip.dataset.val;
    }));
    let reasonVals = [];
    if (isFlash) {
      modal.querySelector('#cc-usage').addEventListener('change', (e) => {
        modal.querySelector('#cc-immediate-fields').classList.toggle('hidden', e.target.value !== 'For Immediate Use');
        modal.querySelector('#cc-storage-fields').classList.toggle('hidden', e.target.value !== 'For Storage');
      });
      modal.querySelector('#cc-or').addEventListener('change', (e) => {
        modal.querySelector('#cc-or-other').classList.toggle('hidden', e.target.value !== 'Other');
      });
      const reasonRow = modal.querySelector('#cc-reason-row');
      reasonRow.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
        chip.classList.toggle('active-good');
        const v = chip.dataset.val;
        if (reasonVals.includes(v)) reasonVals = reasonVals.filter(x => x !== v); else reasonVals.push(v);
        modal.querySelector('#cc-reason-other').classList.toggle('hidden', !reasonVals.includes('Other'));
      }));
    }
    modal.querySelector('#cc-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#cc-save').addEventListener('click', async () => {
      const fields = {
        status: 'Completed',
        operator_end: Auth.currentStaff.name,
        time_end: new Date().toISOString(),
        time_knob_to_flush: modal.querySelector('#cc-flush').value || null,
        chemical_indicator_result: modal.querySelector('#cc-chem').value || null,
        time_knob_to_drying: modal.querySelector('#cc-drying').value || null,
        time_knob_off_hatch_open: modal.querySelector('#cc-off').value || null,
        cooldown_start: modal.querySelector('#cc-cool-start').value || null,
        cooldown_end: modal.querySelector('#cc-cool-end').value || null,
        class1_tape_changed: tapeVal === 'true',
        remarks: modal.querySelector('#cc-remarks').value || null
      };
      if (isFlash) {
        const orVal = modal.querySelector('#cc-or').value;
        fields.usage_disposition = modal.querySelector('#cc-usage').value || null;
        fields.patient_number = modal.querySelector('#cc-patient').value || null;
        fields.procedure_name = modal.querySelector('#cc-procedure').value || null;
        fields.surgeon = modal.querySelector('#cc-surgeon').value || null;
        fields.operating_room = orVal === 'Other' ? (modal.querySelector('#cc-or-other').value || 'Other') : (orVal || null);
        fields.flash_reason = reasonVals.includes('Other')
          ? reasonVals.filter(v => v !== 'Other').concat(modal.querySelector('#cc-reason-other').value ? [modal.querySelector('#cc-reason-other').value] : ['Other'])
          : reasonVals;
        fields.time_delivered_to_sterile_field = modal.querySelector('#cc-delivered').value || null;
        fields.received_by = modal.querySelector('#cc-received').value || null;
        fields.storage_end_time = modal.querySelector('#cc-storage-end') ? (modal.querySelector('#cc-storage-end').value || null) : null;
      }
      try {
        const result = await DB.updateCycle(row.id, fields);
        UI.writeResultToast(result, 'Cycle completed');
        UI.closeModal();
        this._loadOpen();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  async _loadTable() {
    const tbody = document.getElementById('cyc-tbody');
    try {
      const rows = await DB.listCycles({ from: UI.daysAgoStr(14), limit: 100 });
      document.getElementById('cyc-count').textContent = `${rows.length} in last 14 days`;
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No cycles logged in the last 14 days.</td></tr>`;
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
          <td><strong>${UI.escapeHtml(r.machine_id)}</strong></td>
          <td>${UI.escapeHtml(r.cycle_number) || '—'}</td>
          <td>${UI.fmtDateTime(r.time_start)}</td>
          <td>${UI.fmtDateTime(r.time_end)}</td>
          <td>${r.chemical_indicator_result ? `<span class="badge ${r.chemical_indicator_result === 'Pass' ? 'badge-pass' : r.chemical_indicator_result === 'Fail' ? 'badge-fail' : 'badge-worn'}">${r.chemical_indicator_result}</span>` : '—'}</td>
          <td>${r.includes_implants ? (biVerified ? `<span class="badge ${bi.bi_final_result === 'FINAL PASS' ? 'badge-pass' : 'badge-fail'}">${bi.bi_final_result}</span>` : `<span class="badge badge-open">Pending</span>`) : '—'}</td>
          <td><span class="badge ${r.status === 'In Progress' ? 'badge-open' : 'badge-resolved'}">${r.status}</span></td>
          <td>
            ${r.status === 'In Progress' ? `<button class="btn btn-sm" data-complete2="${r.id}">Complete</button>` : ''}
            ${biPending ? `<button class="btn btn-sm" data-bi-expand="${r.id}">${bi ? 'Log BI Result' : 'Initiate BI'}</button>` : ''}
          </td>
        </tr>
        ${biPending ? `<tr class="pending-highlight" id="cyc-bi-row-${r.id}" style="display:none;"><td colspan="8" style="padding:14px;"></td></tr>` : ''}
      `; }).join('');
      tbody.querySelectorAll('[data-complete2]').forEach(btn => {
        btn.addEventListener('click', () => this._openCompleteModal(rows.find(r => r.id === btn.dataset.complete2)));
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
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Couldn't load cycles: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
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
        const now = new Date();
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

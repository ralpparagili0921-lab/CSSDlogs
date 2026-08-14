// ============================================================
// EQUIPMENT DOWNTIME LOGBOOK — autoclaves AND the RO system share
// this workflow. Initial entry is deliberately minimal: machine,
// time broken, time reported, time biomed responded. Everything
// else (time back up, root cause, remarks, reported by) is
// captured when the incident is resolved.
// ============================================================

const EquipmentView = {
  _machines: [],

  async render() {
    const el = document.getElementById('view-equipment');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook · TCCH-SPU-PROC-013</div>
          <h1>Equipment Downtime</h1>
          <div class="desc">Autoclaves and the RO system. Log the incident as soon as it's known — resolve it later once biomed has finished.</div>
        </div>
        ${Auth.currentStaff.role === 'superuser' ? `<button class="btn btn-sm" id="eq-add-machine">+ Add a machine</button>` : ''}
      </div>

      <div class="card card-pad">
        <h3 style="font-size:14px;margin-bottom:14px;">New downtime incident</h3>
        <div id="eq-open-warning" class="hidden" style="background:rgba(196,67,46,0.08);border:1px solid rgba(196,67,46,0.35);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:13px;color:var(--red);"></div>
        <form id="eq-form">
          <div class="form-grid">
            <div class="field">
              <label>Machine</label>
              <select name="machine_id" id="eq-machine" required></select>
            </div>
            <div class="field">
              <label>Reason for downtime</label>
              <select name="downtime_reason" id="eq-reason">
                <option value="">—</option>
                <option>Mechanical Failure</option>
                <option>Power Outage</option>
                <option>Water Supply Issue</option>
                <option>BI/CI Test Failure</option>
                <option>Scheduled Maintenance Overrun</option>
                <option value="Other">Other</option>
              </select>
              <input type="text" id="eq-reason-other" class="hidden" placeholder="Specify reason" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
            </div>
            <div class="field field-full"><label>Remarks <span class="hint">optional</span></label><textarea name="remarks" placeholder="Anything worth noting at the time it was reported"></textarea></div>
          </div>
          <div class="form-actions" style="flex-direction:column;align-items:stretch;gap:8px;">
            <button type="submit" class="btn btn-primary" id="eq-submit" style="padding:14px;font-size:14px;">⏱ Time Equipment Went Out of Service — Report Now</button>
            <div class="hint" style="text-align:center;">Stamps the current time automatically — no need to type it.</div>
          </div>
        </form>
      </div>

      <div class="section-title">Open incidents <span class="count" id="eq-open-count">—</span></div>
      <div id="eq-open-list"></div>

      <div class="section-title">Recent incidents <span class="count" id="eq-count">—</span></div>
      ${SearchBar.render('eq-search')}
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Ref #</th><th>Machine</th><th>Type</th><th>Broken</th><th>Status</th><th></th><th></th>
        </tr></thead>
        <tbody id="eq-tbody"><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;

    try { this._machines = await DB.listMachines(); } catch (e) { this._machines = []; }
    this._populateMachineSelect();

    document.getElementById('eq-machine').addEventListener('change', (e) => this._syncOpenWarning(e.target.value));
    document.getElementById('eq-reason').addEventListener('change', (e) => {
      document.getElementById('eq-reason-other').classList.toggle('hidden', e.target.value !== 'Other');
    });
    const addMachineBtn = document.getElementById('eq-add-machine');
    if (addMachineBtn) addMachineBtn.addEventListener('click', () => {
      window.onMachineAdded = async () => { this._machines = await DB.listMachines(); this._populateMachineSelect(); window.onMachineAdded = null; };
      AdminView._machineModal();
    });
    document.getElementById('eq-form').addEventListener('submit', (e) => this._submit(e));
    this._loadOpen();
    this._loadTable();
    if (App.pendingEquipmentMachine) {
      const machineSel = document.getElementById('eq-machine');
      if (machineSel.querySelector(`option[value="${App.pendingEquipmentMachine}"]`)) {
        machineSel.value = App.pendingEquipmentMachine;
        this._syncOpenWarning(machineSel.value);
      }
      UI.toast(`Logging downtime for ${App.pendingEquipmentMachine} — the QA test that failed`);
      App.pendingEquipmentMachine = null;
    }
  },

  // Block starting a new incident for a machine that already has one open
  // (backlog item #2) — checked on machine change and re-checked after
  // _loadOpen() refreshes, and enforced again as a submit-time guard.
  _syncOpenWarning(machineId) {
    const warn = document.getElementById('eq-open-warning');
    const submitBtn = document.getElementById('eq-submit');
    const open = this._openByMachine && this._openByMachine[machineId];
    if (open) {
      warn.classList.remove('hidden');
      warn.innerHTML = `<strong>${UI.escapeHtml(machineId)}</strong> already has an open incident, reported by ${UI.escapeHtml(open.staff_name)} on ${UI.fmtDateTime(open.time_broken)}. Resolve it below before logging a new one for this machine.`;
      submitBtn.disabled = true;
    } else {
      warn.classList.add('hidden');
      submitBtn.disabled = false;
    }
  },

  _populateMachineSelect() {
    const sel = document.getElementById('eq-machine');
    if (this._machines.length === 0) {
      sel.innerHTML = `<option value="">No machines configured — add one in Admin</option>`;
    } else {
      sel.innerHTML = this._machines.map(m =>
        `<option value="${UI.escapeHtml(m.machine_id)}" data-type="${m.machine_type}">${UI.escapeHtml(m.machine_id)} — ${m.machine_type === 'ro' ? 'RO System' : m.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : m.machine_type === 'facility_equipment' ? 'Facility Equipment' : 'Autoclave'}${m.label ? ' · ' + UI.escapeHtml(m.label) : ''}</option>`
      ).join('');
    }
    this._syncOpenWarning(sel.value);
  },

  async _submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const machineId = fd.get('machine_id');
    if (this._openByMachine && this._openByMachine[machineId]) {
      UI.toast(`${machineId} already has an open incident — resolve it first`, true);
      return;
    }
    const machine = this._machines.find(m => m.machine_id === machineId);
    const reason = fd.get('downtime_reason');
    const now = new Date().toISOString();
    const entry = {
      machine_id: machineId,
      machine_type: machine ? machine.machine_type : 'autoclave',
      downtime_reason: reason === 'Other' ? (document.getElementById('eq-reason-other').value || 'Other') : (reason || null),
      time_broken: now,
      time_reported: now,
      remarks: fd.get('remarks') || null,
      status: 'Open',
      staff_id: Auth.currentStaff.id,
      staff_name: Auth.currentStaff.name
    };
    const btn = document.getElementById('eq-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addDowntimeLog(entry);
        UI.writeResultToast(result, 'Downtime incident logged');
        e.target.reset();
        this._loadOpen();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  async _loadOpen() {
    const wrap = document.getElementById('eq-open-list');
    try {
      const rows = await DB.listOpenDowntimeLogs();
      this._openByMachine = {};
      rows.forEach(r => { this._openByMachine[r.machine_id] = r; });
      document.getElementById('eq-open-count').textContent = rows.length;
      this._syncOpenWarning(document.getElementById('eq-machine').value);
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">No open incidents.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <div>
            <strong>${UI.escapeHtml(r.machine_id)}</strong>
            <span class="badge" style="margin-left:6px;background:var(--surface-sunken);color:var(--ink-soft);">${r.machine_type === 'ro' ? 'RO System' : r.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : r.machine_type === 'facility_equipment' ? 'Facility Equipment' : 'Autoclave'}</span>
            <span class="badge badge-open" style="margin-left:6px;">Open</span>
            ${r.time_biomed_response ? `<span class="badge badge-pass" style="margin-left:6px;">Biomed responded</span>` : `<span class="badge badge-fail" style="margin-left:6px;">Awaiting Biomed</span>`}
            <div class="hint" style="margin-top:4px;">Broken ${UI.fmtDateTime(r.time_broken)} · reported by ${UI.escapeHtml(r.staff_name)}${r.downtime_reason ? ' · ' + UI.escapeHtml(r.downtime_reason) : ''}</div>
            ${r.time_biomed_response ? `<div class="hint">Biomed responded ${UI.fmtDateTime(r.time_biomed_response)}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${!r.time_biomed_response ? `<button class="btn btn-sm" data-biomed="${r.id}">Biomed/Facilities Responded — Mark Now</button>` : ''}
            <button class="btn btn-sm btn-primary" data-resolve="${r.id}">Resolved / Repaired</button>
          </div>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-resolve]').forEach(btn => {
        btn.addEventListener('click', () => this._openResolveModal(rows.find(r => r.id === btn.dataset.resolve)));
      });
      wrap.querySelectorAll('[data-biomed]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const result = await DB.updateDowntimeLog(btn.dataset.biomed, { time_biomed_response: new Date().toISOString() });
            UI.writeResultToast(result, 'Biomed response time recorded');
            this._loadOpen(); this._loadTable();
          } catch (e) { UI.toast('Failed: ' + e.message, true); }
        });
      });
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load open incidents.</div>`;
    }
  },

  _openResolveModal(row) {
    const nowLocal = new Date().toISOString().slice(0, 16);
    const modal = UI.showModal(`
      <h3>Mark resolved — ${UI.escapeHtml(row.machine_id)}</h3>
      <div class="modal-desc">Broken since ${UI.fmtDateTime(row.time_broken)}</div>
      <div class="field" style="margin-bottom:12px;">
        <label>Time back to operational</label>
        <input type="datetime-local" id="rs-up" value="${nowLocal}">
      </div>
      <div class="field" style="margin-bottom:12px;">
        <label>Root cause category</label>
        <select id="rs-cause">
          <option value="Mechanical Failure">Mechanical Failure</option>
          <option value="BI/CI Failure - Quarantine">BI/CI Failure - Quarantine</option>
          <option value="Scheduled PM Overrun">Scheduled PM Overrun</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:12px;">
        <label>Remarks</label>
        <textarea id="rs-remarks" placeholder="What was done to fix it?"></textarea>
      </div>
      <div class="field">
        <label>Reported by</label>
        <input type="text" id="rs-reportedby" value="${UI.escapeHtml(Auth.currentStaff.name)}">
      </div>
      <div class="modal-actions">
        <button class="btn" id="rs-cancel">Cancel</button>
        <button class="btn btn-primary" id="rs-save">Save</button>
      </div>
    `);
    modal.querySelector('#rs-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#rs-save').addEventListener('click', async () => {
      const fields = {
        time_up: modal.querySelector('#rs-up').value || null,
        root_cause_category: modal.querySelector('#rs-cause').value,
        remarks: modal.querySelector('#rs-remarks').value || null,
        reported_by: modal.querySelector('#rs-reportedby').value || null,
        status: 'Resolved'
      };
      try {
        const result = await DB.updateDowntimeLog(row.id, fields);
        UI.writeResultToast(result, 'Incident resolved');
        UI.closeModal();
        this._loadOpen();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not update: ' + err.message, true);
      }
    });
  },

  async _loadTable() {
    const tbody = document.getElementById('eq-tbody');
    try {
      const rows = await DB.listDowntimeLogs({ from: UI.daysAgoStr(60), limit: 100 });
      this._tableRows = rows;
      SearchBar.wire('eq-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'time_broken', ['machine_id', 'downtime_reason', 'remarks'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Couldn't load incidents: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  _renderTable(rows) {
    const tbody = document.getElementById('eq-tbody');
    document.getElementById('eq-count').textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No incidents match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td><strong>${UI.escapeHtml(r.machine_id)}</strong></td>
          <td>${r.machine_type === 'ro' ? 'RO System' : r.machine_type === 'flash_sterilizer' ? 'Flash Sterilizer' : r.machine_type === 'facility_equipment' ? 'Facility Equipment' : 'Autoclave'}</td>
          <td>${UI.fmtDateTime(r.time_broken)}</td>
          <td><span class="badge ${r.status === 'Open' ? 'badge-open' : 'badge-resolved'}">${r.status}</span></td>
          <td>${r.status === 'Open' ? `<button class="btn btn-sm" data-resolve2="${r.id}">Resolve</button>` : ''}</td>
          <td><button class="btn btn-sm" data-details-toggle="${r.id}">Details ▸</button></td>
        </tr>
        <tr id="eq-details-row-${r.id}" style="display:none;"><td colspan="7" style="padding:14px 16px;background:var(--surface-sunken);">${this._renderIncidentDetails(r)}</td></tr>`).join('');
      tbody.querySelectorAll('[data-resolve2]').forEach(btn => {
        btn.addEventListener('click', () => this._openResolveModal(this._tableRows.find(r => r.id === btn.dataset.resolve2)));
      });
      tbody.querySelectorAll('[data-details-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const trWrap = document.getElementById(`eq-details-row-${btn.dataset.detailsToggle}`);
          const isHidden = trWrap.style.display === 'none';
          trWrap.style.display = isHidden ? 'table-row' : 'none';
          btn.textContent = isHidden ? 'Details ▾' : 'Details ▸';
        });
      });
  },

  _renderIncidentDetails(r) {
    const row = (label, value) => value ? `<div style="margin-bottom:4px;"><span class="hint">${label}:</span> ${value}</div>` : '';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-weight:700;margin-bottom:6px;">Timeline</div>
          ${row('Broken', UI.fmtDateTime(r.time_broken))}
          ${row('Reported', UI.fmtDateTime(r.time_reported))}
          ${row('Biomed responded', UI.fmtDateTime(r.time_biomed_response))}
          ${row('Back in service', UI.fmtDateTime(r.time_up))}
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:6px;">Details</div>
          ${row('Reason', UI.escapeHtml(r.downtime_reason))}
          ${row('Root cause', UI.escapeHtml(r.root_cause_category))}
          ${row('Remarks', UI.escapeHtml(r.remarks))}
        </div>
      </div>
    `;
  }
};

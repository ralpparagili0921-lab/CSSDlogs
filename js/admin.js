// ============================================================
// ADMIN — superuser only. Staff accounts, machines (autoclave +
// RO), RO thresholds, logbook assignments (for missed-log
// alerts), and the Version & Updates panel.
// ============================================================

const AdminView = {
  async render() {
    const el = document.getElementById('view-admin');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Admin</div>
          <h1>Manage Staff &amp; Settings</h1>
          <div class="desc">Superuser only.</div>
        </div>
      </div>

      <div class="section-title">Staff accounts</div>
      <div class="desc" style="margin-bottom:10px;">Add new staff directly here, or from the login screen (which requires superuser PIN authorization for someone not already in Admin).</div>
      <button class="btn btn-sm" id="btn-add-staff" style="margin-bottom:14px;">+ Add Staff</button>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Job title</th><th>Role</th><th>PIN</th><th>Status</th><th></th></tr></thead>
        <tbody id="staff-tbody"><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
      </table></div>

      <div class="section-title">Archived staff <span class="hint" style="font-weight:400;color:var(--ink-soft);">(full history preserved — restore anytime)</span></div>
      <div id="archived-staff-list"><div class="card card-pad empty-state">Loading…</div></div>

      <div class="section-title">Logbook assignments <span class="hint" style="font-weight:400;color:var(--ink-soft);">(who gets flagged for missed logs)</span></div>
      <div class="card card-pad">
        <div class="form-grid" id="assignment-fields"></div>
        <div class="form-actions"><button class="btn btn-primary" id="save-assignments">Save assignments</button></div>
      </div>

      <div class="section-title">Holiday &amp; closure exceptions <button class="btn btn-sm" id="btn-add-exception" style="margin-left:auto;">+ Add exception</button></div>
      <div class="desc" style="margin-bottom:10px;">Any date range here is excluded from missed-log tracking and KPI denominators — on top of weekends, which are always excluded.</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>From</th><th>To</th><th>Reason</th><th></th></tr></thead>
        <tbody id="exception-tbody"><tr><td colspan="5" class="empty-state">Loading…</td></tr></tbody>
      </table></div>

      <div class="section-title">Machines <button class="btn btn-sm" id="btn-add-machine" style="margin-left:auto;">+ Add machine</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Machine ID</th><th>Type</th><th>Label</th><th>Scheduled hrs/day</th><th>QA tests</th><th>Status</th><th></th></tr></thead>
        <tbody id="machine-tbody"><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
      </table></div>

      <div class="section-title">RO water quality parameters <span class="hint" style="font-weight:400;color:var(--ink-soft);">Conductivity/TDS/pH are always on; the rest activate on a need-to-basis</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Parameter</th><th>Unit</th><th>Limit</th><th>Standard</th><th>Active</th><th></th></tr></thead>
        <tbody id="ro-param-tbody"><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
      <button class="btn btn-sm" id="btn-add-ro-param" style="margin-top:10px;">+ Add a parameter</button>

      <div class="section-title">RO testers <span class="hint" style="font-weight:400;color:var(--ink-soft);">the testing device/kit catalog</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Model</th><th>Make</th><th>Active</th><th></th></tr></thead>
        <tbody id="ro-tester-tbody"><tr><td colspan="5" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
      <button class="btn btn-sm" id="btn-add-ro-tester" style="margin-top:10px;">+ Add a tester</button>

      <div class="section-title">Temperature &amp; humidity locations</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Location</th><th>Temp range (°C)</th><th>Humidity range (%)</th><th>Active</th><th></th></tr></thead>
        <tbody id="th-loc-tbody"><tr><td colspan="5" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
      <button class="btn btn-sm" id="btn-add-th-location" style="margin-top:10px;">+ Add a location</button>

      <div class="section-title">Logbook schedules</div>
      <div class="card card-pad">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px;">QA Testing — expected day per machine</div>
        <div id="qa-schedule-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">Loading…</div>
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;">RO Water Quality — expected cadence per parameter</div>
        <div class="hint" style="margin-bottom:10px;">Per AAMI ST108 Annex G, different parameters have different real-world cadences — fully editable, nothing is fixed in the app itself.</div>
        <div id="ro-schedule-list" style="display:flex;flex-direction:column;gap:8px;">Loading…</div>
      </div>

      <div class="section-title">Offline sync <span class="hint" style="font-weight:400;color:var(--ink-soft);">(backlog #11)</span></div>
      <div class="card card-pad" id="sync-issues-panel">Loading…</div>

      <div class="section-title">Data retention</div>
      <div class="card card-pad" id="retention-panel">Loading…</div>

      <div class="section-title">Department Accounts <span class="hint" style="font-weight:400;">external ER/OPD/OR/Ward staff — reassign if someone transfers or registered under the wrong department</span></div>
      <div class="card card-pad" id="dept-accounts-panel">Loading…</div>

      <div class="section-title">DTR Reconciliation <span class="hint" style="font-weight:400;">GreatDay monthly attendance import</span></div>
      <div class="card card-pad" id="dtr-import-panel">Loading…</div>

      <div class="section-title">Schedule Overview <span class="hint" style="font-weight:400;">audit-friendly visual of what's expected, and when</span></div>
      <div class="card card-pad" id="schedule-overview-panel">Loading…</div>

      ${Auth.currentStaff.name === 'Ralp' ? `
      <div class="section-title">Alarm Sound <span class="hint" style="font-weight:400;">this device only</span></div>
      <div class="card card-pad" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">Mute alarm sound, voice &amp; vibration</div>
          <div class="hint" style="margin-top:4px;max-width:480px;">For monitoring on a device where you don't want to hear every exposure/BI alarm — the red glow and alert box still show here, just silently. This only affects this specific device, not anyone else's.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="alarm-mute-toggle">
          <span class="switch-slider"></span>
        </label>
      </div>
      ` : ''}

      <div class="section-title">Alarm Snooze Duration</div>
      <div class="card card-pad" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">Minutes before an acknowledged alarm resumes</div>
          <div class="hint" style="margin-top:4px;max-width:480px;">Muting an alarm silences it for this long — if the cycle/BI result is still unresolved once that time passes, it sounds again. Applies app-wide, for everyone.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="number" id="alarm-snooze-input" min="1" max="60" style="width:70px;text-align:center;">
          <span class="hint">minutes</span>
          <button class="btn btn-sm" id="alarm-snooze-save">Save</button>
        </div>
      </div>

      <div class="section-title">Version &amp; Updates</div>
      <div class="card card-pad" id="version-panel">Loading…</div>

      <div class="section-title" style="color:var(--red);">Danger Zone</div>
      <div class="card card-pad" style="border-color:rgba(196,67,46,0.4);margin-bottom:12px;">
        <div style="font-weight:700;margin-bottom:6px;">Tier 1 — Delete Logged Data Only</div>
        <div class="hint" style="margin-bottom:14px;">Deletes every logged entry across all 9 logbooks, plus pending/schedule exceptions, and un-launches the app. Machines, staff, and configuration (RO parameters, testers, locations) are kept exactly as they are. This cannot be undone.</div>
        <button class="btn btn-danger" id="btn-reset-data">Delete Logged Data Only</button>
      </div>
      <div class="card card-pad" style="border-color:rgba(196,67,46,0.4);">
        <div style="font-weight:700;margin-bottom:6px;">Tier 2 — Delete All</div>
        <div class="hint" style="margin-bottom:14px;">Everything in Tier 1, plus every machine, RO parameter, RO tester, Temp/Humidity location, logbook assignment, and registered brush — a true factory reset. Staff accounts are kept, so someone can still log in afterward to rebuild the setup. This cannot be undone.</div>
        <button class="btn btn-danger" id="btn-reset-all">Delete All</button>
      </div>
    `;

    document.getElementById('btn-add-machine').addEventListener('click', () => this._machineModal());
    document.getElementById('btn-add-exception').addEventListener('click', () => this._addExceptionModal());
    document.getElementById('btn-reset-data').addEventListener('click', () => this._openResetModal('data'));
    document.getElementById('btn-reset-all').addEventListener('click', () => this._openResetModal('all'));
    this._loadRoParams();
    this._loadRoTesters();
    this._loadThLocations();
    this._loadSchedules();
    document.getElementById('btn-add-ro-param').addEventListener('click', () => this._roParamModal());
    document.getElementById('btn-add-ro-tester').addEventListener('click', () => this._roTesterModal());
    document.getElementById('btn-add-th-location').addEventListener('click', () => this._thLocationModal());
    document.getElementById('save-assignments').addEventListener('click', () => this._saveAssignments());
    document.getElementById('btn-add-staff').addEventListener('click', () => this._addStaffModal());

    this._loadStaff();
    this._loadArchivedStaff();
    this._loadAssignments();
    this._loadExceptions();
    this._loadMachines();
    this._loadSyncIssues();
    this._loadRetentionPanel();
    this._loadDeptAccounts();
    const muteToggle = document.getElementById('alarm-mute-toggle');
    if (muteToggle) {
      muteToggle.checked = Alarm.isMuted();
      muteToggle.addEventListener('change', (e) => {
        Alarm.setMuted(e.target.checked);
        UI.toast(e.target.checked ? 'Alarm sound muted on this device' : 'Alarm sound unmuted on this device');
      });
    }
    document.getElementById('alarm-snooze-input').value = Alarm.snoozeMinutes;
    document.getElementById('alarm-snooze-save').addEventListener('click', async () => {
      const val = parseInt(document.getElementById('alarm-snooze-input').value, 10);
      if (!val || val < 1 || val > 60) { UI.toast('Enter a number between 1 and 60', true); return; }
      try {
        await DB.updateAppMeta({ alarm_snooze_minutes: val });
        Alarm.snoozeMinutes = val; // takes effect immediately, no refresh needed
        UI.toast(`Snooze duration set to ${val} minute${val === 1 ? '' : 's'}`);
      } catch (e) { UI.toast('Could not save: ' + e.message, true); }
    });
    DtrImport.render();
    this._loadScheduleOverview();
    this._loadVersionPanel();
  },

  // ---------------- STAFF ----------------
  async _loadStaff() {
    const tbody = document.getElementById('staff-tbody');
    try {
      const rows = await DB.listActiveStaff();
      if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No active staff.</td></tr>`; return; }
      tbody.innerHTML = rows.map(s => `
        <tr>
          <td><strong>${UI.escapeHtml(s.name)}</strong></td>
          <td>${UI.escapeHtml(s.job_title) || '—'}</td>
          <td>
            <select data-role-select="${s.id}" ${s.id === Auth.currentStaff.id ? 'disabled title="Can\'t change your own role here"' : ''}>
              <option value="user" ${s.role === 'user' ? 'selected' : ''}>User</option>
              <option value="admin" ${s.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="superuser" ${s.role === 'superuser' ? 'selected' : ''}>Superuser</option>
            </select>
          </td>
          <td>${s.pin_changed ? '<span class="badge badge-pass">Custom PIN</span>' : '<span class="badge badge-worn">Default PIN</span>'}</td>
          <td><span class="badge badge-pass">Active</span></td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-sm" data-edit="${s.id}">Edit</button>
            <button class="btn btn-sm" data-reset="${s.id}" data-name="${UI.escapeHtml(s.name)}">Reset PIN</button>
            ${s.id !== Auth.currentStaff.id ? `<button class="btn btn-sm btn-danger" data-deactivate="${s.id}">Archive</button>` : ''}
          </td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-role-select]').forEach(sel => sel.addEventListener('change', async () => {
        try { await DB.updateStaff(sel.dataset.roleSelect, { role: sel.value }); UI.toast('Role updated'); this._refreshNav(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
      tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this._editStaffModal(rows.find(r => r.id === b.dataset.edit))));
      tbody.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm(`Reset ${b.dataset.name}'s PIN to the default (${DEFAULT_PIN})? This also clears their security questions — they'll set new ones next time they log in.`)) return;
        try { await DB.resetStaffPin(b.dataset.reset); UI.toast('PIN reset to default'); this._loadStaff(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
      tbody.querySelectorAll('[data-deactivate]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Archive this staff account? They\'ll no longer be able to log in, but their full log history and compliance record stay intact under Archived Staff below, and you can restore them anytime.')) return;
        try {
          await DB.deactivateStaff(b.dataset.deactivate);
          UI.toast('Staff archived');
          this._loadStaff(); this._loadArchivedStaff(); this._loadAssignments();
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Couldn't load staff.</td></tr>`;
    }
  },

  _addStaffModal() {
    const modal = UI.showModal(`
      <h3>Add Staff</h3>
      <div class="field" style="margin:12px 0;"><label>Full name</label><input type="text" id="as-name"></div>
      <div class="field" style="margin-bottom:10px;"><label>Job title <span class="hint">optional</span></label><input type="text" id="as-title" placeholder="e.g. SPD Tech"></div>
      <div class="field" style="margin-bottom:10px;"><label>Role</label>
        <select id="as-role">
          <option value="user">User — logbook data entry only</option>
          <option value="admin">Admin — + dashboard &amp; KPI reports</option>
          <option value="superuser">Superuser — full access</option>
        </select>
      </div>
      <div class="form-grid" style="margin-bottom:12px;">
        <div class="field"><label>Shift start <span class="hint">optional</span></label><input type="time" id="as-shift-start"></div>
        <div class="field"><label>Shift end <span class="hint">optional</span></label><input type="time" id="as-shift-end"></div>
      </div>
      <div class="default-pin-hint">The new account starts on the default PIN (${DEFAULT_PIN}) — they'll set their own PIN and security questions the first time they log in.</div>
      <div class="modal-actions">
        <button class="btn" id="as-cancel">Cancel</button>
        <button class="btn btn-primary" id="as-save">Create account</button>
      </div>
    `);
    modal.querySelector('#as-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#as-save').addEventListener('click', async () => {
      const name = modal.querySelector('#as-name').value.trim();
      if (!name) { UI.toast('Enter a name', true); return; }
      try {
        await DB.addStaff({
          name,
          job_title: modal.querySelector('#as-title').value.trim() || null,
          role: modal.querySelector('#as-role').value,
          pin: DEFAULT_PIN, pin_changed: false,
          shift_start: modal.querySelector('#as-shift-start').value || null,
          shift_end: modal.querySelector('#as-shift-end').value || null
        });
        UI.toast(`Account created for ${name} (default PIN ${DEFAULT_PIN})`);
        UI.closeModal();
        this._loadStaff();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- ARCHIVED STAFF (backlog item #8) ----------------
  async _loadArchivedStaff() {
    const wrap = document.getElementById('archived-staff-list');
    try {
      const all = await DB.listAllStaff();
      const archived = all.filter(s => !s.active);
      if (archived.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state">No archived staff.</div>`;
        return;
      }
      wrap.innerHTML = archived.map(s => `
        <div class="card card-pad" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;" id="archived-row-${s.id}">
          <div>
            <strong>${UI.escapeHtml(s.name)}</strong>
            <span class="hint" style="margin-left:6px;">${UI.escapeHtml(s.job_title) || '—'}</span>
            <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;" id="archived-stats-${s.id}">Loading history…</div>
          </div>
          <button class="btn btn-sm btn-primary" data-restore="${s.id}">Restore</button>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', async () => {
        try {
          await DB.activateStaff(b.dataset.restore);
          UI.toast('Staff restored');
          this._loadStaff(); this._loadArchivedStaff();
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
      // Compliance %/log counts loaded per-row after render so a slow one doesn't block the list.
      archived.forEach(async (s) => {
        const statEl = document.getElementById(`archived-stats-${s.id}`);
        if (!statEl) return;
        try {
          const [compliance, logCount] = await Promise.all([
            MissedLogs.computePersonal(s.id, 30),
            DB.countStaffLogs(s.id)
          ]);
          const complianceText = compliance.totalExpected > 0 ? `${compliance.compliancePct}% compliance (last 30 working days)` : 'No individually-tracked logbook history';
          statEl.textContent = `${complianceText} · ${logCount} total log${logCount === 1 ? '' : 's'} across all logbooks`;
        } catch (e) {
          statEl.textContent = 'Couldn\'t load history';
        }
      });
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load archived staff.</div>`;
    }
  },

  _refreshNav() {
    // Role changes for the currently-logged-in user take effect next login (kept simple/predictable).
  },

  _editStaffModal(s) {
    const modal = UI.showModal(`
      <h3>Edit — ${UI.escapeHtml(s.name)}</h3>
      <div class="field" style="margin:12px 0;"><label>Job title</label><input type="text" id="es-title" value="${UI.escapeHtml(s.job_title || '')}"></div>
      <div class="form-grid" style="margin-bottom:4px;">
        <div class="field"><label>Shift start</label><input type="time" id="es-shift-start" value="${s.shift_start ? s.shift_start.slice(0,5) : ''}"></div>
        <div class="field"><label>Shift end</label><input type="time" id="es-shift-end" value="${s.shift_end ? s.shift_end.slice(0,5) : ''}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="es-cancel">Cancel</button>
        <button class="btn btn-primary" id="es-save">Save</button>
      </div>
    `);
    modal.querySelector('#es-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#es-save').addEventListener('click', async () => {
      try {
        await DB.updateStaff(s.id, {
          job_title: modal.querySelector('#es-title').value.trim() || null,
          shift_start: modal.querySelector('#es-shift-start').value || null,
          shift_end: modal.querySelector('#es-shift-end').value || null
        });
        UI.toast('Updated'); UI.closeModal(); this._loadStaff();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- ASSIGNMENTS ----------------
  async _loadAssignments() {
    const wrap = document.getElementById('assignment-fields');
    try {
      const [assignments, staff] = await Promise.all([DB.listAssignments(), DB.listActiveStaff()]);
      const RANK_LABELS = { 1: 'Primary', 2: 'Secondary', 3: 'Tertiary' };
      wrap.innerHTML = Object.keys(LOGBOOK_LABELS).map(key => `
        <div class="field field-full" style="margin-bottom:12px;">
          <label>${LOGBOOK_LABELS[key]} <span class="hint">any active staff can still log this regardless of rank — this just sets who's accountable by default</span></label>
          <div class="form-grid">
            ${[1, 2, 3].map(rank => {
              const current = assignments.find(a => a.logbook === key && a.priority_rank === rank);
              return `
                <div class="field">
                  <label class="hint">${RANK_LABELS[rank]}</label>
                  <select data-assign="${key}" data-rank="${rank}">
                    <option value="">—</option>
                    ${staff.map(s => `<option value="${s.id}" ${current && current.staff_id === s.id ? 'selected' : ''}>${UI.escapeHtml(s.name)}</option>`).join('')}
                  </select>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('');
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load assignments.</div>`;
    }
  },

  async _saveAssignments() {
    const selects = document.querySelectorAll('[data-assign]');
    try {
      for (const sel of selects) {
        await DB.setAssignment(sel.dataset.assign, parseInt(sel.dataset.rank, 10), sel.value || null);
      }
      UI.toast('Assignments saved');
    } catch (e) { UI.toast('Failed: ' + e.message, true); }
  },

  // ---------------- EXCEPTIONS ----------------
  async _loadExceptions() {
    const tbody = document.getElementById('exception-tbody');
    try {
      const rows = await DB.listExceptions();
      if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No exceptions set — every weekday is treated as a working day.</td></tr>`; return; }
      tbody.innerHTML = rows.map(ex => `
        <tr>
          <td>${UI.escapeHtml(ex.exception_type)}</td>
          <td>${UI.fmtDate(ex.date_from)}</td>
          <td>${UI.fmtDate(ex.date_to)}</td>
          <td>${UI.escapeHtml(ex.reason) || '—'}</td>
          <td><button class="btn btn-sm btn-danger" data-del-exception="${ex.id}">Remove</button></td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-del-exception]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remove this exception? Dates in this range will count as working days again.')) return;
        try { await DB.deleteException(b.dataset.delException); UI.toast('Exception removed'); this._loadExceptions(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Couldn't load exceptions.</td></tr>`;
    }
  },

  _addExceptionModal() {
    const modal = UI.showModal(`
      <h3>Add exception</h3>
      <div class="field" style="margin:12px 0;"><label>Type</label>
        <select id="ex-type"><option>Holiday</option><option>December Break</option><option>Maintenance</option><option>Quarantine Closure</option><option>Other</option></select>
      </div>
      <div class="form-grid" style="margin-bottom:10px;">
        <div class="field"><label>From</label><input type="date" id="ex-from" value="${UI.todayStr()}"></div>
        <div class="field"><label>To</label><input type="date" id="ex-to" value="${UI.todayStr()}"></div>
      </div>
      <div class="field"><label>Reason</label><textarea id="ex-reason" placeholder="e.g. Christmas–New Year department closure"></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="ex-cancel">Cancel</button>
        <button class="btn btn-primary" id="ex-save">Add exception</button>
      </div>
    `);
    modal.querySelector('#ex-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#ex-save').addEventListener('click', async () => {
      const from = modal.querySelector('#ex-from').value, to = modal.querySelector('#ex-to').value;
      if (!from || !to || to < from) { UI.toast('Pick a valid date range', true); return; }
      try {
        await DB.addException({
          exception_type: modal.querySelector('#ex-type').value,
          date_from: from, date_to: to,
          reason: modal.querySelector('#ex-reason').value || null,
          created_by: Auth.currentStaff.name
        });
        UI.toast('Exception added'); UI.closeModal(); this._loadExceptions();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- MACHINES ----------------
  async _loadMachines() {
    const tbody = document.getElementById('machine-tbody');
    try {
      const rows = await DB.listAllMachines();
      this._machinesCache = rows;
      if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No machines yet.</td></tr>`; return; }
      const typeLabel = { ro: 'RO System', flash_sterilizer: 'Flash Sterilizer', autoclave: 'Autoclave', facility_equipment: 'Facility Equipment' };
      tbody.innerHTML = rows.map(m => `
        <tr>
          <td><strong>${UI.escapeHtml(m.machine_id)}</strong></td>
          <td>${typeLabel[m.machine_type] || m.machine_type}</td>
          <td>${UI.escapeHtml(m.label) || '—'}</td>
          <td class="mono">${m.scheduled_hours_per_day}</td>
          <td>${(m.applicable_tests || []).length ? m.applicable_tests.map(t => `<span class="badge badge-open" style="margin-right:4px;">${UI.escapeHtml(t)}</span>`).join('') : '<span class="hint">—</span>'}</td>
          <td>${m.active ? '<span class="badge badge-pass">Active</span>' : '<span class="badge badge-fail">Inactive</span>'}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm" data-edit="${m.id}">Edit</button>
            <button class="btn btn-sm" data-toggle="${m.id}" data-active="${m.active}">${m.active ? 'Deactivate' : 'Activate'}</button>
          </td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
        try { await DB.setMachineActive(b.dataset.toggle, b.dataset.active !== 'true'); this._loadMachines(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
      tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
        const machine = this._machinesCache.find(x => x.id === b.dataset.edit);
        if (machine) this._machineModal(machine);
      }));
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Couldn't load machines.</td></tr>`; }
  },

  _machineModal(existing) {
    const isEdit = !!existing;
    const currentTests = (existing && existing.applicable_tests) || ['Bowie-Dick', 'BI', 'Dummy'];
    const modal = UI.showModal(`
      <h3>${isEdit ? 'Edit machine' : 'Add machine'}</h3>
      <div class="field" style="margin:12px 0;"><label>Machine ID</label><input type="text" id="new-machine-id" placeholder="e.g. AC-02 or RO-02" value="${isEdit ? UI.escapeHtml(existing.machine_id) : ''}" ${isEdit ? 'disabled' : ''}></div>
      <div class="field" style="margin-bottom:12px;"><label>Type</label>
        <select id="new-machine-type">
          <option value="autoclave">Autoclave</option>
          <option value="flash_sterilizer">Flash Sterilizer</option>
          <option value="ro">RO System</option>
          <option value="facility_equipment">Facility Equipment</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:12px;"><label>Label (optional)</label><input type="text" id="new-machine-label" value="${isEdit ? UI.escapeHtml(existing.label || '') : ''}"></div>
      <div class="field" style="margin-bottom:12px;"><label>Scheduled operating hours/day</label><input type="number" id="new-machine-hours" value="${isEdit ? existing.scheduled_hours_per_day : 24}" step="0.5"></div>
      <div class="field" id="qa-tests-field">
        <label>Applicable QA tests <span class="hint">(drives what the Sterilizer QA Testing Log offers for this machine)</span></label>
        <div class="radio-row" style="margin-top:6px;">
          <label class="radio-chip${currentTests.includes('Bowie-Dick') ? ' active-good' : ''}" style="cursor:pointer;display:inline-flex;align-items:center;"><input type="checkbox" value="Bowie-Dick" style="margin-right:6px;" ${currentTests.includes('Bowie-Dick') ? 'checked' : ''}>Bowie-Dick</label>
          <label class="radio-chip${currentTests.includes('BI') ? ' active-good' : ''}" style="cursor:pointer;display:inline-flex;align-items:center;"><input type="checkbox" value="BI" style="margin-right:6px;" ${currentTests.includes('BI') ? 'checked' : ''}>BI</label>
          <label class="radio-chip${currentTests.includes('Dummy') ? ' active-good' : ''}" style="cursor:pointer;display:inline-flex;align-items:center;"><input type="checkbox" value="Dummy" style="margin-right:6px;" ${currentTests.includes('Dummy') ? 'checked' : ''}>Dummy/CI</label>
        </div>
        <div class="hint" style="margin-top:6px;">Not every sterilizer is pre-vacuum — uncheck Bowie-Dick for any machine it doesn't apply to.</div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="cancel-add-machine">Cancel</button>
        <button class="btn btn-primary" id="save-add-machine">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    `);
    const typeSelect = modal.querySelector('#new-machine-type');
    typeSelect.value = isEdit ? existing.machine_type : 'autoclave';
    const qaField = modal.querySelector('#qa-tests-field');
    const syncQaVisibility = () => qaField.classList.toggle('hidden', typeSelect.value === 'ro' || typeSelect.value === 'facility_equipment');
    typeSelect.addEventListener('change', syncQaVisibility);
    syncQaVisibility();
    modal.querySelectorAll('#qa-tests-field input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => {
      cb.closest('.radio-chip').classList.toggle('active-good', cb.checked);
    }));
    modal.querySelector('#cancel-add-machine').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#save-add-machine').addEventListener('click', async () => {
      const machine_id = modal.querySelector('#new-machine-id').value.trim();
      if (!machine_id) { UI.toast('Enter a machine ID', true); return; }
      const machine_type = typeSelect.value;
      const applicable_tests = machine_type === 'ro' ? [] :
        Array.from(modal.querySelectorAll('#qa-tests-field input[type="checkbox"]:checked')).map(cb => cb.value);
      const fields = {
        machine_type,
        label: modal.querySelector('#new-machine-label').value || null,
        scheduled_hours_per_day: parseFloat(modal.querySelector('#new-machine-hours').value) || 24,
        applicable_tests
      };
      try {
        if (isEdit) {
          await DB.updateMachine(existing.id, fields);
          UI.toast('Machine updated');
        } else {
          await DB.addMachine({ machine_id, ...fields });
          UI.toast('Machine added');
        }
        UI.closeModal();
        if (document.getElementById('machine-tbody')) this._loadMachines();
        if (window.onMachineAdded) window.onMachineAdded();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- RO PARAMETERS (need-to-basis activation) ----------------
  async _loadRoParams() {
    const tbody = document.getElementById('ro-param-tbody');
    try {
      const rows = await DB.listRoParameters(false);
      this._roParamsCache = rows;
      tbody.innerHTML = rows.map(p => `
        <tr>
          <td><strong>${UI.escapeHtml(p.name)}</strong></td>
          <td>${UI.escapeHtml(p.unit) || '—'}</td>
          <td>${p.reference_note ? UI.escapeHtml(p.reference_note) : (p.limit_min != null && p.limit_max != null ? `${p.limit_min}–${p.limit_max}` : p.limit_max != null ? `< ${p.limit_max}` : '—')}</td>
          <td>${UI.escapeHtml(p.standard_reference) || '—'}</td>
          <td><span class="badge ${p.active ? 'badge-pass' : 'badge-neutral'}">${p.active ? 'Active' : 'Inactive'}</span></td>
          <td><button class="btn btn-sm" data-toggle-param="${p.id}" data-active="${p.active}">${p.active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-toggle-param]').forEach(b => b.addEventListener('click', async () => {
        try { await DB.updateRoParameter(b.dataset.toggleParam, { active: b.dataset.active !== 'true' }); this._loadRoParams(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Couldn't load parameters.</td></tr>`; }
  },
  _roParamModal() {
    const modal = UI.showModal(`
      <h3>Add a parameter</h3>
      <div class="field" style="margin:12px 0;"><label>Name</label><input type="text" id="rp-name"></div>
      <div class="field" style="margin-bottom:12px;"><label>Unit</label><input type="text" id="rp-unit" placeholder="e.g. mg/L"></div>
      <div class="form-grid" style="margin-bottom:12px;">
        <div class="field"><label>Limit min</label><input type="number" step="0.01" id="rp-min"></div>
        <div class="field"><label>Limit max</label><input type="number" step="0.01" id="rp-max"></div>
      </div>
      <div class="field" style="margin-bottom:12px;"><label>Reference note <span class="hint">optional — for compound/conditional limits</span></label><input type="text" id="rp-note"></div>
      <div class="field"><label>Standard reference</label><input type="text" id="rp-std" placeholder="e.g. ANSI/AAMI ST108"></div>
      <div class="modal-actions">
        <button class="btn" id="rp-cancel">Cancel</button>
        <button class="btn btn-primary" id="rp-save">Add</button>
      </div>
    `);
    modal.querySelector('#rp-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#rp-save').addEventListener('click', async () => {
      const name = modal.querySelector('#rp-name').value.trim();
      if (!name) { UI.toast('Enter a name', true); return; }
      try {
        await DB.addRoParameter({
          name, unit: modal.querySelector('#rp-unit').value || null,
          limit_min: modal.querySelector('#rp-min').value ? parseFloat(modal.querySelector('#rp-min').value) : null,
          limit_max: modal.querySelector('#rp-max').value ? parseFloat(modal.querySelector('#rp-max').value) : null,
          reference_note: modal.querySelector('#rp-note').value || null,
          standard_reference: modal.querySelector('#rp-std').value || null,
          active: true, sort_order: (this._roParamsCache || []).length
        });
        UI.toast('Parameter added'); UI.closeModal(); this._loadRoParams();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- RO TESTERS (testing device/kit catalog) ----------------
  async _loadRoTesters() {
    const tbody = document.getElementById('ro-tester-tbody');
    try {
      const rows = await DB.listRoTesters(false);
      tbody.innerHTML = rows.length ? rows.map(t => `
        <tr>
          <td><strong>${UI.escapeHtml(t.name)}</strong></td>
          <td>${UI.escapeHtml(t.model) || '—'}</td>
          <td>${UI.escapeHtml(t.make) || '—'}</td>
          <td><span class="badge ${t.active ? 'badge-pass' : 'badge-neutral'}">${t.active ? 'Active' : 'Inactive'}</span></td>
          <td><button class="btn btn-sm" data-toggle-tester="${t.id}" data-active="${t.active}">${t.active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>
      `).join('') : `<tr><td colspan="5" class="empty-state">No testers registered yet.</td></tr>`;
      tbody.querySelectorAll('[data-toggle-tester]').forEach(b => b.addEventListener('click', async () => {
        try { await DB.updateRoTester(b.dataset.toggleTester, { active: b.dataset.active !== 'true' }); this._loadRoTesters(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Couldn't load testers.</td></tr>`; }
  },
  _roTesterModal() {
    const modal = UI.showModal(`
      <h3>Add a tester</h3>
      <div class="field" style="margin:12px 0;"><label>Name</label><input type="text" id="rt2-name" placeholder="e.g. Hach Conductivity Meter"></div>
      <div class="field" style="margin-bottom:12px;"><label>Model</label><input type="text" id="rt2-model"></div>
      <div class="field"><label>Make/manufacturer</label><input type="text" id="rt2-make"></div>
      <div class="modal-actions">
        <button class="btn" id="rt2-cancel">Cancel</button>
        <button class="btn btn-primary" id="rt2-save">Add</button>
      </div>
    `);
    modal.querySelector('#rt2-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#rt2-save').addEventListener('click', async () => {
      const name = modal.querySelector('#rt2-name').value.trim();
      if (!name) { UI.toast('Enter a name', true); return; }
      try {
        await DB.addRoTester({ name, model: modal.querySelector('#rt2-model').value || null, make: modal.querySelector('#rt2-make').value || null });
        UI.toast('Tester added'); UI.closeModal(); this._loadRoTesters();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- OFFLINE SYNC STATUS (backlog item #11) ----------------
  _loadSyncIssues() {
    const panel = document.getElementById('sync-issues-panel');
    const pending = OfflineQueue.list();
    const failed = OfflineQueue.listFailed();
    if (pending.length === 0 && failed.length === 0) {
      panel.innerHTML = `<div style="font-size:12.5px;color:var(--ink-soft);">Nothing queued — every log entry has reached the server.</div>`;
      return;
    }
    panel.innerHTML = `
      ${pending.length > 0 ? `<div style="margin-bottom:${failed.length ? '14px' : '0'};font-size:13px;">⏳ ${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} saved offline, waiting to sync — this device just needs to be back online.</div>` : ''}
      ${failed.length > 0 ? `
        <div style="font-size:13px;color:var(--red);font-weight:600;margin-bottom:8px;">⚠ ${failed.length} entr${failed.length === 1 ? 'y' : 'ies'} couldn't be saved to the server (not a connection problem — check with whoever entered these):</div>
        <div style="font-size:12px;font-family:var(--font-mono);background:var(--surface-sunken);border-radius:var(--radius-sm);padding:10px;max-height:160px;overflow:auto;margin-bottom:10px;">
          ${failed.map(f => `${UI.escapeHtml(f.table)} · ${UI.escapeHtml(f._error || 'unknown error')} · ${UI.fmtDateTime(f._failedAt)}`).join('<br>')}
        </div>
        <button class="btn btn-sm" id="clear-failed-writes">Clear this list</button>
      ` : ''}
    `;
    const clearBtn = document.getElementById('clear-failed-writes');
    if (clearBtn) clearBtn.addEventListener('click', () => { OfflineQueue.clearFailed(); this._loadSyncIssues(); });
  },

  // ---------------- TEMPERATURE & HUMIDITY LOCATIONS ----------------
  async _loadThLocations() {
    const tbody = document.getElementById('th-loc-tbody');
    try {
      const rows = await DB.listTempHumidityLocations(false);
      this._thLocationsCache = rows;
      tbody.innerHTML = rows.length ? rows.map(l => `
        <tr>
          <td><strong>${UI.escapeHtml(l.name)}</strong></td>
          <td class="mono">${l.temp_min}–${l.temp_max}</td>
          <td class="mono">${l.humidity_min}–${l.humidity_max}</td>
          <td><span class="badge ${l.active ? 'badge-pass' : 'badge-neutral'}">${l.active ? 'Active' : 'Inactive'}</span></td>
          <td style="display:flex;gap:6px;">
            <button class="btn btn-sm" data-edit-th="${l.id}">Edit</button>
            <button class="btn btn-sm" data-toggle-th="${l.id}" data-active="${l.active}">${l.active ? 'Deactivate' : 'Activate'}</button>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="5" class="empty-state">No locations configured.</td></tr>`;
      tbody.querySelectorAll('[data-toggle-th]').forEach(b => b.addEventListener('click', async () => {
        try { await DB.updateTempHumidityLocation(b.dataset.toggleTh, { active: b.dataset.active !== 'true' }); this._loadThLocations(); }
        catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
      tbody.querySelectorAll('[data-edit-th]').forEach(b => b.addEventListener('click', () => {
        this._thLocationModal(this._thLocationsCache.find(l => l.id === b.dataset.editTh));
      }));
    } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Couldn't load locations.</td></tr>`; }
  },
  _thLocationModal(existing) {
    const isEdit = !!existing;
    const modal = UI.showModal(`
      <h3>${isEdit ? 'Edit location' : 'Add a location'}</h3>
      <div class="field" style="margin:12px 0;"><label>Name</label><input type="text" id="th-loc-name" value="${isEdit ? UI.escapeHtml(existing.name) : ''}"></div>
      <div class="form-grid" style="margin-bottom:12px;">
        <div class="field"><label>Temp min (°C)</label><input type="number" step="0.1" id="th-loc-tmin" value="${isEdit ? existing.temp_min : 20}"></div>
        <div class="field"><label>Temp max (°C)</label><input type="number" step="0.1" id="th-loc-tmax" value="${isEdit ? existing.temp_max : 24}"></div>
        <div class="field"><label>Humidity min (%)</label><input type="number" step="0.1" id="th-loc-hmin" value="${isEdit ? existing.humidity_min : 20}"></div>
        <div class="field"><label>Humidity max (%)</label><input type="number" step="0.1" id="th-loc-hmax" value="${isEdit ? existing.humidity_max : 60}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="th-loc-cancel">Cancel</button>
        <button class="btn btn-primary" id="th-loc-save">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    `);
    modal.querySelector('#th-loc-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#th-loc-save').addEventListener('click', async () => {
      const name = modal.querySelector('#th-loc-name').value.trim();
      if (!name) { UI.toast('Enter a name', true); return; }
      const fields = {
        name,
        temp_min: parseFloat(modal.querySelector('#th-loc-tmin').value),
        temp_max: parseFloat(modal.querySelector('#th-loc-tmax').value),
        humidity_min: parseFloat(modal.querySelector('#th-loc-hmin').value),
        humidity_max: parseFloat(modal.querySelector('#th-loc-hmax').value)
      };
      try {
        if (isEdit) await DB.updateTempHumidityLocation(existing.id, fields);
        else await DB.addTempHumidityLocation({ ...fields, active: true, sort_order: (this._thLocationsCache || []).length });
        UI.toast(isEdit ? 'Location updated' : 'Location added'); UI.closeModal(); this._loadThLocations();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  },

  // ---------------- LOGBOOK SCHEDULES ----------------
  async _loadSchedules() {
    const list = document.getElementById('qa-schedule-list');
    try {
      const machines = await DB.listAllMachines();
      const qaMachines = machines.filter(m => m.machine_type === 'autoclave' || m.machine_type === 'flash_sterilizer');
      list.innerHTML = qaMachines.map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span>${UI.escapeHtml(m.machine_id)} <span class="hint">${UI.escapeHtml(m.label || '')}</span></span>
          <select data-qa-sched="${m.machine_id}" style="width:150px;">
            <option value="">— not scheduled —</option>
            ${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => `<option value="${d}" ${m.qa_schedule_day === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
      `).join('');
      list.querySelectorAll('[data-qa-sched]').forEach(sel => sel.addEventListener('change', async () => {
        try {
          const m = machines.find(x => x.machine_id === sel.dataset.qaSched);
          await DB.updateMachine(m.id, { qa_schedule_day: sel.value || null });
          UI.toast(`${sel.dataset.qaSched} schedule saved`);
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) { list.innerHTML = `<div class="empty-state">Couldn't load machines.</div>`; }

    try {
      const params = await DB.listRoParameters(false);
      const roList = document.getElementById('ro-schedule-list');
      roList.innerHTML = params.map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <span>${UI.escapeHtml(p.name)} ${!p.active ? '<span class="hint">(inactive)</span>' : ''}</span>
          <div style="display:flex;gap:6px;">
            <select data-ro-freq="${p.id}" style="width:120px;">
              <option value="daily" ${p.schedule_frequency === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${p.schedule_frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${p.schedule_frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
              <option value="quarterly" ${p.schedule_frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
            </select>
            <select data-ro-day="${p.id}" style="width:120px;${p.schedule_frequency !== 'weekly' ? 'visibility:hidden;' : ''}">
              <option value="">— day —</option>
              ${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => `<option value="${d}" ${p.schedule_day === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
        </div>
      `).join('');
      const saveRoSchedule = async (paramId) => {
        const freqSel = roList.querySelector(`[data-ro-freq="${paramId}"]`);
        const daySel = roList.querySelector(`[data-ro-day="${paramId}"]`);
        daySel.style.visibility = freqSel.value === 'weekly' ? 'visible' : 'hidden';
        try {
          await DB.updateRoParameter(paramId, { schedule_frequency: freqSel.value, schedule_day: freqSel.value === 'weekly' ? (daySel.value || null) : null });
          UI.toast('Schedule saved');
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      };
      roList.querySelectorAll('[data-ro-freq]').forEach(sel => sel.addEventListener('change', () => saveRoSchedule(sel.dataset.roFreq)));
      roList.querySelectorAll('[data-ro-day]').forEach(sel => sel.addEventListener('change', () => saveRoSchedule(sel.dataset.roDay)));
    } catch (e) {
      document.getElementById('ro-schedule-list').innerHTML = `<div class="empty-state">Couldn't load parameters.</div>`;
    }
  },

  // ---------------- DATA RETENTION (backlog item #9) ----------------
  async _loadScheduleOverview() {
    const panel = document.getElementById('schedule-overview-panel');
    try {
      const [machines, roParams] = await Promise.all([DB.listAllMachines(), DB.listRoParameters(false)]);
      const qaMachines = machines.filter(m => m.qa_schedule_day);
      const byFreq = { weekly: [], monthly: [], quarterly: [], daily: [] };
      roParams.forEach(p => {
        const entry = `${p.name}${p.active ? '' : ' <span class="hint">(inactive)</span>'}${p.schedule_day ? ` — ${p.schedule_day}` : ''}`;
        (byFreq[p.schedule_frequency] || byFreq.monthly).push(entry);
      });

      const section = (title, items, note) => `
        <div style="margin-bottom:18px;">
          <div style="font-weight:700;margin-bottom:6px;">${title}</div>
          ${note ? `<div class="hint" style="margin-bottom:6px;">${note}</div>` : ''}
          ${items.length ? `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<div class="hint">None currently.</div>`}
        </div>
      `;

      panel.innerHTML =
        section('Daily (Mon–Fri)', [
          'Temperature &amp; Humidity — Autoclave Area',
          'Temperature &amp; Humidity — Sterile Storage Area',
          ...byFreq.daily
        ]) +
        section('Daily + Sunday', ['CSSD Housekeeping'], 'A Saturday cleaning waives that week\'s Sunday requirement.') +
        section('Weekly', [
          ...qaMachines.map(m => `QA Testing — ${m.machine_id} (${m.qa_schedule_day})`),
          'Cleaning Brush — per brush, per calendar week',
          ...byFreq.weekly
        ]) +
        section('Monthly / Quarterly', [
          ...byFreq.monthly.map(i => `RO — ${i} (monthly)`),
          ...byFreq.quarterly.map(i => `RO — ${i} (quarterly)`)
        ]) +
        section('Event-driven — no calendar schedule', [
          'Equipment Downtime', 'Instrument Maintenance', 'Sterilization Cycle Log', 'Instrument/Supplies Handover'
        ], 'These happen when triggered by a real event, not on a fixed date — nothing to track as "missed".');
    } catch (e) {
      panel.innerHTML = `<div class="empty-state">Couldn't load schedule data.</div>`;
    }
  },

  async _loadDeptAccounts() {
    const panel = document.getElementById('dept-accounts-panel');
    const DEPARTMENTS = ['ER', 'OPD', 'OR', 'WARD 2nd Floor', 'WARD 3rd Floor', 'Other'];
    try {
      const accounts = await DB.listDepartmentAccounts();
      if (accounts.length === 0) {
        panel.innerHTML = `<div class="empty-state">No department accounts registered yet.</div>`;
        return;
      }
      panel.innerHTML = accounts.map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
          <span>${UI.escapeHtml(a.name)}</span>
          <div style="display:flex;gap:6px;">
            <select data-dept-select="${a.id}" style="width:150px;">
              ${DEPARTMENTS.map(d => `<option value="${d}" ${a.department === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
            <input type="text" data-dept-other="${a.id}" placeholder="specify" value="${UI.escapeHtml(a.department_other) || ''}" style="width:120px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:6px 8px;${a.department !== 'Other' ? 'visibility:hidden;' : ''}">
          </div>
        </div>
      `).join('');
      panel.querySelectorAll('[data-dept-select]').forEach(sel => {
        const id = sel.dataset.deptSelect;
        const otherInput = panel.querySelector(`[data-dept-other="${id}"]`);
        sel.addEventListener('change', async () => {
          otherInput.style.visibility = sel.value === 'Other' ? 'visible' : 'hidden';
          try {
            await DB.updateStaff(id, { department: sel.value, department_other: sel.value === 'Other' ? otherInput.value || null : null });
            UI.toast('Department updated');
          } catch (e) { UI.toast('Failed: ' + e.message, true); }
        });
      });
      panel.querySelectorAll('[data-dept-other]').forEach(inp => {
        const id = inp.dataset.deptOther;
        inp.addEventListener('change', async () => {
          try {
            await DB.updateStaff(id, { department_other: inp.value || null });
            UI.toast('Department updated');
          } catch (e) { UI.toast('Failed: ' + e.message, true); }
        });
      });
    } catch (e) {
      panel.innerHTML = `<div class="empty-state">Couldn't load department accounts.</div>`;
    }
  },

  async _loadRetentionPanel() {
    const panel = document.getElementById('retention-panel');
    let meta = null;
    try { meta = await DB.getAppMeta(); } catch (e) {}
    const years = meta ? meta.retention_years : 3;
    panel.innerHTML = `
      <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:14px;">Log rows older than this are eligible for cleanup. Nothing is ever deleted automatically — cleanup only runs when a superuser triggers it here, and always shows exactly what will be removed first.</div>
      <div class="form-grid" style="margin-bottom:16px;">
        <div class="field"><label>Retention period (years)</label><input type="number" id="retention-years" min="1" step="1" value="${years}"></div>
        <div style="align-self:flex-end;"><button class="btn btn-sm" id="retention-save">Save</button></div>
      </div>
      <button class="btn btn-danger" id="retention-cleanup">Run Cleanup Now</button>
    `;
    panel.querySelector('#retention-save').addEventListener('click', async () => {
      const val = parseInt(panel.querySelector('#retention-years').value, 10);
      if (!val || val < 1) { UI.toast('Enter a valid number of years', true); return; }
      try { await DB.updateAppMeta({ retention_years: val }); UI.toast('Retention period saved'); }
      catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
    panel.querySelector('#retention-cleanup').addEventListener('click', () => this._openCleanupModal());
  },

  _openResetModal(tier) {
    const isAll = tier === 'all';
    const phrase = isAll ? 'DELETE ALL' : 'RESET EVERYTHING';
    const modal = UI.showModal(`
      <h3 style="color:var(--red);">⚠ ${isAll ? 'Delete All' : 'Delete Logged Data Only'}</h3>
      <div class="modal-desc">${isAll
        ? 'This permanently deletes <strong>every logged entry</strong> across all 9 logbooks, all pending/schedule exceptions, <strong>and every machine, RO parameter, RO tester, Temp/Humidity location, logbook assignment, and registered brush</strong> — a true factory reset. Only staff accounts are kept, so someone can log in afterward.'
        : 'This permanently deletes <strong>every logged entry</strong> across all 9 logbooks, plus all pending and schedule exceptions, and un-launches the app. Staff, machines, and configuration are kept.'
      } <strong>This cannot be undone.</strong></div>
      <div class="field" style="margin:14px 0;">
        <label>Type <span class="mono" style="color:var(--red);">${phrase}</span> to confirm</label>
        <input type="text" id="reset-confirm-input" autocomplete="off">
      </div>
      <div class="modal-actions">
        <button class="btn" id="reset-cancel">Cancel</button>
        <button class="btn btn-danger" id="reset-confirm" disabled>${isAll ? 'Delete all' : 'Reset data'}</button>
      </div>
    `);
    modal.querySelector('#reset-cancel').addEventListener('click', () => UI.closeModal());
    const input = modal.querySelector('#reset-confirm-input');
    const confirmBtn = modal.querySelector('#reset-confirm');
    input.addEventListener('input', () => { confirmBtn.disabled = input.value !== phrase; });
    confirmBtn.addEventListener('click', async () => {
      await UI.withLoading(confirmBtn, async () => {
        try {
          const results = isAll ? await DB.deleteAllExceptStaff() : await DB.resetDataOnly();
          const total = results.reduce((s, r) => s + r.deleted, 0);
          UI.closeModal();
          UI.toast(`${isAll ? 'Delete All' : 'Reset'} complete — ${total} row${total === 1 ? '' : 's'} deleted. Reloading…`);
          setTimeout(() => location.reload(), 1200);
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      });
    });
  },

  async _openCleanupModal() {
    let meta = null;
    try { meta = await DB.getAppMeta(); } catch (e) {}
    const years = meta ? meta.retention_years : 3;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const modal = UI.showModal(`
      <h3>Run Cleanup Now</h3>
      <div class="modal-desc">Deletes log rows dated before ${UI.fmtDate(cutoffStr)} (older than ${years} year${years === 1 ? '' : 's'}). This cannot be undone.</div>
      <div id="cleanup-counts" style="margin:14px 0;">Checking…</div>
      <div class="modal-actions">
        <button class="btn" id="cleanup-cancel">Cancel</button>
        <button class="btn btn-danger" id="cleanup-confirm" disabled>Delete</button>
      </div>
    `);
    modal.querySelector('#cleanup-cancel').addEventListener('click', () => UI.closeModal());
    const countsEl = modal.querySelector('#cleanup-counts');
    const confirmBtn = modal.querySelector('#cleanup-confirm');
    let counts = [];
    try {
      counts = await DB.countStaleLogs(cutoffStr);
      const total = counts.reduce((sum, c) => sum + c.count, 0);
      if (total === 0) {
        countsEl.innerHTML = `<div class="empty-state">Nothing older than the cutoff — no cleanup needed.</div>`;
        return;
      }
      countsEl.innerHTML = `
        <table style="width:100%;font-size:13px;">
          ${counts.map(c => `<tr><td style="padding:4px 0;">${UI.escapeHtml(c.label)}</td><td class="mono" style="text-align:right;">${c.count}</td></tr>`).join('')}
          <tr style="border-top:1px solid var(--line);font-weight:700;"><td style="padding:6px 0;">Total</td><td class="mono" style="text-align:right;">${total}</td></tr>
        </table>
      `;
      confirmBtn.disabled = false;
      confirmBtn.textContent = `Delete ${total} row${total === 1 ? '' : 's'}`;
    } catch (e) {
      countsEl.innerHTML = `<div class="empty-state">Couldn't check: ${UI.escapeHtml(e.message)}</div>`;
      return;
    }
    confirmBtn.addEventListener('click', async () => {
      if (!confirm('This permanently deletes the rows listed above. Continue?')) return;
      await UI.withLoading(confirmBtn, async () => {
        try {
          const results = await DB.purgeStaleLogs(cutoffStr);
          const total = results.reduce((sum, r) => sum + r.deleted, 0);
          UI.toast(`Deleted ${total} row${total === 1 ? '' : 's'}`);
          UI.closeModal();
        } catch (e) {
          UI.toast('Cleanup failed: ' + e.message, true);
        }
      });
    });
  },

  // ---------------- VERSION & UPDATES ----------------
  async _loadVersionPanel() {
    const panel = document.getElementById('version-panel');
    let meta = null;
    try { meta = await DB.getAppMeta(); } catch (e) {}
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:14px;">
        <div>
          <div style="font-size:12px;color:var(--ink-soft);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Current version</div>
          <div style="font-family:var(--font-mono);font-size:20px;font-weight:600;margin-top:4px;">${meta ? UI.escapeHtml(meta.app_version) : '—'}</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">Released ${meta ? UI.fmtDate(meta.released_on) : '—'}</div>
        </div>
      </div>
      ${meta && meta.changelog ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:16px;">${UI.escapeHtml(meta.changelog)}</div>` : ''}

      <div style="background:var(--surface-sunken);border-radius:10px;padding:14px 16px;font-size:12.5px;line-height:1.6;">
        <strong>How updates work here</strong><br>
        This app deliberately does <em>not</em> let anyone push new code into it from inside the browser — a client-side "auto-update" button would mean anyone with a superuser PIN could push
        unreviewed code straight into a live hospital system, with no way to review it first and no safe rollback. That's not a risk worth taking for a few-times-a-year update.<br><br>
        Instead, updating the app is a two-minute manual step that never touches your data:
        <ol style="margin:8px 0 8px 18px;padding:0;">
          <li>Get the updated files (Claude can prepare these for you as a download).</li>
          <li>On GitHub.com, open your repo → <strong>Add file → Upload files</strong> → drag in the updated files → Commit.</li>
          <li>GitHub Pages rebuilds automatically within about a minute — no database involved at all.</li>
        </ol>
        Your Supabase database is completely separate from the app's code, so updating the interface never risks or disrupts logged data. The only time the database itself needs a change
        is if a new feature needs a new field or table — in that case you'd run one short SQL script in the Supabase SQL Editor (we'll always give you that exact script, and it only adds
        things, never deletes your existing logs).
      </div>

      <div class="form-actions" style="justify-content:flex-start;margin-top:16px;">
        <button class="btn" id="btn-update-version-note">Update version note (after you deploy new code)</button>
      </div>
    `;
    document.getElementById('btn-update-version-note').addEventListener('click', () => this._editVersionModal(meta));
  },

  _editVersionModal(meta) {
    const modal = UI.showModal(`
      <h3>Update version note</h3>
      <div class="modal-desc">This just updates the label shown here — run this after you've actually deployed new files to GitHub.</div>
      <div class="field" style="margin-bottom:12px;"><label>Version</label><input type="text" id="ver-num" value="${meta ? UI.escapeHtml(meta.app_version) : ''}"></div>
      <div class="field"><label>What changed</label><textarea id="ver-changelog">${meta ? UI.escapeHtml(meta.changelog || '') : ''}</textarea></div>
      <div class="modal-actions">
        <button class="btn" id="ver-cancel">Cancel</button>
        <button class="btn btn-primary" id="ver-save">Save</button>
      </div>
    `);
    modal.querySelector('#ver-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#ver-save').addEventListener('click', async () => {
      try {
        await DB.updateAppMeta({
          app_version: modal.querySelector('#ver-num').value.trim(),
          changelog: modal.querySelector('#ver-changelog').value.trim(),
          released_on: UI.todayStr()
        });
        UI.toast('Version note updated'); UI.closeModal(); this._loadVersionPanel();
      } catch (e) { UI.toast('Failed: ' + e.message, true); }
    });
  }
};

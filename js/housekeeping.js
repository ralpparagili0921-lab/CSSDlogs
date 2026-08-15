// ============================================================
// CSSD HOUSEKEEPING LOG — 9th logbook. This is the one logbook in
// the app that's genuinely a checklist (task groups, 3-state status
// per item), matching the real form exactly — everything else in
// CSSD deliberately stayed single-field forms, but this one's real
// shape needs it. Kept as one single page (no wizard/auto-advance),
// consistent with how every other CSSD form works — just with
// checklist tables inside it. No photo evidence, by request.
// ============================================================

const HOUSEKEEPING_TASKS = [
  'Perform hand hygiene',
  'Don personal protective equipment',
  'Door Knobs / Handles',
  'Light Switches',
  'Table surfaces',
  'Supplies Container',
  'Cabinets',
  'Chairs',
  'Wall mop',
  'Carts',
  'Sinks are cleaned',
  'Floor is mopped'
];
const HOUSEKEEPING_STERILIZATION_EQUIPMENT = [
  'Inspect sterilization equipment',
  'Check that the equipment is functioning properly',
  'Ensure that the sterilization area is clean'
];
const HOUSEKEEPING_POST_CLEANING_TASKS = [
  'Collect linen',
  'Remove trash / garbage',
  'Remove PPE',
  'Perform hand hygiene'
];
const HOUSEKEEPING_TERMINAL_TASKS = [
  'All ceiling vents and walls',
  'All furniture pulled out and cleaned',
  'All cabinetry wiped down',
  'OR deep scrub',
  'Curtains / Privacy screens'
];
const HOUSEKEEPING_CLEANING_TYPES = [
  'Daily/Routine Cleaning', 'Terminal Cleaning', 'Between Cases',
  'Floor Scrubbing only', 'Floor Scrubbing with Routine Cleaning', 'Floor Scrubbing with Terminal Cleaning',
  'After Maintenance Repairs', 'After Major Repairs'
];
const HOUSEKEEPING_TERMINAL_COMPLETED_BY = ['Hazel Joy Codifera', 'Haya Jean Opelio', 'Romerlie Empalmado'];

const HousekeepingView = {
  async render() {
    const el = document.getElementById('view-housekeeping');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>CSSD Housekeeping Checklist</h1>
          <div class="desc">Complete at the end of each shift and after any Terminal Cleaning. "N/A" means the item isn't present in the room today.</div>
        </div>
      </div>
      <div class="card card-pad" style="background:rgba(245,140,53,0.08);border-color:rgba(245,140,53,0.35);margin-bottom:22px;">
        <strong style="color:var(--amber);">Note:</strong> Hand hygiene and appropriate PPE must be donned prior to beginning the cleaning process.
      </div>

      <div class="card card-pad">
        <form id="hk-form">
          <div class="form-grid" style="margin-bottom:18px;">
            <div class="field"><label>Date of Cleaning</label><input type="date" name="log_date" value="${UI.todayStr()}" required></div>
            <div class="field field-full">
              <label>Type of Cleaning Performed</label>
              <div class="radio-row" id="hk-cleaning-type">
                ${HOUSEKEEPING_CLEANING_TYPES.map(t => `<button type="button" class="radio-chip" data-val="${t}">${t}</button>`).join('')}
                <button type="button" class="radio-chip" data-val="Other">Other</button>
              </div>
              <input type="text" id="hk-cleaning-type-other" class="hidden" placeholder="Specify" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
            </div>
          </div>

          <div class="section-title" style="margin-top:0;">Tasks <span class="hint">complete in order — don't skip around</span></div>
          <div id="hk-tasks-table"></div>

          <div class="section-title">Sterilization Equipment</div>
          <div id="hk-sterilization-table"></div>

          <div class="section-title">Post-Cleaning Task</div>
          <div id="hk-postcleaning-table"></div>

          <div class="section-title">Terminal Cleaning</div>
          <div class="field field-full" style="margin-bottom:14px;">
            <div class="radio-row" id="hk-terminal-select">
              <button type="button" class="radio-chip active-good" data-val="false">Without Terminal Cleaning</button>
              <button type="button" class="radio-chip" data-val="true">With Terminal Cleaning</button>
            </div>
          </div>
          <div id="hk-terminal-section" class="hidden">
            <div class="hint" style="margin-bottom:10px;">Terminal cleaning requires additional rigor — confirm these specific areas were addressed during the deep clean.</div>
            <div id="hk-terminal-table"></div>
            <div class="field field-full" style="margin-top:14px;">
              <label>Terminal Cleaning Completed By</label>
              <div class="radio-row" id="hk-terminal-by">
                ${HOUSEKEEPING_TERMINAL_COMPLETED_BY.map(n => `<button type="button" class="radio-chip" data-val="${n}">${n}</button>`).join('')}
                <button type="button" class="radio-chip" data-val="Other">Other</button>
              </div>
              <input type="text" id="hk-terminal-by-other" class="hidden" placeholder="Specify" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 10px;width:100%;">
            </div>
          </div>

          <div class="section-title">Sign-Off and Inspection</div>
          <div class="form-grid">
            <div class="field field-full">
              <label>Inspected By <span class="hint">head of department, charge nurse, or lead technician — if applicable</span></label>
              <input type="text" name="inspected_by">
            </div>
          </div>

          <div class="form-actions" style="margin-top:20px;">
            <button type="submit" class="btn btn-primary" id="hk-submit">Save checklist</button>
          </div>
        </form>
      </div>

      <div class="section-title">Recent checklists <span class="count" id="hk-count">—</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Type</th><th>Terminal?</th><th>Inspected by</th><th>Logged by</th></tr></thead>
        <tbody id="hk-tbody"><tr><td colspan="5" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;

    this._cleaningType = null;
    this._terminalBy = null;
    this._hasTerminal = false;
    this._taskStates = { tasks: {}, sterilization_equipment: {}, post_cleaning_tasks: {}, terminal_cleaning_tasks: {} };

    document.getElementById('hk-tasks-table').innerHTML = this._checklistTableHtml('tasks', HOUSEKEEPING_TASKS);
    document.getElementById('hk-sterilization-table').innerHTML = this._checklistTableHtml('sterilization_equipment', HOUSEKEEPING_STERILIZATION_EQUIPMENT);
    document.getElementById('hk-postcleaning-table').innerHTML = this._checklistTableHtml('post_cleaning_tasks', HOUSEKEEPING_POST_CLEANING_TASKS);
    document.getElementById('hk-terminal-table').innerHTML = this._checklistTableHtml('terminal_cleaning_tasks', HOUSEKEEPING_TERMINAL_TASKS);
    this._wireChecklistChips();

    document.getElementById('hk-cleaning-type').querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      document.getElementById('hk-cleaning-type').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip active-good';
      this._cleaningType = chip.dataset.val;
      document.getElementById('hk-cleaning-type-other').classList.toggle('hidden', chip.dataset.val !== 'Other');
    }));
    document.getElementById('hk-terminal-select').querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      document.getElementById('hk-terminal-select').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip ' + (chip.dataset.val === 'false' ? 'active-good' : 'active-bad');
      this._hasTerminal = chip.dataset.val === 'true';
      document.getElementById('hk-terminal-section').classList.toggle('hidden', !this._hasTerminal);
    }));
    document.getElementById('hk-terminal-by').querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      document.getElementById('hk-terminal-by').querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip active-good';
      this._terminalBy = chip.dataset.val;
      document.getElementById('hk-terminal-by-other').classList.toggle('hidden', chip.dataset.val !== 'Other');
    }));

    FormDraft.attach(document.getElementById('hk-form'), 'hk-form', {
      getExtra: () => ({
        cleaningType: this._cleaningType,
        hasTerminal: this._hasTerminal,
        terminalBy: this._terminalBy,
        taskStates: this._taskStates
      }),
      setExtra: (extra) => {
        if (extra.cleaningType) document.querySelector(`#hk-cleaning-type [data-val="${extra.cleaningType}"]`)?.click();
        if (extra.hasTerminal) document.querySelector(`#hk-terminal-select [data-val="true"]`)?.click();
        if (extra.terminalBy) document.querySelector(`#hk-terminal-by [data-val="${extra.terminalBy}"]`)?.click();
        Object.entries(extra.taskStates || {}).forEach(([group, byIdx]) => {
          Object.entries(byIdx).forEach(([idx, val]) => {
            document.querySelector(`[data-group="${group}"][data-idx="${idx}"] [data-val="${val}"]`)?.click();
          });
        });
      }
    });

    document.getElementById('hk-form').addEventListener('submit', (e) => this._submit(e));
    this._loadTable();
  },

  _checklistTableHtml(groupKey, items) {
    return `
      <div class="table-wrap" style="margin-bottom:16px;"><table>
        <thead><tr><th>Task</th><th style="width:280px;">Status</th></tr></thead>
        <tbody>
          ${items.map((item, i) => `
            <tr>
              <td>${item}</td>
              <td>
                <div class="radio-row" data-group="${groupKey}" data-idx="${i}">
                  <button type="button" class="radio-chip" data-val="Cleaned/Done">Cleaned</button>
                  <button type="button" class="radio-chip" data-val="Not Cleaned/Not Done">Not done</button>
                  <button type="button" class="radio-chip" data-val="N/A">N/A</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
  },

  _wireChecklistChips() {
    document.querySelectorAll('[data-group]').forEach(row => {
      const group = row.dataset.group;
      const idx = row.dataset.idx;
      row.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
        row.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
        const val = chip.dataset.val;
        chip.className = 'radio-chip ' + (val === 'Cleaned/Done' ? 'active-good' : val === 'Not Cleaned/Not Done' ? 'active-bad' : '');
        this._taskStates[group][idx] = val;
      }));
    });
  },

  _groupComplete(groupKey, items) {
    return items.every((_, i) => this._taskStates[groupKey][i]);
  },
  _groupToArray(groupKey, items) {
    return items.map((item, i) => ({ item, status: this._taskStates[groupKey][i] || null }));
  },

  async _submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);

    if (!this._cleaningType) { UI.toast('Select the type of cleaning performed', true); return; }
    if (!this._groupComplete('tasks', HOUSEKEEPING_TASKS)) { UI.toast('Complete every item in Tasks', true); return; }
    if (!this._groupComplete('sterilization_equipment', HOUSEKEEPING_STERILIZATION_EQUIPMENT)) { UI.toast('Complete every item in Sterilization Equipment', true); return; }
    if (!this._groupComplete('post_cleaning_tasks', HOUSEKEEPING_POST_CLEANING_TASKS)) { UI.toast('Complete every item in Post-Cleaning Task', true); return; }
    if (this._hasTerminal) {
      if (!this._groupComplete('terminal_cleaning_tasks', HOUSEKEEPING_TERMINAL_TASKS)) { UI.toast('Complete every item in Terminal Cleaning Tasks', true); return; }
      if (!this._terminalBy) { UI.toast('Select who completed the terminal cleaning', true); return; }
    }

    const entry = {
      log_date: fd.get('log_date'),
      cleaning_type: this._cleaningType,
      cleaning_type_other: this._cleaningType === 'Other' ? (document.getElementById('hk-cleaning-type-other').value || 'Other') : null,
      tasks: this._groupToArray('tasks', HOUSEKEEPING_TASKS),
      sterilization_equipment: this._groupToArray('sterilization_equipment', HOUSEKEEPING_STERILIZATION_EQUIPMENT),
      post_cleaning_tasks: this._groupToArray('post_cleaning_tasks', HOUSEKEEPING_POST_CLEANING_TASKS),
      has_terminal_cleaning: this._hasTerminal,
      terminal_cleaning_tasks: this._hasTerminal ? this._groupToArray('terminal_cleaning_tasks', HOUSEKEEPING_TERMINAL_TASKS) : null,
      terminal_cleaning_completed_by: this._hasTerminal
        ? (this._terminalBy === 'Other' ? (document.getElementById('hk-terminal-by-other').value || 'Other') : this._terminalBy)
        : null,
      inspected_by: fd.get('inspected_by') || null,
      staff_id: Auth.currentStaff.id,
      staff_name: Auth.currentStaff.name
    };

    const btn = document.getElementById('hk-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addHousekeepingLog(entry);
        UI.writeResultToast(result, 'Checklist saved');
        FormDraft.clear('hk-form');
        this.render();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  async _loadTable() {
    const tbody = document.getElementById('hk-tbody');
    try {
      const rows = await DB.listHousekeepingLogs({ from: UI.daysAgoStr(30), limit: 100 });
      document.getElementById('hk-count').textContent = `${rows.length} in last 30 days`;
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No checklists logged in the last 30 days.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${UI.fmtDate(r.log_date)}</td>
          <td>${UI.escapeHtml(r.cleaning_type === 'Other' ? r.cleaning_type_other : r.cleaning_type)}</td>
          <td><span class="badge ${r.has_terminal_cleaning ? 'badge-open' : 'badge-neutral'}">${r.has_terminal_cleaning ? 'Yes' : 'No'}</span></td>
          <td>${UI.escapeHtml(r.inspected_by) || '—'}</td>
          <td>${UI.escapeHtml(r.staff_name)}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Couldn't load checklists: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  }
};

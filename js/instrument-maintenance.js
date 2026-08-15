// ============================================================
// INSTRUMENT MAINTENANCE LOG — Out/Returned lifecycle, matching
// Equipment Downtime/Cycle Log/Handover. The entry form only ever
// sends something OUT; marking something back as Returned happens as
// an action on the open items list below, not by picking a "Finished
// X" option from the same dropdown used to send something out.
// ============================================================

const InstrumentMaintenanceView = {
  async render() {
    const el = document.getElementById('view-instruments');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>Instrument Maintenance Log</h1>
          <div class="desc">Repair, rust removal, ultrasonic cleaning, and lubrication tracking.</div>
        </div>
      </div>

      <div class="card card-pad">
        <form id="im-form">
          <div class="form-grid">
            <div class="field field-full">
              <label>Sending out for</label>
              <select name="action_out" required>
                <option>For Physical / Functional Repair</option>
                <option>For Rust Removal Soaking</option>
                <option>For Ultrasonic Cleaning</option>
                <option>For Lubrication</option>
                <option>Other</option>
              </select>
            </div>
            <div class="field field-full">
              <label>Entry type</label>
              <div class="radio-row" id="im-mode-row"><button type="button" class="radio-chip active-good" data-val="individual">Individual instrument</button><button type="button" class="radio-chip" data-val="set">Whole set/tray</button></div>
            </div>
            <div class="field" id="im-instrument-wrap">
              <label id="im-name-label">Name of instrument <span class="hint">type one, press Enter to start a new line, then type the next one — for more than one instrument in this entry</span></label>
              <textarea name="instrument_name" rows="2" placeholder="e.g. Mayo Scissors"></textarea>
            </div>
            <div class="field" id="im-serial-wrap"><label>Serial/Lot number <span class="hint">optional</span></label><input type="text" name="serial_lot_number"></div>
            <div class="field" id="im-fromtray-wrap">
              <label>From a tray or set?</label>
              <div class="radio-row" id="im-tray-row"><button type="button" class="radio-chip" data-val="false">No</button><button type="button" class="radio-chip active-good" data-val="true">Yes</button></div>
            </div>
            <div class="field" id="im-traynum-wrap"><label>Case/Tray number</label><input type="text" name="tray_case_number"></div>
            <div class="field" id="im-settray-wrap"><label>Set/Tray name</label><input type="text" name="set_tray_name" placeholder="e.g. Major Instrument Set"></div>
            <div class="field" id="im-itemcount-wrap"><label>Item count</label><input type="number" name="item_count" min="1" step="1"></div>
            <div class="field field-full"><label>Remarks <span class="hint">optional</span></label><textarea name="remarks"></textarea></div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="im-submit">Send out</button>
          </div>
        </form>
      </div>

      <div class="section-title">Currently out <span class="count" id="im-open-count">—</span></div>
      <div id="im-open-list"></div>

      <div class="section-title">Recent entries <span class="count" id="im-count">—</span></div>
      ${SearchBar.render('im-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Sent out</th><th>Reason</th><th>Instrument / Set</th><th>Status</th><th>Returned</th><th>Logged by</th></tr></thead>
        <tbody id="im-tbody"><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;

    let fromTray = 'true';
    const trayRow = document.getElementById('im-tray-row');
    const trayNumWrap = document.getElementById('im-traynum-wrap');
    trayRow.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      trayRow.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = chip.dataset.val === 'true' ? 'radio-chip active-good' : 'radio-chip active-bad';
      fromTray = chip.dataset.val;
      trayNumWrap.classList.toggle('hidden', fromTray !== 'true');
    }));
    this._fromTrayGetter = () => fromTray;
    this._fromTraySetter = (val) => { trayRow.querySelector(`[data-val="${val}"]`).click(); };

    let entryMode = 'individual';
    const modeRow = document.getElementById('im-mode-row');
    const instrumentInput = document.querySelector('textarea[name="instrument_name"]');
    const setTrayInput = document.querySelector('input[name="set_tray_name"]');
    const itemCountInput = document.querySelector('input[name="item_count"]');
    const syncMode = () => {
      const isSet = entryMode === 'set';
      ['im-instrument-wrap', 'im-serial-wrap', 'im-fromtray-wrap'].forEach(id => document.getElementById(id).classList.toggle('hidden', isSet));
      if (!isSet) trayNumWrap.classList.toggle('hidden', fromTray !== 'true');
      else trayNumWrap.classList.add('hidden');
      ['im-settray-wrap', 'im-itemcount-wrap'].forEach(id => document.getElementById(id).classList.toggle('hidden', !isSet));
      instrumentInput.required = !isSet;
      setTrayInput.required = isSet;
      itemCountInput.required = isSet;
    };
    modeRow.querySelectorAll('.radio-chip').forEach(chip => chip.addEventListener('click', () => {
      modeRow.querySelectorAll('.radio-chip').forEach(c => c.className = 'radio-chip');
      chip.className = 'radio-chip active-good';
      entryMode = chip.dataset.val;
      syncMode();
    }));
    this._entryModeGetter = () => entryMode;
    this._entryModeSetter = (val) => { modeRow.querySelector(`[data-val="${val}"]`).click(); };
    syncMode();

    document.getElementById('im-form').addEventListener('submit', (e) => this._submit(e));
    FormDraft.attach(document.getElementById('im-form'), 'im-form', {
      getExtra: () => ({ entryMode: this._entryModeGetter(), fromTray: this._fromTrayGetter() }),
      setExtra: (extra) => {
        if (extra.entryMode) this._entryModeSetter(extra.entryMode);
        if (extra.fromTray) this._fromTraySetter(extra.fromTray);
      }
    });
    this._loadOpen();
    this._loadTable();
  },

  _label(r) {
    return r.entry_mode === 'set'
      ? `${r.set_tray_name} (${r.item_count} item${r.item_count === 1 ? '' : 's'})`
      : (r.instrument_name || '').replace(/\n/g, ', ');
  },

  async _loadOpen() {
    const wrap = document.getElementById('im-open-list');
    try {
      const rows = await DB.listOpenInstrumentMaintenance();
      document.getElementById('im-open-count').textContent = rows.length;
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing currently out.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <div>
            <strong>${UI.escapeHtml(this._label(r))}</strong>
            <span class="hint" style="margin-left:8px;">${UI.escapeHtml(r.action_out)} · sent ${UI.fmtDateTime(r.created_at)} by ${UI.escapeHtml(r.staff_name)}</span>
          </div>
          <button class="btn btn-sm btn-primary" data-return="${r.id}">Mark Returned</button>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-return]').forEach(btn => btn.addEventListener('click', () => this._openReturnModal(rows.find(r => r.id === btn.dataset.return))));
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  _openReturnModal(row) {
    const modal = UI.showModal(`
      <h3>Mark Returned — ${UI.escapeHtml(this._label(row))}</h3>
      <div class="modal-desc">${UI.escapeHtml(row.action_out)} · sent ${UI.fmtDateTime(row.created_at)}</div>
      <div class="field" style="margin:14px 0;"><label>Return notes <span class="hint">optional — condition on return, any issues found</span></label><textarea id="im-return-notes"></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="im-return-cancel">Cancel</button>
        <button class="btn btn-primary" id="im-return-confirm">Mark Returned</button>
      </div>
    `);
    modal.querySelector('#im-return-cancel').addEventListener('click', () => UI.closeModal());
    modal.querySelector('#im-return-confirm').addEventListener('click', async () => {
      const btn = modal.querySelector('#im-return-confirm');
      await UI.withLoading(btn, async () => {
        try {
          const result = await DB.updateInstrumentMaintenance(row.id, {
            status: 'Returned',
            returned_at: new Date().toISOString(),
            returned_by_id: Auth.currentStaff.id,
            returned_by_name: Auth.currentStaff.name,
            return_notes: modal.querySelector('#im-return-notes').value || null
          });
          UI.writeResultToast(result, 'Marked Returned');
          UI.closeModal();
          this._loadOpen();
          this._loadTable();
        } catch (e) { UI.toast('Could not save: ' + e.message, true); }
      });
    });
  },

  async _submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fromTray = this._fromTrayGetter() === 'true';
    const entryMode = this._entryModeGetter();
    const isSet = entryMode === 'set';
    const entry = {
      action_out: fd.get('action_out'),
      status: 'Out',
      entry_mode: entryMode,
      instrument_name: isSet ? null : fd.get('instrument_name'),
      serial_lot_number: isSet ? null : (fd.get('serial_lot_number') || null),
      from_tray_set: isSet ? false : fromTray,
      tray_case_number: (!isSet && fromTray) ? (fd.get('tray_case_number') || null) : null,
      set_tray_name: isSet ? fd.get('set_tray_name') : null,
      item_count: isSet ? (parseInt(fd.get('item_count'), 10) || null) : null,
      remarks: fd.get('remarks') || null,
      staff_id: Auth.currentStaff.id,
      staff_name: Auth.currentStaff.name
    };
    const btn = document.getElementById('im-submit');
    await UI.withLoading(btn, async () => {
      try {
        const result = await DB.addInstrumentMaintenance(entry);
        UI.writeResultToast(result, 'Sent out');
        e.target.reset();
        document.querySelector('#im-tray-row [data-val="true"]').click();
        document.querySelector('#im-mode-row [data-val="individual"]').click();
        FormDraft.clear('im-form');
        this._loadOpen();
        this._loadTable();
      } catch (err) {
        UI.toast('Could not save: ' + err.message, true);
      }
    });
  },

  async _loadTable() {
    const tbody = document.getElementById('im-tbody');
    try {
      const rows = await DB.listInstrumentMaintenance({ from: UI.daysAgoStr(30), limit: 150 });
      this._tableRows = rows;
      SearchBar.wire('im-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'created_at', ['action_out', 'instrument_name', 'set_tray_name', 'staff_name'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Couldn't load entries: ${UI.escapeHtml(e.message)}</td></tr>`;
    }
  },

  _renderTable(rows) {
    const tbody = document.getElementById('im-tbody');
    document.getElementById('im-count').textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No entries match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
        <td>${UI.fmtDate(r.created_at)}</td>
        <td>${UI.escapeHtml(r.action_out)}</td>
        <td><button class="btn btn-sm" data-items-toggle="${r.id}">Items ▸</button></td>
        <td><span class="badge ${r.status === 'Out' ? 'badge-open' : 'badge-resolved'}">${r.status}</span></td>
        <td>${r.returned_at ? UI.fmtDateTime(r.returned_at) + ' · ' + UI.escapeHtml(r.returned_by_name) : '—'}</td>
        <td>${UI.escapeHtml(r.staff_name)}</td>
      </tr>
      <tr id="im-items-row-${r.id}" style="display:none;"><td colspan="7" style="padding:12px 16px;white-space:pre-line;background:var(--surface-sunken);">${UI.escapeHtml(this._label(r)) || '(no items listed)'}</td></tr>
    `).join('');
    tbody.querySelectorAll('[data-items-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trWrap = document.getElementById(`im-items-row-${btn.dataset.itemsToggle}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? 'Items ▾' : 'Items ▸';
      });
    });
  }
};

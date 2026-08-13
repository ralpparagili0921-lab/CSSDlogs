// ============================================================
// INSTRUMENT HANDOVER — 7th logbook, CSSD staff side. Submission
// (intake) now happens exclusively through the public, no-login
// portal on the login screen (js/handover-submit-portal.js) — that's
// how ER/OPD/OR/Ward staff submit items. CSSD staff, once logged in,
// only ever see the release side here: what's waiting, and marking
// it Released once sterilized and packed. Both submission and
// release are timestamped automatically, at each respective step.
// ============================================================

const HandoverView = {
  async render() {
    const el = document.getElementById('view-handover');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Logbook</div>
          <h1>Instrument/Supplies Handover</h1>
          <div class="desc">Departments submit items through the login-screen portal. Your job here is releasing once sterilized and packed.</div>
        </div>
      </div>

      <div class="section-title">Processing — awaiting release <span class="count" id="ho-open-count">—</span></div>
      <div id="ho-open-list"></div>

      <div class="section-title">Released — awaiting department verification <span class="count" id="ho-released-count">—</span></div>
      <div id="ho-released-list"></div>

      <div class="section-title">Recent handovers <span class="count" id="ho-count">—</span></div>
      ${SearchBar.render('ho-search')}
      <div class="table-wrap"><table>
        <thead><tr><th>Ref #</th><th>Department</th><th>Submitted by</th><th>Load contents</th><th>Status</th><th>Received</th><th>Released</th><th>Verified</th></tr></thead>
        <tbody id="ho-tbody"><tr><td colspan="8" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;
    this._loadOpen();
    this._loadReleased();
    this._loadTable();
  },

  _deptLabel(r) {
    return r.department === 'Other' ? (r.department_other || 'Other') : r.department;
  },

  async _loadReleased() {
    const wrap = document.getElementById('ho-released-list');
    try {
      const rows = await DB.listHandovers({ limit: 200 });
      const released = rows.filter(r => r.status === 'Released');
      document.getElementById('ho-released-count').textContent = released.length;
      if (released.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing waiting on department verification.</div>`;
        return;
      }
      wrap.innerHTML = released.map(r => `
        <div class="card card-pad" style="margin-bottom:10px;">
          <strong>${UI.escapeHtml(this._deptLabel(r))}</strong>
          <span class="hint" style="margin-left:8px;">released ${UI.fmtDateTime(r.released_at)} by ${UI.escapeHtml(r.released_by_name)}</span>
          ${r.load_contents ? `<div class="hint" style="margin-top:4px;white-space:pre-line;">${UI.escapeHtml(r.load_contents)}</div>` : ''}
          <div class="hint" style="margin-top:6px;color:var(--amber);">Waiting for ${UI.escapeHtml(this._deptLabel(r))} to verify receipt via the Releasing of Items window.</div>
        </div>
      `).join('');
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  async _loadOpen() {
    const wrap = document.getElementById('ho-open-list');
    try {
      const rows = await DB.listProcessingHandovers();
      document.getElementById('ho-open-count').textContent = rows.length;
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state" style="padding:18px;">Nothing waiting on release.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad pending-highlight" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <div>
            <strong>${UI.escapeHtml(this._deptLabel(r))}</strong>
            <span class="hint" style="margin-left:8px;">submitted by ${UI.escapeHtml(r.submitted_by_name) || 'unknown'} · ${UI.fmtDateTime(r.received_at)}</span>
            ${r.load_contents ? `<div style="margin-top:6px;"><button class="btn btn-sm" data-items-toggle="${r.id}">Items ▸</button><div id="ho-open-items-${r.id}" class="hint" style="display:none;margin-top:6px;white-space:pre-line;">${UI.escapeHtml(r.load_contents)}</div></div>` : ''}
          </div>
          <button class="btn btn-sm btn-primary" data-release="${r.id}">Mark Released</button>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-items-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(`ho-open-items-${btn.dataset.itemsToggle}`);
          const isHidden = target.style.display === 'none';
          target.style.display = isHidden ? 'block' : 'none';
          btn.textContent = isHidden ? 'Items ▾' : 'Items ▸';
        });
      });
      wrap.querySelectorAll('[data-release]').forEach(b => b.addEventListener('click', async () => {
        try {
          const result = await DB.releaseHandover(b.dataset.release, {
            status: 'Released',
            released_by_id: Auth.currentStaff.id,
            released_by_name: Auth.currentStaff.name,
            released_at: new Date().toISOString()
          });
          UI.writeResultToast(result, 'Marked Released');
          this._loadOpen();
          this._loadReleased();
          this._loadTable();
        } catch (e) { UI.toast('Failed: ' + e.message, true); }
      }));
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load — offline or unreachable.</div>`;
    }
  },

  async _loadTable() {
    const tbody = document.getElementById('ho-tbody');
    try {
      const rows = await DB.listHandovers({ limit: 100 });
      this._tableRows = rows;
      SearchBar.wire('ho-search', (criteria) => this._renderTable(SearchBar.filter(rows, criteria, 'received_at', ['submitted_by_name', 'load_contents', 'department', 'department_other'])));
      this._renderTable(rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Couldn't load handovers.</td></tr>`;
    }
  },

  _renderTable(rows) {
    const tbody = document.getElementById('ho-tbody');
    document.getElementById('ho-count').textContent = `${rows.length} shown`;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No handovers match.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr class="${r.status === 'Processing' ? 'pending-highlight' : ''}">
          <td class="mono">${UI.escapeHtml(r.serial_number) || '—'}</td>
          <td><strong>${UI.escapeHtml(this._deptLabel(r))}</strong></td>
          <td>${UI.escapeHtml(r.submitted_by_name) || '—'}</td>
          <td>${r.load_contents ? `<button class="btn btn-sm" data-items-toggle="${r.id}">Items ▸</button>` : '—'}</td>
          <td><span class="badge ${r.status === 'Processing' ? 'badge-open' : r.status === 'Released' ? 'badge-worn' : 'badge-resolved'}">${r.status}</span></td>
          <td>${UI.fmtDateTime(r.received_at)}</td>
          <td>${r.released_at ? UI.fmtDateTime(r.released_at) + ' · ' + UI.escapeHtml(r.released_by_name) : '—'}</td>
          <td>${r.received_verified_at ? UI.fmtDateTime(r.received_verified_at) + ' · ' + UI.escapeHtml(r.received_verified_by_name) + (r.receipt_remarks ? ` — ${UI.escapeHtml(r.receipt_remarks)}` : '') : '—'}</td>
        </tr>
        <tr id="ho-items-row-${r.id}" style="display:none;"><td colspan="8" style="padding:12px 16px;white-space:pre-line;background:var(--surface-sunken);">${UI.escapeHtml(r.load_contents) || ''}</td></tr>
      `).join('');
    tbody.querySelectorAll('[data-items-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trWrap = document.getElementById(`ho-items-row-${btn.dataset.itemsToggle}`);
        const isHidden = trWrap.style.display === 'none';
        trWrap.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? 'Items ▾' : 'Items ▸';
      });
    });
  }
};

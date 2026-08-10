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

      <div class="section-title">Recent handovers <span class="count" id="ho-count">—</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Department</th><th>Submitted by</th><th>Load contents</th><th>Status</th><th>Received</th><th>Released</th></tr></thead>
        <tbody id="ho-tbody"><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
      </table></div>
    `;
    this._loadOpen();
    this._loadTable();
  },

  _deptLabel(r) {
    return r.department === 'Other' ? (r.department_other || 'Other') : r.department;
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
            ${r.load_contents ? `<div class="hint" style="margin-top:4px;white-space:pre-line;">${UI.escapeHtml(r.load_contents)}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-primary" data-release="${r.id}">Mark Released</button>
        </div>
      `).join('');
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
      document.getElementById('ho-count').textContent = rows.length;
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No handovers logged yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr class="${r.status === 'Processing' ? 'pending-highlight' : ''}">
          <td><strong>${UI.escapeHtml(this._deptLabel(r))}</strong></td>
          <td>${UI.escapeHtml(r.submitted_by_name) || '—'}</td>
          <td style="max-width:260px;white-space:pre-line;font-size:12.5px;">${UI.escapeHtml(r.load_contents) || '—'}</td>
          <td><span class="badge ${r.status === 'Processing' ? 'badge-open' : 'badge-resolved'}">${r.status}</span></td>
          <td>${UI.fmtDateTime(r.received_at)}</td>
          <td>${r.released_at ? UI.fmtDateTime(r.released_at) + ' · ' + UI.escapeHtml(r.released_by_name) : '—'}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Couldn't load handovers.</td></tr>`;
    }
  }
};

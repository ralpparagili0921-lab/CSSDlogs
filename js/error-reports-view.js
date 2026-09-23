// ============================================================
// ERROR REPORTS VIEW — superuser-only. Shows every report a staff
// member has explicitly submitted via the "Report to Superuser Ralp"
// popup that appears when something breaks. Lets a superuser triage
// (New -> Reviewed -> Resolved) with optional notes, without needing
// to fix everything the moment it comes in.
// ============================================================

const ErrorReportsView = {
  async render() {
    const el = document.getElementById('view-error-reports');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Admin</div>
          <h1>Error Reports</h1>
          <div class="desc">Things staff have flagged as broken, via the "Report to Superuser Ralp" popup.</div>
        </div>
      </div>
      <div id="err-reports-list">Loading…</div>
    `;
    this._load();
  },

  async _load() {
    const wrap = document.getElementById('err-reports-list');
    try {
      const rows = await DB.listErrorReports();
      if (rows.length === 0) {
        wrap.innerHTML = `<div class="card card-pad empty-state">No reports — nothing's been flagged.</div>`;
        return;
      }
      wrap.innerHTML = rows.map(r => `
        <div class="card card-pad ${r.status === 'New' ? 'pending-highlight' : ''}" style="margin-bottom:10px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">
            <div style="flex:1;min-width:240px;">
              <strong>${UI.escapeHtml(r.error_message)}</strong>
              <div class="hint" style="margin-top:4px;">
                ${UI.fmtDateTime(r.created_at)} · ${UI.escapeHtml(r.staff_name) || 'unknown staff'} · on ${UI.escapeHtml((r.view_context || 'unknown').replace('view-', ''))}
              </div>
              ${r.error_stack ? `<button class="btn btn-sm" data-stack-toggle="${r.id}" style="margin-top:8px;">Stack trace ▸</button><div id="err-stack-${r.id}" class="hint mono" style="display:none;margin-top:6px;white-space:pre-wrap;font-size:11.5px;">${UI.escapeHtml(r.error_stack)}</div>` : ''}
            </div>
            <span class="badge ${r.status === 'New' ? 'badge-open' : r.status === 'Reviewed' ? 'badge-worn' : 'badge-resolved'}">${r.status}</span>
          </div>
          <div class="field" style="margin-top:10px;margin-bottom:8px;">
            <label class="hint">Notes</label>
            <textarea id="err-notes-${r.id}" rows="2" placeholder="optional">${UI.escapeHtml(r.admin_notes) || ''}</textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${r.status !== 'Reviewed' ? `<button class="btn btn-sm" data-status="${r.id}|Reviewed">Mark Reviewed</button>` : ''}
            ${r.status !== 'Resolved' ? `<button class="btn btn-sm btn-primary" data-status="${r.id}|Resolved">Mark Resolved</button>` : ''}
            ${r.status !== 'New' ? `<button class="btn btn-sm" data-status="${r.id}|New">Reopen</button>` : ''}
          </div>
        </div>
      `).join('');

      wrap.querySelectorAll('[data-stack-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(`err-stack-${btn.dataset.stackToggle}`);
          const isHidden = target.style.display === 'none';
          target.style.display = isHidden ? 'block' : 'none';
          btn.textContent = isHidden ? 'Stack trace ▾' : 'Stack trace ▸';
        });
      });
      wrap.querySelectorAll('[data-status]').forEach(btn => {
        const [id, status] = btn.dataset.status.split('|');
        btn.addEventListener('click', async () => {
          try {
            const admin_notes = document.getElementById(`err-notes-${id}`).value || null;
            const result = await DB.updateErrorReport(id, { status, admin_notes });
            UI.writeResultToast(result, `Marked ${status}`);
            this._load();
            App._refreshNavBadges();
          } catch (e) { UI.toast('Could not update: ' + e.message, true); }
        });
      });
    } catch (e) {
      wrap.innerHTML = `<div class="card card-pad empty-state">Couldn't load reports: ${UI.escapeHtml(e.message)}</div>`;
    }
  }
};

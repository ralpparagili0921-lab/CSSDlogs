// ============================================================
// PUBLIC COMPLIANCE DASHBOARD — backlog item #7. Read-only, no PIN
// required. A top-level state alongside login/main (see index.html
// #view-public-dashboard and PublicDashboard.show()/hide()) — it
// never touches Auth.currentStaff, so it works with nobody logged in.
// Reuses DashboardStats (js/dashboard-stats.js), the same calculation
// the authenticated Dashboard uses, parameterized by date range and
// staff vs. whole department.
// ============================================================

const PublicDashboard = {
  show() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-main').classList.add('hidden');
    document.getElementById('view-public-dashboard').classList.remove('hidden');
    this._render();
  },
  hide() {
    document.getElementById('view-public-dashboard').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    Auth.renderLogin();
  },

  async _render() {
    const el = document.getElementById('view-public-dashboard');
    el.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;padding:32px 20px 60px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:22px;">
          <div>
            <div class="eyebrow">Public · Read-only</div>
            <h1 style="font-size:22px;">CSSD Compliance Dashboard</h1>
            <div class="desc">Tebow CURE Children's Hospital — no login required.</div>
          </div>
          <button class="btn" id="pd-back">← Back to login</button>
        </div>
        <div class="report-controls" style="margin-bottom:18px;">
          <div class="field"><label>From</label><input type="date" id="pd-from" value="${UI.daysAgoStr(30)}"></div>
          <div class="field"><label>To</label><input type="date" id="pd-to" value="${UI.todayStr()}"></div>
          <div class="field"><label>Staff</label><select id="pd-staff"><option value="">Whole department</option></select></div>
          <button class="btn btn-primary btn-sm" id="pd-apply">Apply</button>
        </div>
        <div class="kpi-grid" id="pd-grid"><div class="card kpi-card"><div class="label">Loading…</div></div></div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:24px;">This view has no login and shows aggregate compliance figures only — no patient data is involved.</div>
      </div>
    `;
    document.getElementById('pd-back').addEventListener('click', () => this.hide());
    document.getElementById('pd-apply').addEventListener('click', () => this._load());

    try {
      const staff = await DB.listActiveStaff();
      const sel = document.getElementById('pd-staff');
      staff.forEach(s => sel.appendChild(new Option(s.name, s.id)));
    } catch (e) { /* staff filter just stays department-only if this fails */ }

    this._load();
  },

  async _load() {
    const grid = document.getElementById('pd-grid');
    const from = document.getElementById('pd-from').value || UI.daysAgoStr(30);
    const to = document.getElementById('pd-to').value || UI.todayStr();
    const staffId = document.getElementById('pd-staff').value || null;
    grid.innerHTML = `<div class="card kpi-card"><div class="label">Loading…</div></div>`;
    try {
      const stats = await DashboardStats.compute({ from, to, staffId });
      grid.innerHTML = DashboardStats.cardsHtml(stats);
    } catch (e) {
      grid.innerHTML = `<div class="card card-pad empty-state">Couldn't load: ${UI.escapeHtml(e.message)}</div>`;
    }
  }
};

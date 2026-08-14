// ============================================================
// DASHBOARD — quick-glance status. Visible to admin and superuser
// roles only. Uses the shared DashboardStats module (js/dashboard-stats.js)
// so the numbers here and on the public Compliance Dashboard never drift
// apart — same calculation, just parameterized differently.
// ============================================================

const DashboardView = {
  async render() {
    const el = document.getElementById('view-dashboard');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Overview</div>
          <h1>CSSD Dashboard</h1>
          <div class="desc">Welcome back, ${UI.escapeHtml(Auth.currentStaff.name)}.</div>
        </div>
      </div>
      <div class="report-controls" style="margin-bottom:18px;">
        <div class="field"><label>From</label><input type="date" id="dash-from" value="${UI.daysAgoStr(30)}"></div>
        <div class="field"><label>To</label><input type="date" id="dash-to" value="${UI.todayStr()}"></div>
        <button class="btn btn-sm" id="dash-apply">Apply</button>
      </div>
      <div class="kpi-grid" id="kpi-grid">
        <div class="card kpi-card"><div class="label">Loading…</div></div>
      </div>
      <div class="section-title">Jump to a logbook</div>
      <div class="kpi-grid">
        <button class="card card-pad" style="text-align:left;cursor:pointer;" data-goto="ro"><strong>RO Water Quality →</strong></button>
        <button class="card card-pad" style="text-align:left;cursor:pointer;" data-goto="equipment"><strong>Equipment Downtime →</strong></button>
        <button class="card card-pad" style="text-align:left;cursor:pointer;" data-goto="brush"><strong>Cleaning Brush →</strong></button>
      </div>
    `;
    el.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => App.navigate(b.dataset.goto)));
    document.getElementById('dash-apply').addEventListener('click', () => this._loadKpis());
    this._loadKpis();
  },

  async _loadKpis() {
    const grid = document.getElementById('kpi-grid');
    const from = document.getElementById('dash-from').value || UI.daysAgoStr(30);
    const to = document.getElementById('dash-to').value || UI.todayStr();
    grid.innerHTML = `<div class="card kpi-card"><div class="label">Loading…</div></div>`;
    try {
      const stats = await DashboardStats.compute({ from, to });
      grid.innerHTML = DashboardStats.cardsHtml(stats);
    } catch (e) {
      grid.innerHTML = `<div class="card card-pad empty-state">Couldn't load dashboard data: ${UI.escapeHtml(e.message)}</div>`;
    }
  }
};

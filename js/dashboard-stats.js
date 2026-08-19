// ============================================================
// DASHBOARD STATS — shared, parameterized KPI calculator used by
// both the authenticated Dashboard (js/dashboard.js) and the
// no-login public Compliance Dashboard (js/public-dashboard.js),
// per backlog item #7. Filters: date range, and optionally a single
// staff member (vs. the whole department). This file has no
// dependency on Auth.currentStaff — safe to call with nobody logged in.
// ============================================================

const DashboardStats = {
  _rateColor(rate) {
    if (rate === null) return 'inherit';
    return rate >= 90 ? 'var(--green)' : rate >= 75 ? 'var(--amber)' : 'var(--red)';
  },

  async compute({ from, to, staffId } = {}) {
    const days = Math.max(1, UI.daysBetween(from, to) + 1);
    const [roAll, machines, downtimeAll, brushes, brushLogsAll] = await Promise.all([
      DB.listRoLogs({ from, to }),
      DB.listMachines(),
      DB.listDowntimeLogs({ from, to }),
      DB.listActiveBrushes(),
      DB.listBrushLogs({ from, to })
    ]);

    const ro = staffId ? roAll.filter(r => r.staff_id === staffId) : roAll;
    const downtime = staffId ? downtimeAll.filter(r => r.staff_id === staffId) : downtimeAll;
    const brushLogs = staffId ? brushLogsAll.filter(r => r.staff_id === staffId) : brushLogsAll;

    const openCount = downtime.filter(r => r.status === 'Open').length;

    // RO now covers whichever parameters were actually active/tested — a
    // single overall pass rate across every reading logged, rather than
    // fixed conductivity/TDS/microbial cards that assumed a fixed parameter set.
    const roReadings = ro.flatMap(r => r.readings || []);
    const roPass = roReadings.filter(rd => rd.pass === true).length;
    const roRate = roReadings.length ? Math.round((roPass / roReadings.length) * 100) : null;

    // Uptime only makes sense department-wide (machines aren't owned by one
    // person) — when filtered to a single staff member, report their logged
    // incident count/duration instead of a fleet uptime percentage.
    let uptimeRate = null, downMin = 0;
    downMin = downtime.reduce((sum, r) => sum + (UI.minutesBetween(r.time_broken, r.time_up || new Date().toISOString()) || 0), 0);
    if (!staffId) {
      const totalScheduledMin = machines.reduce((sum, m) => sum + (m.scheduled_hours_per_day || 24) * 60 * days, 0);
      uptimeRate = totalScheduledMin ? Math.max(0, Math.round(((totalScheduledMin - downMin) / totalScheduledMin) * 100)) : null;
    }

    const brushRate = (!staffId && brushes.length) ? Math.round((new Set(brushLogs.map(l => l.brush_id)).size / brushes.length) * 100) : null;

    return {
      roRate, roReadingCount: roReadings.length, roVisitCount: ro.length,
      uptimeRate, downtimeCount: downtime.length, downMin, openCount,
      brushRate, brushLogCount: brushLogs.length, days
    };
  },

  cardsHtml(s) {
    return `
      <div class="card kpi-card"><div class="label">RO Water Quality</div><div class="value" style="color:${this._rateColor(s.roRate)}">${s.roRate === null ? '—' : s.roRate + '%'}</div><div class="sub">${s.roReadingCount} readings across ${s.roVisitCount} visits</div></div>
      <div class="card kpi-card"><div class="label">Equipment Uptime</div><div class="value" style="color:${this._rateColor(s.uptimeRate)}">${s.uptimeRate === null ? '—' : s.uptimeRate + '%'}</div><div class="sub">${s.downtimeCount} incidents · ${UI.durationHM(s.downMin)} down</div></div>
      <div class="card kpi-card"><div class="label">Brush Weekly Compliance</div><div class="value" style="color:${this._rateColor(s.brushRate)}">${s.brushRate === null ? '—' : s.brushRate + '%'}</div><div class="sub">logged this week / active brushes</div></div>
      <div class="card kpi-card"><div class="label">Open Incidents</div><div class="value" style="color:${s.openCount === 0 ? 'var(--green)' : 'var(--red)'}">${s.openCount}</div><div class="sub">${s.openCount === 0 ? 'All accounted for' : 'Needs attention'}</div></div>
    `;
  }
};

// ============================================================
// MISSED ENTRIES — shared shell for each logbook's "Missed Entries"
// section (section title + date-range preset dropdown + card),
// matching the established pattern from Housekeeping's original
// build. Each logbook still owns its own due-day computation and
// rendering — this only standardizes the surrounding UI.
// ============================================================

const MissedEntriesView = {
  // Core classification, shared by every logbook. For each expected
  // date: if a log exists, compares its created_at (the actual
  // submission moment, not the user-editable log_date/log_time) in
  // LOCAL time against the deadline — after the deadline but same day
  // is "Late." If no log exists at all: a genuinely past day is
  // "Missed" outright; TODAY only becomes "Missed" once it's past
  // 11:30pm — before that, it's still possibly-late-but-not-yet, so
  // it's deliberately not flagged at all (this is a historical report,
  // not a live overdue-alarm — that's the separate alarm system's job).
  //
  // dueDates: array of 'YYYY-MM-DD' strings that were expected.
  // logsByDate: Map of dateStr -> array of rows (each needs created_at).
  // deadlineHHMM: 'HH:MM', that logbook's expected time each day.
  classify(dueDates, logsByDate, deadlineHHMM, lateTag = 'Late', missedTag = 'Missed') {
    const results = [];
    const today = UI.todayStr();
    const now = TrueTime.now();
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    dueDates.forEach(dateStr => {
      const logsForDate = logsByDate.get(dateStr) || [];
      if (logsForDate.length > 0) {
        // Earliest submission that day counts, if there's ever more than one.
        const earliest = logsForDate.reduce((min, r) => (r.created_at < min ? r.created_at : min), logsForDate[0].created_at);
        const d = new Date(earliest); // local-time extraction, not raw UTC string slicing
        const loggedHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (loggedHHMM > deadlineHHMM) results.push({ date: dateStr, tag: lateTag, detail: `logged ${UI.fmtTime(earliest)}`, row: logsForDate.find(r => r.created_at === earliest) });
        // else: on time, not flagged at all
      } else if (dateStr < today) {
        results.push({ date: dateStr, tag: missedTag });
      } else if (dateStr === today && nowHHMM >= '23:30') {
        results.push({ date: dateStr, tag: missedTag });
      }
      // dateStr === today and still before 11:30pm: not flagged yet, still possibly-late-but-pending
    });
    return results;
  },

  // Wires the dropdown and does the initial load — callers already
  // have their own HTML for the section title/dropdown/card (via
  // sectionHtml() below); this just hooks up the behavior.
  wire(rangeSelectId, onRangeChange) {
    document.getElementById(rangeSelectId).addEventListener('change', (e) => onRangeChange(e.target.value));
    onRangeChange('30'); // initial load, default 30 days
  },

  // Shared lookup — every caller has the same shape of data (from
  // DB.listAssignments()) and needs the same two things: the primary
  // name for inline display, and the full rank breakdown for the
  // Details popup. rankLabels maps priority_rank (1/2/3) to a display
  // label — defaults match every logbook's existing convention.
  staffFor(assignments, logbook, rankLabels = { 1: 'Primary', 2: 'Secondary', 3: 'Tertiary' }) {
    const rows = (assignments || []).filter(a => a.logbook === logbook).sort((a, b) => a.priority_rank - b.priority_rank);
    const primary = rows.find(a => a.priority_rank === 1);
    return {
      assignedStaff: primary && primary.staff ? primary.staff.name : null,
      staffDetails: rows.map(a => ({ rank: rankLabels[a.priority_rank] || `Rank ${a.priority_rank}`, name: a.staff ? a.staff.name : null }))
    };
  },

  // Generic incident-notice print for a Missed entry — there's no
  // underlying record to print (nothing was ever logged), so this is
  // a simple, honest notice rather than trying to reuse a logbook's
  // real print template with fabricated data.
  printMissedNotice(logbookTitle, dateStr, assignedStaff) {
    PrintReport.generate({
      title: `${logbookTitle.toUpperCase()} — MISSED ENTRY NOTICE`,
      refNumber: UI.fmtDate(dateStr),
      sections: [{ heading: 'Details', rows: [
        ['Logbook', logbookTitle],
        ['Date', UI.fmtDate(dateStr)],
        ['Status', 'No entry was logged for this date'],
        ['Assigned staff', assignedStaff || '— not assigned —']
      ] }]
    });
  },


  // Each entry: { date, tag, detail, assignedStaff, staffDetails, onPrint }
  //   - tag distinguishes "Missed" vs "Late" (or any other label) within
  //     the same unified list, e.g. QA Testing combining BI+Dummy.
  //   - assignedStaff: display string for the primary-responsible person
  //     (e.g. "Joshua Mabilang"), or null if nobody's assigned.
  //   - staffDetails: array of {rank, name} for the Details button's
  //     popup (Primary/Secondary/Tertiary) — omit to hide the button.
  //   - onPrint: callback, no args — the caller builds and triggers
  //     whatever's appropriate (a real PrintReport.generate() call for
  //     a Late entry with real data, or a simple incident-notice print
  //     for a Missed entry with none) — omit to hide the button.
  render(wrapId, countEl, entries, emptyMessage) {
    const wrap = document.getElementById(wrapId);
    document.getElementById(countEl).textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    if (entries.length === 0) {
      wrap.innerHTML = `<div class="empty-state">${emptyMessage || 'No missed entries in this range.'}</div>`;
      return;
    }
    const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
    wrap.innerHTML = sorted.map((e, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;">
          <span class="badge ${e.tag === 'Late' ? 'badge-worn' : 'badge-fail'}">${UI.escapeHtml(e.tag || 'Missed')}</span>
          <span>${UI.fmtDate(e.date)}</span>
          ${e.detail ? `<span class="hint">${UI.escapeHtml(e.detail)}</span>` : ''}
          ${e.assignedStaff ? `<span class="hint">Assigned: ${UI.escapeHtml(e.assignedStaff)}</span>` : ''}
          <span style="margin-left:auto;display:flex;gap:6px;">
            ${e.staffDetails ? `<button class="btn btn-sm" data-me-details="${i}">Details</button>` : ''}
            ${e.onPrint ? `<button class="btn btn-sm" data-me-print="${i}">Print</button>` : ''}
          </span>
        </div>
      `).join('');
    wrap.querySelectorAll('[data-me-details]').forEach(btn => {
      btn.addEventListener('click', () => this._showStaffDetails(sorted[parseInt(btn.dataset.meDetails, 10)]));
    });
    wrap.querySelectorAll('[data-me-print]').forEach(btn => {
      btn.addEventListener('click', () => sorted[parseInt(btn.dataset.mePrint, 10)].onPrint());
    });
  },

  // Simple popup showing who's assigned (Primary/Secondary/Tertiary)
  // for the entry's logbook — reuses UI's existing modal helper so it
  // matches every other modal in the app rather than a one-off design.
  _showStaffDetails(entry) {
    const rows = (entry.staffDetails || []).map(s => `<div style="padding:4px 0;">${UI.escapeHtml(s.rank)}: ${UI.escapeHtml(s.name || '— not assigned —')}</div>`).join('');
    UI.showModal(`
      <h3>Assigned Staff</h3>
      <div class="hint" style="margin-bottom:8px;">${UI.fmtDate(entry.date)}${entry.detail ? ' — ' + UI.escapeHtml(entry.detail) : ''}</div>
      ${rows || '<div class="empty-state">No one currently assigned.</div>'}
      <div style="margin-top:14px;text-align:right;"><button class="btn btn-sm" id="me-details-close">Close</button></div>
    `);
    document.getElementById('me-details-close').addEventListener('click', () => UI.closeModal());
  },

  errorState(wrapId, message) {
    document.getElementById(wrapId).innerHTML = `<div class="empty-state">Couldn't load missed entries: ${UI.escapeHtml(message)}</div>`;
  },

  // Standard markup for the section — title, count, range dropdown,
  // and the card itself. Every logbook uses this exact structure so
  // the feature looks and behaves identically everywhere.
  sectionHtml(idPrefix, title) {
    return `
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;">
        <span>${UI.escapeHtml(title)} <span class="count" id="${idPrefix}-missed-count">—</span></span>
        <select id="${idPrefix}-missed-range" style="max-width:160px;">
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div class="card card-pad" id="${idPrefix}-missed-wrap"><div class="empty-state">Loading…</div></div>
    `;
  }
};

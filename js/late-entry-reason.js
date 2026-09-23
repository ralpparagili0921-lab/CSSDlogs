// ============================================================
// LATE ENTRY REASON — shared across the 5 time-bounded logbooks (QA
// Testing, RO Water Quality, Cleaning Brush, Temp/Humidity,
// Housekeeping). Whenever an entry is being submitted after that
// day's deadline, a reason explaining the delay is required — at
// least MIN_WORDS words — before the submission is allowed through.
//
// A single, shared module rather than duplicated per-file logic, so
// the word-count rule and the late/on-time boundary stay identical
// and don't quietly drift apart across five different files over
// time.
//
// isLate() reuses the exact same HH:MM string-comparison convention
// already established in MissedEntriesView.classify() — same
// deadline values, same local-time-not-UTC extraction from
// TrueTime.now(), so "late" always means the same thing whether it's
// being judged retroactively (Missed/Late Entries) or right now, at
// the moment of submission (this module).
// ============================================================

const LateEntryReason = {
  MIN_WORDS: 15,

  // deadline is either an "HH:MM" string (compared against today, the
  // shape every logbook but Brush uses) or a function returning a
  // boolean directly — for Brush, where "late" depends on day-of-week
  // too (past Wednesday 2:30pm for that ISO week), not just time-of-day.
  isLate(deadline) {
    if (typeof deadline === 'function') return deadline();
    const now = TrueTime.now();
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return nowHHMM > deadline;
  },

  wordCount(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
  },

  // fieldId must be unique within the page. Hidden by default — shown
  // by wire() at render time if already late, and again by
  // validateOnSubmit() if the form was opened before the deadline but
  // submitted after it.
  fieldHtml(fieldId) {
    return `
      <div class="field field-full" id="${fieldId}-wrap" style="display:none;">
        <label>Reason for Late Entry <span class="hint">(minimum ${this.MIN_WORDS} words, required)</span></label>
        <textarea id="${fieldId}" rows="3" placeholder="Explain why this entry is being logged after the deadline..."></textarea>
        <div class="hint" id="${fieldId}-count">0 words</div>
      </div>
    `;
  },

  // Call once after the form (containing fieldHtml's output) is in
  // the DOM. Shows the field immediately if already late, and wires
  // live word-count feedback either way.
  wire(fieldId, deadline) {
    const wrap = document.getElementById(`${fieldId}-wrap`);
    const textarea = document.getElementById(fieldId);
    const countEl = document.getElementById(`${fieldId}-count`);
    if (!wrap || !textarea || !countEl) return;
    if (this.isLate(deadline)) wrap.style.display = '';
    const updateCount = () => {
      const n = this.wordCount(textarea.value);
      countEl.textContent = n < this.MIN_WORDS ? `${n} word${n === 1 ? '' : 's'} — ${this.MIN_WORDS - n} more needed` : `${n} words`;
      countEl.style.color = n < this.MIN_WORDS ? 'var(--red)' : 'var(--text-muted)';
    };
    textarea.addEventListener('input', updateCount);
    updateCount();
  },

  // The authoritative check — call right before the actual DB submit
  // call, not just at render time, since the deadline may have
  // passed while the form sat open. Returns null when fine to
  // proceed (not late, or late with a valid reason already typed) or
  // a user-facing error string when submission should be blocked.
  // Also reveals the field if it wasn't visible yet.
  validateOnSubmit(fieldId, deadline) {
    if (!this.isLate(deadline)) return null;
    const wrap = document.getElementById(`${fieldId}-wrap`);
    const textarea = document.getElementById(fieldId);
    if (wrap) wrap.style.display = '';
    const n = this.wordCount(textarea ? textarea.value : '');
    const deadlinePhrase = typeof deadline === 'function' ? 'this week\'s deadline' : `the ${deadline} deadline`;
    if (n < this.MIN_WORDS) return `This entry is past ${deadlinePhrase} — please explain why it's being logged late (at least ${this.MIN_WORDS} words, currently ${n}).`;
    return null;
  },

  // The value to actually save — only when the entry really is late,
  // so an on-time entry's late_reason column stays null even if the
  // field happened to have leftover text in it from an earlier,
  // aborted submit attempt.
  reasonForSave(fieldId, deadline) {
    if (!this.isLate(deadline)) return null;
    const textarea = document.getElementById(fieldId);
    return textarea ? textarea.value.trim() : null;
  }
};

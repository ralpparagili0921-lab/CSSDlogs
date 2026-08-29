// ============================================================
// FORM DRAFT — silent auto-save for in-progress form entries, so a
// refresh, an accidental navigation, or a browser crash doesn't lose
// what someone was in the middle of typing. No save button — it just
// happens on every input/change, debounced. Scoped per logged-in
// staff member (via Auth.currentStaff.id) so nobody ever sees or
// restores another person's in-progress draft, and cleared the
// moment the real submit succeeds so it doesn't linger and get
// confusingly restored later.
//
// Handles standard form fields (input/textarea/select, by name or id)
// automatically. For custom UI state that isn't a native form element
// (e.g. a radio-chip toggle, a reserved draft row's id), pass
// getExtra/setExtra to fold that into the same saved/restored object.
// ============================================================

const FormDraft = {
  _timers: {},

  // Drafts expire after this long — long enough to cover "got pulled
  // away mid-shift, came back later that day or the next morning",
  // short enough that a forgotten draft doesn't linger indefinitely
  // (and, for Cycle Log specifically, doesn't leave a reserved cycle
  // number orphaned for an unreasonable stretch).
  MAX_AGE_MS: 24 * 60 * 60 * 1000,

  attach(formEl, draftKey, { getExtra, setExtra } = {}) {
    const key = this._storageKey(draftKey);
    const save = () => {
      clearTimeout(this._timers[key]);
      this._timers[key] = setTimeout(() => {
        const data = this._serialize(formEl);
        if (getExtra) data._extra = getExtra();
        data._savedAt = Date.now();
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* storage full/unavailable — draft save is best-effort */ }
      }, 400);
    };
    formEl.addEventListener('input', save);
    formEl.addEventListener('change', save);
    return this.restore(formEl, draftKey, setExtra);
  },

  // Returns true if a draft was actually found and restored, so the
  // caller can show something like "restored your unsaved entry" if
  // it wants to (not required — restoring silently is fine too).
  restore(formEl, draftKey, setExtra) {
    const key = this._storageKey(draftKey);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data._savedAt && (Date.now() - data._savedAt) > this.MAX_AGE_MS) {
        localStorage.removeItem(key); // too old — treat as abandoned, not worth restoring
        return false;
      }
      this._deserialize(formEl, data);
      if (setExtra && '_extra' in data) setExtra(data._extra);
      return true;
    } catch (e) { return false; }
  },

  clear(draftKey) {
    try { localStorage.removeItem(this._storageKey(draftKey)); } catch (e) {}
  },

  _storageKey(draftKey) {
    const staffId = (window.Auth && Auth.currentStaff && Auth.currentStaff.id) || 'anon';
    return `cssd_draft_${draftKey}_${staffId}`;
  },

  _serialize(formEl) {
    const data = {};
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      const key = el.name || el.id;
      if (!key) return;
      if (el.type === 'checkbox' || el.type === 'radio') data[key] = el.checked;
      else if (el.type !== 'hidden') data[key] = el.value; // hidden fields are usually derived/captured state (like the timestamp-capture buttons), not free typing worth restoring
    });
    return data;
  },

  _deserialize(formEl, data) {
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      const key = el.name || el.id;
      if (!key || !(key in data)) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = data[key];
      else if (el.type !== 'hidden') el.value = data[key];
    });
  }
};

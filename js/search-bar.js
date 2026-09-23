// ============================================================
// SEARCH BAR — shared component for "Recent Entries" tables across
// every logbook. Renders a text search (matches serial number + a
// configurable set of text fields) plus a date-range filter, and
// filters an already-loaded rows array client-side — this app's data
// volumes don't call for server-side search, and keeping filtering
// client-side means one shared module works for all 8 differently-
// shaped tables instead of 8 bespoke queries.
// ============================================================

const SearchBar = {
  render(id) {
    return `
      <div class="card card-pad" style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="flex:2;min-width:180px;margin-bottom:0;">
          <label>Search</label>
          <input type="text" id="${id}-text" placeholder="Reference #, machine, name…">
        </div>
        <div class="field" style="margin-bottom:0;"><label>From</label><input type="date" id="${id}-from"></div>
        <div class="field" style="margin-bottom:0;"><label>To</label><input type="date" id="${id}-to"></div>
        <button class="btn btn-sm" id="${id}-clear">Clear</button>
      </div>
    `;
  },

  // Safe to call repeatedly (every _loadTable() re-wires against fresh
  // rows) — clones each input to strip any previously-attached listener
  // first, so stale closures over old row arrays never accumulate.
  wire(id, onFilter) {
    ['text', 'from', 'to'].forEach(suffix => {
      const el = document.getElementById(`${id}-${suffix}`);
      if (el) el.replaceWith(el.cloneNode(true));
    });
    const clearOld = document.getElementById(`${id}-clear`);
    if (clearOld) clearOld.replaceWith(clearOld.cloneNode(true));

    const textEl = document.getElementById(`${id}-text`);
    const fromEl = document.getElementById(`${id}-from`);
    const toEl = document.getElementById(`${id}-to`);
    const clearBtn = document.getElementById(`${id}-clear`);
    const fire = () => onFilter({ text: textEl.value.trim().toLowerCase(), from: fromEl.value || null, to: toEl.value || null });
    textEl.addEventListener('input', fire);
    fromEl.addEventListener('change', fire);
    toEl.addEventListener('change', fire);
    clearBtn.addEventListener('click', () => { textEl.value = ''; fromEl.value = ''; toEl.value = ''; fire(); });
  },

  // rows: the already-loaded array. dateField: which column holds the
  // row's date (a 'YYYY-MM-DD' string or an ISO timestamp — both compare
  // correctly against date input values). textFields: array of column
  // names to substring-match against, in addition to serial_number.
  filter(rows, criteria, dateField, textFields) {
    return rows.filter(r => {
      if (criteria.from && (r[dateField] || '').slice(0, 10) < criteria.from) return false;
      if (criteria.to && (r[dateField] || '').slice(0, 10) > criteria.to) return false;
      if (criteria.text) {
        const haystack = [r.serial_number, ...textFields.map(f => r[f])].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(criteria.text)) return false;
      }
      return true;
    });
  }
};

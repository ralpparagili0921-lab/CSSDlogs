// ============================================================
// HISTORY VIEW — shared shell for each logbook's fullscreen "View All
// History" page. Same back button, title, date-range filter, and
// search bar container everywhere; each logbook still owns its own
// fetch and row-rendering (so its existing table logic, print
// buttons, badges, etc. don't need touching) — this only standardizes
// the surrounding page, not the table itself.
//
// Renders into a real view-* container, navigated to the normal way
// via App.navigate() — meaning the sidebar (desktop) and bottom/off-
// canvas nav (mobile) stay exactly as they are, since those are part
// of the shared app shell, not something a view replaces.
// ============================================================

const HistoryView = {
  // opts: { container, title, backView, onFilterChange }
  // onFilterChange(filters) fires on search input and whenever a date
  // preset/custom range is picked — filters: { search, from, to }
  renderShell(opts) {
    const { container, title, backView, onFilterChange } = opts;
    container.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-sm" id="hv-back" style="margin-bottom:10px;">← Back</button>
          <h1>${UI.escapeHtml(title)}</h1>
          <div class="desc" id="hv-count"></div>
        </div>
      </div>
      <div class="card card-pad" style="margin-bottom:14px;">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          <input type="text" id="hv-search" placeholder="Search…" style="flex:1;min-width:200px;">
          <select id="hv-preset">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
          <div id="hv-custom-range" class="hidden" style="display:flex;gap:8px;align-items:center;">
            <input type="date" id="hv-from">
            <span class="hint">to</span>
            <input type="date" id="hv-to">
          </div>
        </div>
      </div>
      <div id="hv-table-wrap"></div>
    `;
    document.getElementById('hv-back').addEventListener('click', () => App.navigate(backView));

    const presetSelect = document.getElementById('hv-preset');
    const customRange = document.getElementById('hv-custom-range');
    const fromInput = document.getElementById('hv-from');
    const toInput = document.getElementById('hv-to');
    const searchInput = document.getElementById('hv-search');

    const currentFilters = () => {
      const search = searchInput.value.trim();
      const preset = presetSelect.value;
      if (preset === 'all') return { search, from: null, to: null };
      if (preset === 'custom') return { search, from: fromInput.value || null, to: toInput.value || null };
      const days = parseInt(preset, 10);
      const to = TrueTime.now();
      const from = new Date(to.getTime() - days * 86400000);
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { search, from: fmt(from), to: fmt(to) };
    };

    presetSelect.addEventListener('change', () => {
      customRange.classList.toggle('hidden', presetSelect.value !== 'custom');
      onFilterChange(currentFilters());
    });
    fromInput.addEventListener('change', () => onFilterChange(currentFilters()));
    toInput.addEventListener('change', () => onFilterChange(currentFilters()));
    searchInput.addEventListener('input', () => onFilterChange(currentFilters()));

    // Fire once with the default (last 30 days) — deferred to the next
    // tick, NOT called synchronously here. Every caller destructures
    // this function's own return value (tableWrap, setCount) and then
    // uses setCount INSIDE this same onFilterChange callback — calling
    // it synchronously, before this function has even returned, meant
    // that destructuring assignment hadn't completed yet the very
    // first time it was needed, throwing "Cannot access 'setCount'
    // before initialization" on every single History page's first
    // load, every time, since this was first built.
    setTimeout(() => onFilterChange(currentFilters()), 0);
    return { tableWrap: document.getElementById('hv-table-wrap'), setCount: (n, label) => { document.getElementById('hv-count').textContent = `${n} ${label || 'entries'}`; } };
  }
};

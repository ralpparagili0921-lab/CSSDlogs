// ============================================================
// APP — bootstraps everything: shows login, then role-gated
// main shell, and handles sidebar navigation.
// ============================================================

// Shared between the mobile bento grid and quick-access strip. Icons match
// the desktop sidebar exactly, for visual consistency between the two.
const MOBILE_LOGBOOK_ITEMS = [
  { view: 'equipment', label: 'Equipment', badge: 'nav-badge-equipment', badgeText: 'Open', cat: 'autoclave', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>' },
  { view: 'qa', label: 'QA Testing', badge: 'nav-badge-qa', badgeText: 'Due', cat: 'autoclave', icon: '<path d="M9 11l3 3 8-8"/><path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/>' },
  { view: 'cycles', label: 'Cycle Log', badge: 'nav-badge-cycles', badgeText: 'Active', cat: 'sterilization', icon: '<path d="M4 12a8 8 0 1 1 3 6.3"/><path d="M4 20v-5h5"/>' },
  { view: 'instruments', label: 'Instruments', cat: 'sterilization', icon: '<path d="M14.5 3.5a2.1 2.1 0 0 1 3 3L8 16l-4 1 1-4Z"/>' },
  { view: 'ro', label: 'RO Water', cat: 'water', icon: '<path d="M12 2c3 4 6 7.5 6 11.5A6 6 0 1 1 6 13.5C6 9.5 9 6 12 2Z"/>' },
  { view: 'brush', label: 'Brush', cat: 'water', icon: '<path d="M4 20l7-7"/><path d="M13 13l6.5-6.5a2.1 2.1 0 0 0-3-3L10 10"/><path d="M4 20l3-1 1-3"/>' },
  { view: 'temp-humidity', label: 'Temp/Humidity', cat: 'facility', icon: '<path d="M12 2a3 3 0 0 0-3 3v9.5a5 5 0 1 0 6 0V5a3 3 0 0 0-3-3Z"/><circle cx="12" cy="17" r="2"/>' },
  { view: 'housekeeping', label: 'Housekeeping', cat: 'facility', icon: '<path d="M3 3l18 18"/><path d="M10 4 4 10c-1 4 2 10 6 10s7-6 6-10l-2-2"/>' },
  { view: 'handover', label: 'Handover', badge: 'nav-badge-handover', badgeText: 'Waiting', cat: 'handover', icon: '<path d="M16 3l4 4-4 4"/><path d="M20 7H8a4 4 0 0 0-4 4v1"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h12a4 4 0 0 0 4-4v-1"/>' }
];
const MOBILE_ADMIN_EXTRA_ITEMS = [
  { view: 'dashboard', label: 'Dashboard', cat: 'admin', icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
  { view: 'reports', label: 'KPI Reports', cat: 'admin', icon: '<path d="M4 19V5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M14 4v6h6"/>' }
];

const App = {
  currentView: 'dashboard',
  pendingBackfillDate: null,
  pendingQaMachine: null,
  pendingEquipmentMachine: null,
  _clockInterval: null,
  _pendingExceptionCount: 0,
  _appVersionSnapshot: null,
  _versionCheckDismissed: false,
  _versionCheckInterval: null,
  views: {
    categories: CategoriesView,
    dashboard: DashboardView,
    ro: RoView,
    'ro-history': RoHistoryView,
    equipment: EquipmentView,
    'equipment-history': EquipmentHistoryView,
    cycles: CycleLogView,
    'cycles-history': CycleLogHistoryView,
    qa: QaTestingView,
    'qa-history': QaTestingHistoryView,
    instruments: InstrumentMaintenanceView,
    'im-history': InstrumentMaintenanceHistoryView,
    brush: BrushView,
    'brush-history': BrushHistoryView,
    'temp-humidity': TempHumidityView,
    'th-history': TempHumidityHistoryView,
    housekeeping: HousekeepingView,
    'hk-history': HousekeepingHistoryView,
    handover: HandoverView,
    'handover-history': HandoverHistoryView,
    reports: ReportsView,
    admin: AdminView,
    'error-reports': ErrorReportsView
  },

  async init() {
    ErrorReporter.init(); // as early as possible, so it can catch errors from everything else that follows
    Alarm.attach(); // primes audio/notification permission on the first click or touch anywhere in the app
    Alarm.loadSnoozeSetting();
    // Runs globally, not tied to any specific logbook's page — someone
    // needs to hear this even if they're on a completely different
    // logbook when a scheduled window opens. Hour-granularity schedules
    // don't need the 1s precision the exposure/BI-incubation timers use.
    setInterval(() => ScheduledAlarms.tick(), 60000);
    ScheduledAlarms.tick();
    TrueTime.sync(); // fire-and-forget — device clock correction shouldn't block app load
    setInterval(() => TrueTime.sync(), 10 * 60 * 1000); // re-sync periodically to catch drift over a long session
    const gateOpen = await this._checkLaunchGate();
    if (!gateOpen) return; // gate is showing — _finishInit() runs once it's cleared
    this._finishInit();
  },

  async _finishInit() {
    Auth.bindEvents();
    const loggedIn = await Auth.init();
    if (loggedIn) this.enterMain();
    else await Auth.renderLogin();

    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.view));
    });

    this._initVersionCheck();
    this._initOfflineQueue();

    if ('serviceWorker' in navigator) {
      // controllerchange also fires on someone's very first-ever visit
      // (no prior service worker to "update" from) — checking whether a
      // controller already existed before registering distinguishes a
      // genuine update from a first install, so the banner never shows
      // "a newer version is available" to someone who's never used the
      // app before.
      const hadControllerAlready = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.error('Service worker registration failed', err);
      });
      // skipWaiting()/clients.claim() in sw.js make a new service worker
      // take over immediately rather than waiting for every tab to
      // close — but that alone doesn't reload an already-open tab's
      // already-running JS. Without this listener, someone could sit
      // on a stale version indefinitely despite the new one being
      // fully deployed and "in control." This reuses the existing
      // update banner rather than a silent, unannounced reload that
      // could interrupt someone mid-task.
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !hadControllerAlready) return; // this event can fire more than once per takeover, and never applies to a first-ever install
        refreshing = true;
        this._showUpdateBanner();
      });
    }
  },

  // ---------------- PRE-LAUNCH GATE (backlog item #12) ----------------
  // Blocks everything — login included — until a superuser confirms
  // go-live with their PIN, right here in the gate itself (no need to
  // log in normally first). Once set, launch_date becomes the floor for
  // every missed-log/compliance calculation (WorkCalendar.launchDate()).
  async _checkLaunchGate() {
    let meta = null;
    try { meta = await DB.getAppMeta(); } catch (e) { /* if this fails, fall through to normal init rather than blocking forever on a network hiccup */ }
    if (!meta || meta.launched) return true;
    this._renderLaunchGate();
    return false;
  },

  _renderLaunchGate() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-main').classList.add('hidden');
    const el = document.getElementById('view-launch-gate');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(74,73,69,0.6);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;">
        <div class="card card-pad" style="max-width:420px;width:100%;text-align:center;" id="launch-gate-card">
          <div style="font-size:32px;margin-bottom:8px;">🔒</div>
          <h2 style="font-size:18px;margin-bottom:6px;">CSSD Digital Logbooks</h2>
          <div style="font-size:13px;color:var(--ink-soft);margin-bottom:20px;">This app hasn't launched yet — a superuser needs to confirm go-live before anyone can use it.</div>
          <button class="btn btn-primary" id="launch-start-btn" style="width:100%;">Start the Launch</button>
        </div>
      </div>
    `;
    document.getElementById('launch-start-btn').addEventListener('click', () => this._renderLaunchPinStage());
  },

  async _renderLaunchPinStage() {
    const card = document.getElementById('launch-gate-card');
    card.innerHTML = `<div style="font-size:13px;color:var(--ink-soft);">Loading…</div>`;
    let superusers = [];
    try { superusers = await DB.listSuperusers(); } catch (e) {}
    let pinBuffer = '';
    card.innerHTML = `
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">Enter a superuser PIN to confirm launch.</div>
      <div class="pin-dots" id="launch-pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>
      <div class="pin-pad" id="launch-pin-pad">
        <button class="pin-key" data-k="1">1</button><button class="pin-key" data-k="2">2</button><button class="pin-key" data-k="3">3</button>
        <button class="pin-key" data-k="4">4</button><button class="pin-key" data-k="5">5</button><button class="pin-key" data-k="6">6</button>
        <button class="pin-key" data-k="7">7</button><button class="pin-key" data-k="8">8</button><button class="pin-key" data-k="9">9</button>
        <button class="pin-key func" data-k="clear">Clear</button><button class="pin-key" data-k="0">0</button><button class="pin-key func" data-k="back">⌫</button>
      </div>
      <div class="login-error" id="launch-pin-error"></div>
    `;
    const dots = () => document.querySelectorAll('#launch-pin-dots .pin-dot').forEach((d, i) => d.classList.toggle('filled', i < pinBuffer.length));
    document.getElementById('launch-pin-pad').addEventListener('click', async (e) => {
      const btn = e.target.closest('.pin-key');
      if (!btn) return;
      const k = btn.dataset.k;
      const errEl = document.getElementById('launch-pin-error');
      if (k === 'clear') { pinBuffer = ''; dots(); errEl.textContent = ''; return; }
      if (k === 'back') { pinBuffer = pinBuffer.slice(0, -1); dots(); return; }
      if (pinBuffer.length >= 4) return;
      pinBuffer += k;
      dots();
      if (pinBuffer.length !== 4) return;
      const match = superusers.find(s => s.pin === pinBuffer);
      if (!match) {
        errEl.textContent = 'Incorrect PIN';
        pinBuffer = ''; dots();
        return;
      }
      try {
        await DB.updateAppMeta({ launched: true, launch_date: UI.todayStr() });
        UI.toast(`Launched by ${match.name}`);
        document.getElementById('view-launch-gate').classList.add('hidden');
        document.getElementById('view-launch-gate').innerHTML = '';
        this._finishInit();
      } catch (err) {
        errEl.textContent = "Couldn't confirm — check your connection and try again.";
        pinBuffer = ''; dots();
      }
    });
  },

  // ---------------- OFFLINE WRITE QUEUE UI (backlog item #11) ----------------
  // Drives OfflineQueue.flush() on the 'online' event, a ~30s interval, and
  // once at boot, and shows a persistent banner whenever the browser is
  // offline or anything is still queued — never silent, per the spec.
  _initOfflineQueue() {
    OfflineQueue.onChange(() => this._renderOfflineBanner());
    this._renderOfflineBanner();
    OfflineQueue.flush().then(() => this._renderOfflineBanner());
    window.addEventListener('online', () => OfflineQueue.flush().then(() => this._renderOfflineBanner()));
    window.addEventListener('offline', () => this._renderOfflineBanner());
    setInterval(() => OfflineQueue.flush().then(() => this._renderOfflineBanner()), 30000);
  },

  _renderOfflineBanner() {
    const pendingCount = OfflineQueue.list().length;
    const isOffline = navigator.onLine === false;
    let el = document.getElementById('offline-banner');
    if (!isOffline && pendingCount === 0) {
      if (el) el.remove();
      document.body.style.paddingTop = '';
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-banner';
      el.style = 'position:fixed;top:0;left:0;right:0;z-index:1000;background:var(--amber);color:#fff;padding:9px 20px;text-align:center;font-size:12.5px;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,0.15);';
      document.body.appendChild(el);
    }
    if (isOffline) {
      el.textContent = pendingCount > 0
        ? `⚠ Offline — ${pendingCount} entr${pendingCount === 1 ? 'y' : 'ies'} saved on this device, will sync automatically once you're back online.`
        : `⚠ Offline — entries you submit now are saved on this device and will sync automatically once you're back online.`;
    } else {
      el.textContent = `Syncing ${pendingCount} saved entr${pendingCount === 1 ? 'y' : 'ies'}…`;
    }
    // Pushes everything below it down by its actual rendered height — since
    // it's position:fixed at top:0, it would otherwise sit on top of the
    // mobile topbar (also anchored to top:0) rather than above it.
    document.body.style.paddingTop = el.offsetHeight + 'px';
  },

  // ---------------- LIVE UPDATE CHECK (backlog item #10) ----------------
  // Runs regardless of login state — a kiosk tablet can sit on the login
  // screen for hours. Polls every 5 min and on tab refocus; compares
  // against the app_meta.app_version snapshotted at load. This only means
  // anything if a superuser bumps app_version after deploying new files
  // (Admin -> Version & Updates -> Update version note).
  async _initVersionCheck() {
    try {
      const meta = await DB.getAppMeta();
      this._appVersionSnapshot = meta ? meta.app_version : null;
    } catch (e) { /* if this fails at boot, the periodic checks below will just keep trying */ }
    if (this._versionCheckInterval) clearInterval(this._versionCheckInterval);
    this._versionCheckInterval = setInterval(() => this._checkForUpdate(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._checkForUpdate(); });
  },

  async _checkForUpdate() {
    if (this._versionCheckDismissed || !this._appVersionSnapshot) return;
    try {
      const meta = await DB.getAppMeta();
      if (meta && meta.app_version !== this._appVersionSnapshot) this._showUpdateBanner();
    } catch (e) { /* offline or unreachable — just try again next interval */ }
  },

  _showUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    const el = document.createElement('div');
    el.id = 'update-banner';
    el.style = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;background:var(--brand-dark);color:#fff;padding:12px 20px;display:flex;justify-content:center;align-items:center;gap:16px;flex-wrap:wrap;font-size:13px;font-weight:600;box-shadow:0 -2px 16px rgba(0,0,0,0.25);';
    el.innerHTML = `
      <span>A newer version of this app is available.</span>
      <button id="update-refresh-btn" style="background:var(--honey);color:var(--ink);border:none;border-radius:var(--radius-sm);padding:7px 16px;font-weight:700;font-size:13px;cursor:pointer;">Refresh</button>
      <button id="update-dismiss-btn" style="background:none;border:none;color:#fff;text-decoration:underline;cursor:pointer;font-size:12px;font-weight:500;">Dismiss</button>
    `;
    document.body.appendChild(el);
    document.getElementById('update-refresh-btn').addEventListener('click', () => location.reload());
    document.getElementById('update-dismiss-btn').addEventListener('click', () => {
      this._versionCheckDismissed = true;
      el.remove();
    });
  },

  enterMain() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-main').classList.remove('hidden');
    const role = Auth.currentStaff.role;
    const roleLabel = role === 'superuser' ? 'Superuser' : role === 'admin' ? 'Admin' : 'User';
    document.getElementById('who-name').textContent = `${Auth.currentStaff.name} · ${roleLabel}`;

    document.querySelectorAll('.role-admin-plus').forEach(el => el.classList.toggle('hidden', !(role === 'admin' || role === 'superuser')));
    document.querySelectorAll('.role-superuser-only').forEach(el => el.classList.toggle('hidden', role !== 'superuser'));

    document.body.classList.remove('role-user', 'role-admin', 'role-superuser');
    document.body.classList.add('role-' + role);
    this._setupMobileShell(role);

    this._renderTopStrip();
    if (this._clockInterval) clearInterval(this._clockInterval);
    this._clockInterval = setInterval(() => this._renderTopStrip(), 1000);

    this._refreshNavBadges();
    if (this._navBadgeInterval) clearInterval(this._navBadgeInterval);
    this._navBadgeInterval = setInterval(() => this._refreshNavBadges(), 30000);

    if (role === 'superuser') {
      this._refreshPendingCount();
      if (this._pendingInterval) clearInterval(this._pendingInterval);
      this._pendingInterval = setInterval(() => this._refreshPendingCount(), 30000);
      document.getElementById('top-strip').addEventListener('click', (e) => {
        if (e.target.closest('[data-bell]')) this._openApprovalsModal();
      });
    }

    this.navigate('categories');
  },

  // ---------------- MOBILE SHELL (bento for user/admin, offcanvas for superuser) ----------------
  mobileItemsForRole(role) {
    return role === 'admin' ? MOBILE_LOGBOOK_ITEMS.concat(MOBILE_ADMIN_EXTRA_ITEMS) : MOBILE_LOGBOOK_ITEMS;
  },

  _setupMobileShell(role) {
    document.getElementById('mobile-avatar-btn').textContent = Auth.currentStaff.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    document.getElementById('mobile-home-btn').addEventListener('click', () => this.navigate('categories'));

    if (role === 'superuser') {
      document.getElementById('mobile-avatar-btn').addEventListener('click', () => this._toggleOffcanvas());
      document.getElementById('mobile-offcanvas-backdrop').addEventListener('click', () => this._toggleOffcanvas(false));
      document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => this._toggleOffcanvas(false));
      });
      return;
    }

    // user / admin: populate the persistent quick-access strip
    const items = this.mobileItemsForRole(role);
    const strip = document.getElementById('mobile-quickstrip');
    strip.innerHTML = items.map(it => `
      <button class="qs-tile" data-view="${it.view}" title="${it.label}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>
        ${it.badge ? `<span class="qs-dot hidden" id="qs-dot-${it.view}"></span>` : ''}
      </button>
    `).join('');
    strip.querySelectorAll('.qs-tile').forEach(btn => btn.addEventListener('click', () => this.navigate(btn.dataset.view)));
  },

  _toggleOffcanvas(open) {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('mobile-offcanvas-backdrop');
    const shouldOpen = open !== undefined ? open : !sidebar.classList.contains('offcanvas-open');
    sidebar.classList.toggle('offcanvas-open', shouldOpen);
    backdrop.classList.toggle('open', shouldOpen);
  },


  async _refreshPendingCount() {
    try {
      const rows = await DB.listPendingExceptions();
      this._pendingExceptionCount = rows.length;
    } catch (e) { /* leave last-known count */ }
    this._renderTopStrip();
  },

  // Glowing red badges on the sidebar — how many unresolved items are
  // sitting in each logbook, visible to everyone, not just superuser.
  async _refreshNavBadges() {
    try {
      const [downtime, cycles, incubating, processing] = await Promise.all([
        DB.listOpenDowntimeLogs(),
        DB.listOpenCycles(),
        DB.listIncubatingBiTests(),
        DB.listProcessingHandovers()
      ]);
      this._setNavBadge('nav-badge-equipment', downtime.length);
      this._setNavBadge('nav-badge-cycles', cycles.length);
      this._showNavNotice('nav-badge-cycles', cycles.length > 0 ? 'Cycles in progress' : null);
      this._setNavBadge('nav-badge-handover', processing.length);
      const overdueBi = incubating.filter(r => {
        const due = QaTestingView.computeBiDue(r);
        return due.computable && due.isOverdue;
      }).length;
      this._setNavBadge('nav-badge-qa', overdueBi);
      this._showNavNotice('nav-badge-qa', overdueBi > 0 ? 'BI result needed' : null);
      this._mobileCounts = { equipment: downtime.length, cycles: cycles.length, qa: overdueBi, handover: processing.length };
      this._syncMobileBadges();
      if (Auth.currentStaff && Auth.currentStaff.role === 'superuser') {
        const errorReports = await DB.listErrorReports();
        this._setNavBadge('error-reports-badge', errorReports.filter(r => r.status === 'New').length);
      }
    } catch (e) { /* offline or not logged in yet — leave last-known badges */ }
  },
  _syncMobileBadges() {
    if (!this._mobileCounts) return;
    Object.keys(this._mobileCounts).forEach(view => {
      const count = this._mobileCounts[view];
      const item = MOBILE_LOGBOOK_ITEMS.find(it => it.view === view);
      const dot = document.getElementById(`qs-dot-${view}`);
      if (dot) dot.classList.toggle('hidden', count === 0);
      const btDot = document.getElementById(`bt-dot-${view}`);
      if (btDot) {
        const countText = count > 99 ? '99+' : count;
        btDot.innerHTML = `<span class="bt-dot-num">${countText}</span>${item && item.badgeText ? `<span class="bt-dot-label">${item.badgeText}</span>` : ''}`;
        btDot.classList.toggle('hidden', count === 0);
      }
    });
  },
  _setNavBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count > 99 ? '99+' : count;
    el.classList.toggle('hidden', count === 0);
  },

  // Positions a short floating bubble to the right of a badge, using
  // its actual on-screen coordinates rather than a fixed offset — so
  // it's always clear of the sidebar regardless of sidebar width or
  // whether the layout is mobile/desktop. message === null hides it.
  _showNavNotice(badgeId, message) {
    const bubbleId = `${badgeId}-notice`;
    let bubble = document.getElementById(bubbleId);
    const badge = document.getElementById(badgeId);
    if (!message || !badge || badge.classList.contains('hidden')) {
      if (bubble) bubble.remove();
      return;
    }
    const rect = badge.getBoundingClientRect();
    if (rect.width === 0) { if (bubble) bubble.remove(); return; } // badge exists but isn't actually visible (e.g. sidebar collapsed on mobile)
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = bubbleId;
      bubble.className = 'nav-notice-bubble';
      document.body.appendChild(bubble);
    }
    bubble.textContent = message;
    bubble.style.left = `${rect.right + 10}px`;
    bubble.style.top = `${rect.top + rect.height / 2}px`;
    bubble.style.transform = 'translateY(-50%)';
  },

  async _openApprovalsModal() {
    const modal = UI.showModal(`<h3>Pending exception requests</h3><div id="approvals-list" style="margin-top:10px;"></div><div class="modal-actions"><button class="btn" id="approvals-close">Close</button></div>`);
    modal.querySelector('#approvals-close').addEventListener('click', () => UI.closeModal());
    const listEl = modal.querySelector('#approvals-list');
    const load = async () => {
      listEl.innerHTML = `<div class="empty-state">Loading…</div>`;
      try {
        const rows = await DB.listPendingExceptions();
        this._pendingExceptionCount = rows.length;
        this._renderTopStrip();
        if (rows.length === 0) { listEl.innerHTML = `<div class="empty-state">Nothing pending.</div>`; return; }
        listEl.innerHTML = rows.map(r => `
          <div class="pending-row" style="border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px;margin-bottom:10px;">
            <strong>${UI.escapeHtml(r.exception_type)}</strong> — ${UI.fmtDate(r.date_from)}${r.date_to !== r.date_from ? ' to ' + UI.fmtDate(r.date_to) : ''}
            <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">Requested by ${UI.escapeHtml(r.requested_by)} · ${UI.fmtDateTime(r.created_at)}</div>
            ${r.reason ? `<div style="font-size:12.5px;margin-top:6px;">${UI.escapeHtml(r.reason)}</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="btn btn-sm btn-primary" data-approve="${r.id}">Approve</button>
              <button class="btn btn-sm btn-danger" data-decline="${r.id}">Decline</button>
            </div>
          </div>
        `).join('');
        listEl.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
          try { await DB.approvePendingException(rows.find(r => r.id === b.dataset.approve)); UI.toast('Approved'); load(); }
          catch (e) { UI.toast('Failed: ' + e.message, true); }
        }));
        listEl.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', async () => {
          try { await DB.declinePendingException(b.dataset.decline); UI.toast('Declined'); load(); }
          catch (e) { UI.toast('Failed: ' + e.message, true); }
        }));
      } catch (e) {
        listEl.innerHTML = `<div class="empty-state">Couldn't load: ${UI.escapeHtml(e.message)}</div>`;
      }
    };
    load();
  },

  _renderTopStrip() {
    const el = document.getElementById('top-strip');
    if (!el) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isSuperuser = Auth.currentStaff && Auth.currentStaff.role === 'superuser';
    el.innerHTML = `
      ${isSuperuser ? `
        <button class="top-badge" data-bell style="position:relative;cursor:pointer;">
          🔔 Approvals
          ${this._pendingExceptionCount > 0 ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;font-size:10px;font-weight:800;border-radius:999px;min-width:16px;height:16px;line-height:16px;padding:0 3px;">${this._pendingExceptionCount}</span>` : ''}
        </button>
      ` : ''}
      <span class="top-badge"><span class="mono">${dateStr}</span></span>
      <span class="top-badge"><span class="mono">${timeStr}</span></span>
      <span class="top-badge who">${UI.escapeHtml(Auth.currentStaff.name)}</span>
    `;
    const mDt = document.getElementById('mobile-datetime');
    const mName = document.getElementById('mobile-username');
    if (mDt) mDt.textContent = `${dateStr.split(',')[0]} · ${timeStr.slice(0, 5)}`;
    if (mName) mName.textContent = Auth.currentStaff.name;
  },

  navigate(viewName) {
    const role = Auth.currentStaff.role;
    if (viewName === 'admin' && role !== 'superuser') return;
    if (viewName === 'error-reports' && role !== 'superuser') return;
    if ((viewName === 'dashboard' || viewName === 'reports') && role === 'user') return;

    this.currentView = viewName;
    document.querySelectorAll('.view-page').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === viewName));
    document.querySelectorAll('.qs-tile[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === viewName));
    const strip = document.getElementById('mobile-quickstrip');
    if (strip) strip.classList.toggle('on-home', viewName === 'categories');
    const target = document.getElementById('view-' + viewName);
    target.classList.remove('hidden');
    const view = this.views[viewName];
    if (view && view.render) view.render();
    this._refreshNavBadges();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

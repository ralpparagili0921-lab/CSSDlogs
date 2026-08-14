// Service worker for CSSD Digital Logbooks.
// Purpose: let the app be opened fresh — not just kept running — with
// zero internet connection, by caching the app shell itself. This is
// what makes "internet down at 6am, still need to log at 7am" work:
// without this, a cold-opened tab has nothing to render at all.
//
// Bump CACHE_NAME whenever the shell changes (any js/*.js file, css,
// or index.html), so a deployed update actually reaches devices
// instead of serving a stale cached shell forever. Bump it alongside
// app_meta.app_version in Admin -> Version & Updates for consistency.
var CACHE_NAME = 'cssd-shell-v2026.08.14.03';
var SHELL_URLS = [
  './', './index.html', './css/style.css',
  './js/config.js', './js/offline-queue.js', './js/db.js', './js/search-bar.js', './js/dtr-import.js', './js/ui.js',
  './js/work-calendar.js', './js/missed-logs.js', './js/auth.js',
  './js/categories.js', './js/dashboard-stats.js', './js/public-dashboard.js',
  './js/handover-submit-portal.js',
  './js/dashboard.js', './js/ro.js', './js/equipment.js', './js/cycle-log.js',
  './js/qa-testing.js', './js/instrument-maintenance.js', './js/brush.js',
  './js/temp-humidity.js', './js/housekeeping.js', './js/handover.js',
  './js/reports.js', './js/admin.js', './js/main.js',
  './Cera_Pro_Regular.woff2', './Cera_Pro_Regular_Italic.woff2',
  './Cera_Pro_Medium.woff2', './Cera_Pro_Bold.woff2', './Cera_Pro_Black.woff2'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // addAll fails the whole install if even one URL 404s — font files
      // are only present once the developer has actually copied them in,
      // so cache what's there and don't let a missing font block the shell.
      return Promise.all(SHELL_URLS.map(function (url) {
        return cache.add(url).catch(function (err) {
          console.warn('Service worker: could not cache', url, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Same-origin requests (the app shell itself): serve from cache immediately
// if available, refresh the cache in the background when online. Cross-origin
// requests (Google Fonts for IBM Plex Mono, the Supabase CDN script, and
// Supabase API calls themselves) are left alone — the browser's own HTTP
// cache handles static assets, and Supabase calls need to reach the network
// or fail fast so the offline queue in js/offline-queue.js can catch them.
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});

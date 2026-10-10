// VitalDelta service worker: lets the app open and read reports with no connection.
// It caches only the app's own files. Reports and results live in IndexedDB and never pass
// through here, and it never contacts another site. Built by the plugin in vite.config.ts,
// which fills in the version and the list of files.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `vitaldelta-${VERSION}`;
// Big, rarely-needed vendor files — pdf.js character maps (1.6 MB) and the OCR engine
// (~7 MB, only for scanned reports) — are cached the first time they're used, not up front.
const RUNTIME = '__RUNTIME_CACHE__';

// Browsers refuse a redirected response as a page, so store a plain copy.
const plain = async (response) =>
  response.redirected ? new Response(await response.blob(), { status: response.status, headers: response.headers }) : response;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map(async (path) => {
            const response = await fetch(path, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Couldn't cache ${path}: ${response.status}`);
            await cache.put(path, await plain(response));
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vitaldelta-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first, so a new version shows up straight away; the cached app when offline.
    // The app's pages use app.html; everything else is the (prerendered) landing page.
    const page = /^\/app(\/|$)/.test(url.pathname) ? '/app.html' : '/';
    event.respondWith(fetch(request).catch(() => caches.match(page, { cacheName: CACHE, ignoreVary: true })));
    return;
  }

  // ignoreVary: module scripts are requested with an Origin header that the cached copies
  // (fetched without one) don't have; every cached file is our own, so Vary doesn't matter.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith('/pdfjs/') || url.pathname.startsWith('/ocr/'))) {
            const copy = response.clone();
            event.waitUntil(caches.open(RUNTIME).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
    ),
  );
});

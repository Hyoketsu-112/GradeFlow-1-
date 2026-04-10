/* ============================================================
   GradeFlow Service Worker — Offline-first PWA
   ============================================================ */

const CACHE_NAME = "gradeflow-v8";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/style-professional-dashboard.css",
  "/style-responsive-improvements.css",
  "/style-spacing-fixes.css",
  "/style-interface-grouping.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.svg",
  "/icon-512.svg",
];

const CDN_CACHE = "gradeflow-cdn-v8";
const CDN_DOMAINS = [
  "cdn.sheetjs.com",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// All CDN libraries — pre-cached at install so they work offline from the start
const CDN_ASSETS = [
  "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2",
];

// ── Install: cache core app shell + all CDN libraries ──────
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // Cache app shell (local files)
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {})),
      // Pre-cache CDN libraries so they work offline immediately
      caches.open(CDN_CACHE).then((cache) =>
        Promise.allSettled(
          CDN_ASSETS.map(
            (url) =>
              fetch(url, { mode: "cors" })
                .then((res) => {
                  if (res.ok) cache.put(url, res);
                })
                .catch(() => {}), // silently skip if fetch fails (already offline at install)
          ),
        ),
      ),
    ]),
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== CDN_CACHE)
          // also delete old v3 caches
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Fetch: cache-first for app shell, stale-while-revalidate for CDN ──
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API calls
  if (event.request.method !== "GET") return;
  if (url.pathname.includes("/v1/messages")) return; // Anthropic — never cache
  if (url.hostname.includes("generativelanguage.googleapis.com")) return; // Gemini — never cache

  // CDN assets — cache-first with background refresh
  // Also intercept font file requests from gstatic that come from Google Fonts CSS
  const isCDN = CDN_DOMAINS.some((d) => url.hostname.includes(d));
  if (isCDN) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((res) => {
              if (res.ok) cache.put(event.request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        }),
      ),
    );
    return;
  }

  // App shell — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            caches
              .open(CACHE_NAME)
              .then((c) => c.put(event.request, res.clone()));
          }
          return res;
        });
      }),
    );
  }
});

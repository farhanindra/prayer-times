/* Prayer Times — offline service worker */
const CACHE = "prayer-times-v15";
const DATA_CACHE = "prayer-data-v1";
const ASSETS = [
  "index.html",
  "prayer-styles.css",
  "prayer-app.js",
  "tweaks-panel.jsx",
  "prayer-tweaks.jsx",
  "manifest.webmanifest",
  "app-icon-192.png",
  "app-icon-512.png",
  "app-icon-180.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Prayer-time API: network first, cache response on success, serve cache if offline.
  if (/aladhan\.com/.test(url.hostname)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(DATA_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Other APIs (geocoding): network only, fall back to cache.
  const isApi = /open-meteo\.com|openstreetmap\.org/.test(url.hostname);
  if (isApi) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // App shell + fonts: cache-first, fall back to network and cache it.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});

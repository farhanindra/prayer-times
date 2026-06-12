/* Prayer Times — offline service worker */
const CACHE = "prayer-times-v4";
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
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live prayer-time + geocoding APIs: always go to network (data must be fresh).
  const isApi = /aladhan\.com|open-meteo\.com|openstreetmap\.org/.test(url.hostname);
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

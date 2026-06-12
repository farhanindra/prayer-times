# CLAUDE.md — Prayer Times

Project guidance for Claude Code. Read this before editing.

## What this is
A static, installable web app (PWA) that shows daily Muslim prayer times with a live
countdown to the next prayer. No build step, no framework bundler — plain HTML, CSS, and
JS, plus React loaded from a CDN only for the Tweaks panel. It is deployed as-is to
**GitHub Pages**.

## How to run locally
The app uses `fetch()` and a service worker, which do **not** work from `file://`. Always
serve over HTTP:
```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## File map
| File | Role |
|------|------|
| `index.html` | Entry point. Markup + PWA meta tags + service-worker registration + iOS "Add to Home Screen" hint logic. |
| `prayer-styles.css` | All styling. Theme via CSS variables on `:root[data-theme="warm|cool|night"]`. |
| `prayer-app.js` | Core logic (vanilla IIFE): location, city search, API calls, rendering, countdown. |
| `prayer-tweaks.jsx` | React Tweaks panel (accent, theme tone, 12h/24h). Loaded via Babel. |
| `tweaks-panel.jsx` | Reusable Tweaks shell + form controls. Do not edit unless necessary. |
| `manifest.webmanifest` | PWA manifest. `start_url` is `index.html`. |
| `service-worker.js` | Offline cache. **See the cache-busting rule below.** |
| `app-icon-{180,192,512}.png` | App / home-screen icons (green star-and-crescent). |

## Data sources (no API keys)
- **Prayer times:** `https://api.aladhan.com/v1/timings/DD-MM-YYYY?latitude=&longitude=&method=`
- **City search:** `https://geocoding-api.open-meteo.com/v1/search?name=`
- **Reverse geocode (label only):** `https://nominatim.openstreetmap.org/reverse`

Today + tomorrow are both fetched so the countdown can roll past Isha into tomorrow's Fajr.

## ⚠️ Cache-busting rule (most important)
The service worker caches the app shell **cache-first**. If you change ANY of
`index.html`, `prayer-styles.css`, `prayer-app.js`, `*.jsx`, or an icon, you MUST bump the
cache name in `service-worker.js`:
```js
const CACHE = "prayer-times-v2";  // → bump to v3, v4, ...
```
If you forget, already-installed phones keep serving the old cached files and your change
appears to do nothing. The version is currently **v2**.

## Tweaks defaults live on disk
`prayer-tweaks.jsx` has an `EDITMODE` block that holds the default tweak values:
```js
const PT_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#5b7b66",
  "tone": "warm",
  "timeFormat": "24h"
}/*EDITMODE-END*/;
```
This block is the source of truth for first-load defaults (e.g. time format defaults to
`24h`). `prayer-app.js` also initialises `state.format24: true` so the very first render
matches. Keep the two in sync if you change the default.

## Deploy (GitHub Pages)
Files live at the repo root and deploy on push to the Pages branch:
```bash
git add -A && git commit -m "..." && git push
```
GitHub Pages rebuilds in ~1 minute. Verify at the live URL in Safari, then (if installed)
fully close + reopen the home-screen app so the new service worker activates.

## Conventions
- Vanilla JS, no new dependencies. Keep `prayer-app.js` framework-free.
- Prayer names are bilingual (English + Arabic). Arabic spans use `lang="ar" dir="rtl"`.
- Colors come from the CSS variables — don't hardcode hex in JS.
- Mobile-first; respect `env(safe-area-inset-*)` for standalone iOS.

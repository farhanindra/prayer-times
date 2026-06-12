# Prayer Times

A small, installable web app showing daily Muslim prayer times with a live countdown to
the next prayer. Auto-detects your location (with city search as a fallback), supports
multiple calculation methods with smart per-country suggestions, bilingual prayer names
(English + Arabic), light/cool/night themes, and 12h/24h time. Works offline once
installed.

**Live:** `https://<your-username>.github.io/<repo>/`

## Develop with Claude Code

1. Clone your repo and `cd` into it.
2. Run Claude Code in the repo folder. It will read `CLAUDE.md` automatically for
   architecture notes and the important cache-busting rule.
3. Ask for a change, let it edit + commit + push. GitHub Pages redeploys in ~1 minute.

## Run locally
The service worker and `fetch()` need HTTP (not `file://`):
```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## Stack
Plain HTML/CSS/JS. React (CDN) only powers the optional Tweaks panel. No build step.

See `CLAUDE.md` for the full file map, data sources, and deployment notes.

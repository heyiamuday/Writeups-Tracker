# Writeups Tracker — Local Pentester.Writeups Reader & Progress Tracker

A lightweight, local-first web app to browse and track pentest writeups (from `https://pentester.land/writeups.json`) on your Kali Linux machine.
Runs entirely locally: a tiny Flask backend caches the writeups and stores `userdata.json`, while a static frontend provides filtering, pagination, read/unread tracking, comments, bounty sorting, and a modern GitHub-style heatmap of activity.

Use it to keep a study-focused reading workflow, track progress across browsers on the same machine, and analyze reading cadence.

---

## Quick TL;DR

```bash
# clone or copy files into ~/writeups-tracker
cd ~/writeups-tracker
# install deps
pip3 install --user flask requests
# start the app (starts backend and opens browser)
./run.sh
# or run manually
python3 backend.py
# open http://127.0.0.1:5000 in your browser
```

---

# ✅ Current Features (Implemented / Working)

* Local Flask backend that:

  * Caches `writeups.json` locally.
  * Serves `/api/writeups` (returns a clean array).
  * Serves `/api/data` for `userdata.json` (GET/POST).
* Frontend (pure HTML / CSS / JS — no external CDNs) providing:

  * Read / Mark unread (shared across all browsers via `userdata.json`).
  * Export / Import progress (JSON).
  * Tags filter (populated from `Bugs` in `writeups.json`).
  * Search (title, author, tags, description, bounty).
  * Sort by date/title/author/bounty (parse smartly from `Bounty` field).
  * Pagination (25 items per page) with `1-25 of N` and page controls.
  * Bounty display inside each item (raw text + parsed numeric used for sorting).
  * Comment per writeup (saved to `userdata.json`) — currently via prompt() (see roadmap).
  * Toggle to show/hide the “Open” button.
  * Progress indicators: overall progress & weekly goal.
  * Heatmap (GitHub-style) representing reads by day (last 52 weeks) — hover tooltip + click opens modal with day’s read items (title, link, comment).
  * Keyboard shortcuts: `/` focus search, `r` toggle first visible read, `u` unread-only.
* Responsive UI (works on desktop / mobile; heatmap horizontally scrollable).
* Everything stored in project root:

  ```
  writeups-tracker/
  ├─ backend.py
  ├─ writeups.json         # cached
  ├─ userdata.json         # progress + settings
  ├─ run.sh
  └─ static/
     ├─ index.html
     ├─ style.css
     └─ script.js
  ```

---

# 🔧 Installation (Kali Linux)

1. Create project folder and files (or copy the code supplied earlier).
2. Install Python and dependencies:

   ```bash
   sudo apt update
   sudo apt install -y python3-pip
   pip3 install --user flask requests
   ```
3. Make `run.sh` executable:

   ```bash
   chmod +x run.sh
   ```
4. Run:

   ```bash
   ./run.sh
   ```

   or

   ```bash
   python3 backend.py
   ```

   Then visit: `http://127.0.0.1:5000`

---

# Usage & UX notes

* **First run:** backend fetches `https://pentester.land/writeups.json` and stores it as `writeups.json`. If the remote is unavailable, the app serves empty array or existing cache.
* **Read tracking:** clicking an item toggles read/unread. Timestamps (ISO) are stored in `userdata.json` (so the heatmap and weekly counts are computed from these).
* **Comments:** saved in `userdata.json` under `comments`. (Currently added via a prompt; planned UX improvements listed below.)
* **Export/Import:** useful to sync between machines or keep backups.
* **Pagination:** 25 items per page; page controls are shown top + bottom.
* **Bounty parsing:** tries to extract numeric amounts (supports `2,500`, `$2.5k`, ranges, etc.). If parsing fails, raw text is shown.

---

# 📁 Project structure

```
writeups-tracker/
├─ backend.py        # Flask backend & caching logic
├─ run.sh            # convenience script to start backend + open browser
├─ writeups.json     # cached source JSON from pentester.land
├─ userdata.json     # stores { read: {...}, comments: {...}, settings: {...} }
└─ static/
   ├─ index.html
   ├─ style.css
   └─ script.js
```

---

# 🧭 Troubleshooting

* If the UI shows `No writeups matched`:

  * Check `writeups.json` shape: it may be `{ "data": [...] }`. The backend unwraps `.data` now; if not, restart backend.
  * Inspect backend endpoint:

    ```bash
    curl -s http://127.0.0.1:5000/api/writeups | jq '.[0:2]'
    ```
* If backend fails to fetch `pentester.land` on first run: copy the remote file manually into `writeups.json`.
* To stop a running backend started by `run.sh`:

  ```bash
  pkill -f backend.py
  ```

---

# 🔮 Future checklist — study-focused redesign & UX improvements

> Below is a prioritized **future roadmap / checklist** for turning the app into a study-focused, modern UX. Marked items (✅) are already implemented; unchecked items (⬜) are proposed enhancements.

## Current (OK — works perfectly)

* [✅] Local Flask backend + caching (`writeups.json`) and shared `userdata.json`.
* [✅] Read/unread tracking + progress bars.
* [✅] Export/Import user progress.
* [✅] Filters (tags / bug classes) + search + sorting.
* [✅] Pagination (25 per page) and bounty sorting/display.
* [✅] Heatmap (GitHub-style) for reads, hover tooltip + click modal.

## Study-focused design (Future work / Checklist)

* [ ] **Complete UI refresh — study-focused design**
  * Modern dark theme, smooth shadows, better spacing.
  * Readable monospace where appropriate (for timestamps, bounty, code snippets).
  * Light mode updated to be modern & minimal.
* [ ] **All checkboxes → toggles (switches)**
  Replace form checkboxes with neat toggles (e.g. “Only unread”, “Show Open button”).
* [ ] **Right Sidebar filters (multi-select)**
  Sidebar that slides in/out for advanced filters:

  * Authors (multi-select)
  * Programs (multi-select)
  * Bug class (multi-select)
  * Min / Max bounty (range inputs)
  * Added date range (from / to)
  * **Apply** and **Reset** buttons
  * Sidebar toggled by a prominent **Filter** button
* [ ] **Pagination & bounty improvements remain** (already implemented)

  * Keep 25/page & `1-25 of N` UI.
  * Show formatted bounties with currency and commas; fallback raw text for non-numeric.
* [ ] **Bounty formatting**

  * Show `$` and formatted commas: e.g. `$2,500` (when parsed); otherwise show raw `"-"` or text.
* [ ] **Heatmap improvements**

  * Show last **54 weeks** (last 52 + next 2 weeks) while keeping it horizontally scrollable.
  * Month labels across the top with correct automatic placement.
  * Day labels on left (Mon / Wed / Fri / Sun).
  * Smooth hover tooltip and click opens modal with that day’s read items (title, link, comment).
  * Adaptive color scaling per-metric (thresholds scale to data distribution).
* [ ] **Replace comment prompt with modern modal**

  * A modal with a `textarea`, **Save** / **Cancel**, markdown-lite preview optionally.
  * Comments stored in `userdata.json` and displayed inline under each writeup.
* [ ] **Filter sidebar multi-select applied on top of search/tags**

  * Multi-dimensional filtering: search + tags + sidebar filters combine to refine results.
* [ ] **Responsive, low-distraction “study-focused” layout**

  * Minimal distraction mode, split layout: content center, filter sidebar collapsible on the right.
  * Larger readable fonts, good line-height, subtle focus states.
* [ ] **Accessibility polish**

  * Keyboard navigation for the list and heatmap.
  * ARIA attributes for modal and heatmap.
* [ ] **Optional: server-side paging API**

  * For very large `writeups.json` files, add server endpoints like `/api/writeups?page=...&perPage=...&filters=...` to let backend return paged results instead of loading all into the browser.
* [ ] **Optional: theme presets** (Study / Focus / Minimal).
* [ ] **Optional: Export study report** — export weekly/monthly reading reports (CSV/JSON).

---

# How I suggest we tackle the redesign (high level)

1. **Design tokens & theme** — create CSS variables for light/dark palettes, spacing, typography, shadows.
2. **Sidebar component** — implement a right-side slide-over and wire multi-select controls.
3. **Form controls** — create accessible toggle switches and range/bounty inputs.
4. **Modal comments** — replace `prompt()` with an inline modal component and update `script.js` save flows.
5. **Heatmap tuning** — change weeks to 54 columns and tweak thresholds and month label placement.
6. **UX polish & QA** — keyboard shortcuts, small animations, mobile breakpoints.
7. **Optional server paging** — if dataset grows very large.

If you want, I can *generate the code changes for any subset of the above* (for example: theme + toggles + sidebar skeleton; or comment modal + heatmap 54-week support). Tell me which group you want me to implement first and I’ll produce the full code diffs you can drop into your project.

---

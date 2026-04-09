# CampusSafe — Changelog

A campus safety incident management tool built for the University of Oregon Police Department (UOPD). Tracks, classifies, and visualizes incident reports using real Clery crime log data and a live EPD dispatch feed.

---

## v0.1 — Initial Build

### What was built
- **Backend:** Node.js + Express REST API with SQLite (via `better-sqlite3`)
- **Data seeding:** Parsed and imported 290 incidents from `clery_crime_log_2026.csv` (60-day UOPD Clery log) on startup
- **AI classification:** Claude API (`claude-haiku-4-5`) classifies each incident's `nature` and `disposition` into severity (low / medium / high / critical), a one-sentence summary, and a recommended action. Falls back to heuristic rules if no API key is set.
- **REST endpoints:** `GET /incidents`, `GET /incidents/:id`, `POST /incidents`, `PATCH /incidents/:id/status`, `GET /trends`
- **Frontend:** React + TypeScript (Vite), styled with Tailwind CSS
- **Dashboard page:** Summary cards, filterable incident table, incident detail modal with AI summary and inline status controls
- **Submit Incident page:** Form that POSTs to the backend; AI classification result shown on confirmation
- **Trends page:** Line chart (volume over time), bar chart (top incident types), pie/donut chart (severity breakdown) using Recharts

### Design decisions
- Used heuristic severity classification for bulk CSV seeding to avoid 290 Claude API calls on startup; Claude is called only on new incident submissions
- SQLite chosen for zero-config local persistence appropriate for a demo/prototype
- Vite chosen over Expo after evaluating mobile-first vs. desktop-first use case — this is a management dashboard, not a field app

---

## v0.2 — Map View

### What was added
- **Map page** using `react-leaflet` v4 + OpenStreetMap tiles (no API key required)
- **Background geocoding:** On server startup, all seeded incidents are geocoded via Nominatim (OpenStreetMap's free geocoder) at 1 request/second to respect rate limits. Unique locations are geocoded once and applied to all matching incidents.
- **`GET /api/incidents/map`** endpoint returns only incidents that have been geocoded (have `lat`/`lng`)
- **Auto-refresh:** Map polls for new geocoded incidents every 15 seconds while geocoding runs in background
- **Severity-colored circle markers** on the map; clicking any pin shows a popup with AI analysis and a status dropdown

### Design decisions
- Downgraded from `react-leaflet@5` to `react-leaflet@4` after discovering v5 requires React 19's `use` hook, which caused a silent blank-screen crash on React 18
- Geocoded unique locations only (~101 unique locations for 290 incidents) rather than all 290 records, reducing geocoding time from ~5 min to ~2 min
- Map lazy-loaded via `React.lazy` so a Leaflet error cannot crash the rest of the app

---

## v0.3 — Map Interactivity Iterations

### What was added and removed

**Heatmap (added then removed)**
- Added `leaflet.heat` plugin with a toggleable heatmap overlay, color-coded by severity intensity
- Removed after determining individual incident points don't provide meaningful spatial density insight at campus zoom levels — the heatmap just placed a single dot per incident location, which is no different from a pin

**Cluster view (added then simplified)**
- Added `leaflet.markercluster` with severity-colored cluster bubbles that show the count and color of the worst incident inside
- Added toggle between "Clusters" and "Individual Pins" modes
- Removed the toggle after determining clusters are only useful when zoomed far out, which dispatchers wouldn't do
- Kept the underlying `MarkerClusterGroup` infrastructure for one purpose: **spiderify** — when multiple incidents share the exact same address (geocoded to the same lat/lng), clicking the stack fans them out so every incident is individually accessible

### Why the simplification
Plain `CircleMarker` components stack silently when incidents share a coordinate — only the top one is clickable. Using `MarkerClusterGroup` with `clusterRadius: 1` solves this: it won't group geographically separate points but will spiderify exact overlaps.

---

## v0.4 — Map Date Filter

### What was added
- **Date filter row** on the Map page with preset buttons: Today, Past 7 Days, Past 30 Days, All Time, Custom Range
- **Custom Range** reveals two date pickers (from → to) for arbitrary ranges
- Severity and date filters compose — e.g. "Critical only, past 7 days"
- Empty state overlay when no incidents match the current filter combination
- All filtering is client-side (no additional API calls)

---

## v0.5 — Map UI Redesign (Floating Panel)

### What changed
- Replaced the horizontal pill/filter bar at the top of the map with a **floating side panel** (Google Maps-style)
- Map now fills the full screen edge-to-edge
- Panel contains: incident count header with a color-coded severity breakdown bar, severity filter card, date filter card, and refresh button
- **Collapse toggle** (‹ ›) hides the panel completely for an unobstructed map view
- Smooth CSS transition animation on open/close
- Legend moved into the bottom-right corner of the map canvas

### Why
The horizontal pill layout was functional but visually dated and wasted vertical space. The floating panel pattern is familiar from mapping tools and keeps controls accessible without sacrificing map area.

---

## v0.6 — Dashboard & Navigation Restructure

### What changed

**Dashboard → Dispatcher triage view**
The dashboard was a plain list of all 290 incidents — not useful for an on-duty dispatcher. Redesigned around the dispatcher's perspective:
- **Shift header** with date, pulsing critical/high alert badges
- **Active Queue** (left 2/3): only open + in-progress incidents sorted by severity, each card shows a colored severity bar, AI recommendation, and time-ago label
- **Location Hotspots** (right): locations with 2+ incidents in the past 7 days, flagged with an amber warning
- **Recent Activity Feed** (right): last 12 incidents chronologically, as a compact feed

**Incident Log → new page**
The full historical record moved to its own page (`/log`):
- Month-grouped collapsible sections with severity dot summaries per month
- Full search and filter controls
- Expand all / Collapse all shortcuts

**Trends → renamed Analytics**
- Renamed from "Trends" to "Analytics" to better reflect its purpose
- **Time Intelligence section added**: Peak Hour card, Busiest Day card, Busiest Month card, Hour-of-Day bar chart (color-coded: late night / evening / daytime), Day-of-Week bar chart (weekends vs. weekdays highlighted)
- Time Intelligence moved here from Dashboard where it didn't belong operationally

**Navigation updated**
Dashboard → Incident Log → Map → Analytics → Submit

### Core design principle established
> Design from the dispatcher's perspective. A dispatcher on shift needs urgency surfaced immediately — not volume. Features that don't help a dispatcher act should live in Analytics or the Incident Log, not the Dashboard.

---

## v0.7 — Analytics Chart Fix

### What changed
- Fixed overlapping labels on the severity pie chart for small slices (1% Critical, 2% High)
- Added `paddingAngle={3}` to separate slice segments
- Switched from `labelLine={false}` to a thin connector line, pulling labels further from the pie edge so small adjacent slices have breathing room
- Labels remain visible for all slices; no data hidden

---

## v0.8 — Live EPD Dispatch Feed

### What was added
- **EPD scraper:** Fetches the Eugene Police Department public dispatch log (`coeapps.eugene-or.gov/epddispatchlog`) every 10 minutes using `cheerio` for HTML table parsing
- **Proximity filter:** Each new EPD incident is geocoded and its distance from UO campus center (44.0449°N, 123.0722°W) is calculated using the Haversine formula. Only incidents within 1,200m (~0.75 miles) are imported — roughly the campus footprint plus University District buffer.
- **Deduplication:** EPD event number stored per incident; re-polling never creates duplicates
- **AI classification:** Every qualifying EPD incident is classified by Claude before being saved — same pipeline as manual submissions
- **`source` column:** Incidents tagged as `'uopd_csv'` (historical) or `'epd_live'` (live feed) for auditability
- **`GET /api/scraper/status`** endpoint exposes last poll time, incident count, and how many were added
- **Dashboard status indicator:** Pulsing green dot in the shift header shows "EPD live · last synced [time]" so dispatchers know the feed is active
- **`CAMPUS_RADIUS_METERS`** environment variable lets any campus tune the proximity threshold for their jurisdiction

### Design decisions
- EPD data has a 2-hour delay (per the site's disclosure) — this is noted in the system but acceptable for a near-real-time supplementary feed
- Nominatim rate limit (1 req/sec) respected between geocode calls within each poll cycle
- EPD intersection addresses (e.g. `RIVERWALK LP/GOODPASTURE LP, EUG`) are normalized to a geocoder-friendly format before lookup
- Incidents that can't be geocoded are skipped rather than imported without coordinates — accuracy over completeness

---

## v0.9 — Import Page (Replaces Submit Incident)

### What changed
- Removed the "Submit Incident" manual entry form
- Added a new **Import Incidents** page (`/import`) with drag-and-drop file upload
- Nav item renamed from "Submit" to "Import"

### Why Submit was removed
The manual submission form was designed around the wrong user. A dispatcher on shift isn't typing incident reports — that's a records function, and even then it happens in bulk. The form assumed a use case that doesn't reflect how campus safety teams actually operate. Additionally, the live EPD scraper already handles real-time data entry automatically, making manual submission redundant for the primary workflow.

**What was considered:**
- Keeping the form as a "quick add" for edge cases (on-site incidents not in any feed). Decided against giving it its own nav page — if needed, a lightweight modal from the Dashboard would be more appropriate and less prominent.
- The live EPD feed + bulk import together cover every realistic data entry scenario without requiring a dispatcher to type anything.

### What the Import page does
- **Drag-and-drop upload** for `.csv` and `.pdf` files (20MB max)
- **CSV import:** Parses UOPD Clery log format (Nature, Case #, Date Reported, Date/Time Occurred, General Location, Disposition). Same column structure as the original seeded data.
- **PDF import:** Sends the file to Claude (`claude-sonnet-4-6`) as a document content block. Claude extracts and structures all incident records from unformatted PDF text — no regex or template required. Handles the UOPD 60-day Clery log PDF format.
- **Preview step:** Before any data is written, a preview table shows the first 5 extracted records and the total count. User must explicitly confirm.
- **Deduplication:** Skips records with a case number already in the database.
- **Background processing:** After import, geocoding and Claude AI classification run in the background at Nominatim's rate limit (1 req/sec), same pipeline as all other incidents.
- **Source tagging:** Imported records tagged as `import_csv` or `import_pdf` for auditability alongside `uopd_csv` (seed) and `epd_live` (scraper).

---

## v1.0 — Active Queue Cleanup: Status Fix + 14-Day Window

### Problems identified
Two separate issues were making the dispatcher's Active Queue noisy and unreliable:

**Problem 1 — Incorrect status assignment on seed**
When the UOPD Clery CSV was imported, every incident without "Cleared" in its disposition was marked `open`. This meant 198 incidents marked "Suspended. Inactive." and 41 marked "Other." were sitting in the open queue — cases that were long closed. A dispatcher opening the dashboard would see hundreds of stale, irrelevant incidents mixed in with genuinely active ones.

**Problem 2 — No time window on the Active Queue**
Even with correct statuses, incidents from 45–60 days ago were surfacing in the triage view. From a dispatcher's perspective, if something has been "open" for 45 days without anyone touching it, it either needs a supervisor review or it's stale data — it has no place in an on-shift queue.

### What was fixed

**Disposition-to-status remapping (one-time DB migration)**
Re-evaluated all disposition values in the seeded data:
- `"Suspended. Inactive."` → `resolved` (198 records)
- `"Other."` / `"Others."` → `resolved` (42 records)
- `"Unfounded."` → `resolved` (1 record)
- `"Cleared by Arrest*"` → already `resolved`
- `"Open."` → stays `open`

Total: 241 records corrected. Remaining open after fix: 9 genuinely unresolved incidents.

**Seed logic updated**
`seed.js` now uses a `resolveStatus()` function with explicit disposition mappings so any future re-seed or import applies the same logic correctly from the start.

**14-day window on Active Queue**
Dashboard Active Queue now shows only incidents from the past 14 days by default. If there are older open incidents (e.g. a stalled case from 30 days ago), an amber `+ N older open incidents` link appears — clicking it expands the queue to show everything. Clicking again collapses back to the 14-day view. The label "· past 14 days" is shown next to the heading so the dispatcher always knows what time window they're looking at.

### Why these decisions
- 14 days was chosen as the window: long enough to catch anything that opened in the past two weeks and hasn't been resolved, short enough to keep the queue from accumulating noise.
- Older open incidents aren't hidden — they're one click away via the amber toggle, and fully accessible in the Incident Log. The goal is to surface urgency by default without destroying visibility.
- The disposition fix was applied directly to the existing database rather than requiring a re-seed, so no incident data was lost.

---

## v1.1 — Dispatcher Workflow Features

### What was added

**Incident notes**
- Dispatchers can add timestamped free-text notes to any incident directly from the detail modal
- Notes persist to a new `incident_notes` SQLite table, associated to the incident by `incidentId`
- New backend routes: `GET /api/incidents/:id/notes`, `POST /api/incidents/:id/notes`, `DELETE /api/incidents/:id/notes/:noteId`
- Notes load automatically when an incident detail modal opens
- Enter key saves a note (Shift+Enter for newline); each note shows its timestamp and an ✕ delete button

**Toast notifications**
- New `Toast.tsx` component with a global `fireToast(text, type)` pub/sub API — any component can push a toast without prop drilling
- Three styles: info (blue), warning (amber), critical (red) — each with matching icon and border color
- `<ToastContainer />` added to `App.tsx` so toasts render above all page content (z-index 9999)
- Auto-dismissed after 5 seconds

**Automatic new-incident alerts**
- Dashboard polls for new incidents every 60 seconds
- On each poll, newly arrived incident IDs are compared against the previous known set
- For any genuinely new incident: fires a toast at the appropriate severity level (critical → red, high → amber, anything else → info)
- First load is silent — toasts only fire on subsequent polls so a fresh page load doesn't flood the screen

**Inline status buttons on Active Queue cards**
- Each Active Queue card now shows quick-action buttons below the AI recommendation line
- Open incidents show `→ In Progress` and `✓ Resolve`
- In-progress incidents show only `✓ Resolve`
- Clicking a button updates the status immediately (PATCH to backend) without opening the modal
- Card click still opens the full detail modal; button clicks stop event propagation
- Disabled while a save is in flight (prevents double-clicks)

**Show on Map (from detail modal)**
- "📍 Show on Map" button in the IncidentDetail modal closes the modal and navigates to `/map?lat=X&lng=Y&id=Z`
- MapView reads `?lat` and `?lng` URL params on mount and flies the camera to that location at zoom 18
- Uses react-leaflet's `useMap()` hook inside a `FlyToLocation` child component (the hook requires a child of `MapContainer`)
- Animated fly-to: 1.2 second smooth pan + zoom

**Time-open indicator**
- Open and in-progress incidents in the detail modal now show a colored age label next to their status badges
- Color coding: gray (<1h), yellow (1–4h), orange (4–24h), red (>24h, bold)
- Formatted as: `45m open`, `2h 30m open`, `3d 6h open`

### Why
Dispatchers need to act without context-switching. Previously: clicking a card → opening modal → finding the status dropdown → saving was 4 steps for the most common action. Now: two buttons are visible directly on each queue card. Notes let dispatchers annotate what's happening with an incident (unit dispatched, person contacted, etc.) without leaving the system. The Show on Map flow closes the loop between the triage list and geographic context — one click to see where something is.

---

## v1.2 — UI Polish: Animations & Visual Refinement

### What was added

**Modal entrance animation**
- Incident detail modal now animates in with a scale-up + fade + upward slide (`scale(0.95) translateY(8px)` → `scale(1) translateY(0)`) over 250ms with a custom cubic-bezier curve for a natural deceleration feel
- The backdrop fades in simultaneously over 200ms
- Both animations are CSS keyframes defined in `index.css` and applied via `.modal-backdrop` and `.modal-panel` classes

**Toast slide-in animation**
- Toasts slide in from the right edge of the screen (`translateX(100% + 1rem)` → `translateX(0)`) using a snappy 300ms cubic-bezier spring curve
- Replaces the previous `animate-in` class (which was a no-op since the tailwindcss-animate plugin wasn't installed)

**Dashboard skeleton loading**
- Replaced the plain "Loading..." text with a structural skeleton that mirrors the actual layout: a header row, four queue card placeholders with severity bar, title, location, and recommendation lines, and a right-column panel
- Skeleton items use a custom `skeleton` CSS class with a 1.5s pulse animation
- Gives dispatchers immediate visual feedback that content is loading in the correct layout, reducing perceived wait time

**Frosted glass map panel**
- All floating panel cards on the Map page now use `bg-white/80 backdrop-blur-md` with a `border-white/60` border instead of solid white
- Applied consistently to: header card, severity filter card, date filter card, refresh button, panel toggle tab, and empty-state overlay
- The map tiles are now faintly visible through the panel, reinforcing spatial context while the panel is open

### Why
These changes are purely perceptual — no functional behavior changed. The goal was to match the visual quality to the operational seriousness of the tool: a dispatcher dashboard should feel deliberate and polished, not like a prototype. Animations make state changes feel intentional rather than abrupt; the frosted glass ties the map panel visually to the map beneath it.

---

## v1.3 — Campus Configuration & Multi-Campus Support

### What was built

**`backend/campus.config.js` — single source of truth**
A new config module reads all campus-specific settings from the SQLite `settings` table, falling back to environment variables, then hardcoded defaults. Every module that previously had hardcoded UO-specific values now calls `getConfig()` at runtime — meaning config changes take effect on the next operation without a server restart.

**`GET /api/config` and `PATCH /api/config`**
New REST endpoints expose the current configuration to the frontend and accept partial updates. Only whitelisted keys are accepted on PATCH.

**`frontend/src/pages/Settings.tsx` — campus settings UI**
A dedicated `/settings` page with three sections:
- **Campus Identity** — campus name, city, and state (used for geocoding address lookups)
- **Geographic Boundary** — lat/lng coordinate inputs with a live Leaflet map preview showing the campus center point and the patrol radius as a green circle. A range slider controls the radius (200m–5,000m) with real-time map feedback.
- **Live Dispatch Feed** — toggle to enable/disable the PD scraper, and a URL field for the dispatch log endpoint. Includes a note explaining what format is expected and an example for how to find a local PD feed.

**`frontend/src/context/CampusContext.tsx`**
A React context that fetches `/api/config` on app load and makes it available to all components. Replaces every hardcoded `"University of Oregon"` string in the UI with the live config value.

**Navigation**
A ⚙ gear icon added to the right end of the navbar links to `/settings`. The campus name shown in the navbar header now reflects the live config value.

**What was de-hardcoded**

| What changed | Where |
|---|---|
| Campus name in Dashboard header | Reads from `CampusContext` |
| Campus name in Navbar | Reads from `CampusContext` |
| Campus name in Map panel | Reads from `CampusContext` |
| Campus name in new incident creation | Reads from `getConfig()` |
| Campus center coordinates in MapView | Reads from `CampusContext` |
| Campus center in proximity calculation | Reads from `getConfig()` |
| Campus patrol radius | Reads from `getConfig()` |
| City/state in geocoder address queries | Reads from `getConfig()` |
| EPD dispatch log URL in scraper | Reads from `getConfig()` |
| Dispatch feed enable/disable | Reads from `getConfig()` |
| Campus name in `/api/health` response | Reads from `getConfig()` |

### Curated dispatch feed dropdown
The Live Dispatch Feed section in Settings now includes a dropdown of known police department dispatch log URLs alongside the existing manual URL input. Selecting a department from the dropdown fills the URL field automatically. The manual entry field remains fully editable for departments not in the list.

The curated list (`frontend/src/data/knownDispatchFeeds.ts`) tracks each entry's verification status:
- **Verified** — confirmed compatible with the CampusSafe HTML-table scraper, used in production. Currently: Eugene Police Department.
- **Unverified** — URL is publicly documented or likely to exist but not yet confirmed to work with the scraper format. Unverified entries are shown in the dropdown but disabled if no URL has been confirmed. Currently listed: Corvallis PD (OSU), Palo Alto PD (Stanford), Berkeley PD (UC Berkeley), Seattle PD (UW).

The dropdown is opt-in — users can ignore it and type a URL directly. Selecting a verified feed also serves as documentation that the URL is known-good. New verified feeds can be added by editing the data file.

### Campus search (geocoded)
The Settings page includes a "Find Your Campus" search field that queries Nominatim in real time. Typing a university name shows a dropdown of matching results; selecting one automatically populates the campus name, lat/lng, city, and state fields and animates the map preview to the new location. No manual coordinate lookup required.

### Deploying to a new campus
To deploy CampusSafe at Oregon State University (or any other institution):
1. Open the app and navigate to ⚙ Settings
2. Type "Oregon State University" in the campus search — select from the dropdown
3. Adjust the patrol radius if needed
4. Enter the Corvallis PD public dispatch log URL (if available)
5. Save — all changes apply immediately

No code changes. No server restart. No environment variable edits required.

---

## Roadmap: Multi-Campus Generalization

### Goal
Make CampusSafe deployable to any university campus with configuration changes only — no code edits required. The current build was developed against University of Oregon data and infrastructure, but the underlying architecture (AI classification, EPD scraper pipeline, Clery CSV import, severity triage dashboard) is campus-agnostic. The work needed is to externalize the assumptions that are currently hardcoded.

### Why this matters — the Clery Act
Every US college or university that receives federal financial aid is required by the **Jeanne Clery Disclosure of Campus Security Policy and Campus Crime Statistics Act** to:
- Maintain a public daily crime log
- Publish an Annual Security Report (ASR) categorizing crimes by type and campus geography
- Report statistics to the Department of Education annually

This means every eligible institution — over 6,000 in the US — already collects and publishes incident data in a structurally similar format to what we import. The Clery log CSV that seeded this system is not a UOPD-specific artifact; it is a federally standardized compliance output. Any campus safety team running the same process is a potential user of this tool. Clery-compliant export (formatting incident data into ASR categories: burglary, aggravated assault, motor vehicle theft, liquor law violations, etc.) would be a universally applicable feature that directly reduces administrative burden for every campus safety office in the country.

### What needs to change for true productizability
The following values are currently hardcoded and must be externalized into a campus config:

| Hardcoded value | Location | What it should become |
|---|---|---|
| "University of Oregon" | Dashboard, Analytics, IncidentDetail, DB seed | `CAMPUS_NAME` config |
| `44.0449, -123.0722` | MapView, geocoder, scraper | `CAMPUS_LAT` / `CAMPUS_LNG` config |
| EPD dispatch log URL | scraper.js | `PD_DISPATCH_URL` config |
| `CAMPUS_RADIUS_METERS` | scraper.js | Already an env var — keep |
| Clery CSV column mapping | seed.js, import route | Campus-configurable column map |

### Planned approach
- Introduce a `campus.config.js` file in the backend as the single source of truth for all campus-specific settings
- Expose a `GET /api/config` endpoint returning the public-facing config (name, coordinates, PD URL)
- Frontend fetches config on app load and replaces all hardcoded strings dynamically
- Deploying to a new campus = editing one config file, nothing else

---

## v2.1 — PostgreSQL / Supabase Migration

### What changed

**`backend/db.js` — unified async database layer**
Complete rewrite. Exports a consistent async interface (`db.all`, `db.get`, `db.run`, `db.upsertSetting`) that works against either backend:
- **PostgreSQL (production):** Activated when `DATABASE_URL` is set. Uses `pg` Pool, converts `?` placeholders to `$N`, transforms snake_case result keys → camelCase so all existing frontend/API code continues to work unchanged. `pg` bigint type (returned by `COUNT(*)`) is parsed to JS `number`.
- **SQLite (local dev):** Uses `better-sqlite3`. Creates tables with snake_case column names (matching the Supabase schema), applies the same snake→camelCase transform on results, handles `RETURNING id` via `.get()`.

**Column names snake_case in SQL everywhere**
All SQL query strings across all route files, seed.js, scraper.js, geocoder.js, and campus.config.js were updated from camelCase to snake_case column names (`caseNumber` → `case_number`, `dateOccurred` → `date_occurred`, `aiSummary` → `ai_summary`, etc.). JavaScript property access patterns remain camelCase because of the db-layer transform.

**All DB calls converted to async/await**
Every `db.prepare(...).all()` / `.get()` / `.run()` call across all files was replaced with `await db.all()` / `await db.get()` / `await db.run()`. All route handlers are now `async` functions with `try/catch` error handling.

**`campus.config.js` — cached-config pattern**
`getConfig()` remains synchronous (for use as an inline call anywhere). New `loadConfig()` async function loads settings from the DB and writes to a module-level cache. Called once during `init()` before anything else. `setConfig()` now async, writes via `db.upsertSetting()`, then refreshes the cache.

**`seed.js` — async, snake_case columns, no SQLite transaction**
`db.transaction()` (SQLite-specific) removed; replaced with a simple `for` loop and `await db.run()`. Named parameters (`@nature`) replaced with positional `?` parameters.

**`supabase/schema.sql` — indexes added**
Added `CREATE INDEX IF NOT EXISTS` for status, severity, date_occurred, event_number, case_number, coordinates, and incident_id. Partial index on (lat, lng) filters to geocoded rows only (used by `/api/incidents/map`).

**`pg` added to backend/package.json**
Available for both Vercel serverless deployment (root package.json) and standalone Railway-style deployment (backend/package.json).

### Deployment instructions
1. Create a Supabase project — copy the connection string from Project Settings → Database
2. Run `supabase/schema.sql` in the Supabase SQL Editor
3. In Vercel, set environment variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (optional), `FRONTEND_URL`
4. Deploy: `vercel --prod` from the project root

---

## v2.0 — Vercel Deployment Setup

### What was added

**`backend/app.js` — Express app extracted for serverless use**
The Express application and initialization logic were extracted from `server.js` into a new `app.js` module that exports `{ app, init }`. `server.js` is now a thin wrapper that calls `init()` and `app.listen()` for local development.

This separation is required for Vercel's serverless function model: the entry point (`api/index.js`) must export a request handler, not start a TCP server.

**`api/index.js` — Vercel serverless entry point**
Routes all `/api/*` requests to the Express app. Calls `init()` once per cold start (seeding, geocoding, and EPD polling) and awaits it before handling the first request. Subsequent requests reuse the same initialized instance within the same function lifetime.

**Root `vercel.json` — monorepo deployment config**
- Builds the frontend (`cd frontend && npm install && npm run build`)
- Serves static output from `frontend/dist/`
- Routes `/api/*` to the serverless function at `api/index.js`
- Routes everything else to `index.html` (SPA fallback)
- Cron job at `*/10 * * * *` polls EPD via `POST /api/scraper/poll`

**`supabase/schema.sql` — PostgreSQL schema for production**
Documents the full database schema (incidents, incident_notes, settings) in standard SQL for anyone deploying with Supabase instead of SQLite. Column names follow PostgreSQL conventions (snake_case).

**Root `package.json`** — declares Node 18 engine requirement and production dependencies (`pg` for PostgreSQL support).

### Why
The local dev setup (SQLite + `node server.js`) works well for development but has no deployment path. This structure makes the app one `vercel --prod` command away from a live public URL, with no backend infrastructure to manage.

---

## v1.9 — Voice Dictation: Cross-Browser Whisper Fallback

### What changed

**Automatic browser detection with two transcription paths**

The mic button now detects at runtime which path to use:

- **Chrome / Edge** — Web Speech API (free, real-time streaming). Words are appended to the textarea as each sentence is finalized. No change from v1.8 behavior.
- **Safari / Firefox** — MediaRecorder + OpenAI Whisper (`whisper-1`). Dispatcher records the full clip, clicks stop, a spinning "transcribing" indicator appears for ~1–3 seconds, then the full transcript is appended at once. Requires `OPENAI_API_KEY` in `backend/.env`.

**New backend route: `POST /api/transcribe`**
Accepts a multipart audio upload (webm, m4a, ogg, wav up to 25MB), forwards it to OpenAI's Whisper API with `language: en`, and returns `{ text }`. If `OPENAI_API_KEY` is missing the route returns a 500 with a clear error. `multer` (already a dependency) handles the upload with in-memory storage — no temp files on disk.

**MicButton states (updated)**
- Idle: gray mic icon
- Listening: red pulsing stop square (both paths)
- Transcribing: blue spinning indicator + "transcribing" label below (Whisper path only)
- Error: button disables and tooltip shows the reason (permission denied, transcription failed)

**`.env.example` updated** to document `OPENAI_API_KEY`.

### Performance note
Safari users will experience a batch transcription UX (record → stop → wait → text appears) rather than real-time streaming. Whisper accuracy is generally higher than the Web Speech API. The ~1–3 second delay is inherent to the batch approach and is communicated via the transcribing spinner.

---

## v1.8 — Voice Dictation for Notes

### What was added

**`MicButton` component** (`frontend/src/components/MicButton.tsx`)
A reusable mic button backed by the browser's native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). No API key, no cost, no external dependency. Works in Chrome and Edge; renders nothing in browsers that don't support it (Firefox, Safari) so it degrades silently rather than showing a broken button.

Behavior:
- Click once → starts listening (button turns red and pulses, `continuous: true` so it keeps going through pauses)
- Each sentence the dispatcher finishes is appended to the existing text with a space
- Click again → stops (square stop icon while active, mic icon while idle)
- If microphone permission is denied, the button disables itself and shows a tooltip explaining why

**Integrated into two locations:**
1. **Resolution note prompt** (Dashboard queue cards) — mic button sits inline to the right of the resolution textarea. Dispatcher can dictate their resolution summary hands-free before confirming.
2. **Dispatcher notes** (Incident Detail modal) — mic button stacked above the Save button to the right of the notes textarea. Placeholder updated to mention voice input.

### Design rationale
Dispatchers on shift are often on the phone or radio simultaneously. Requiring typed notes creates friction at exactly the wrong moment. Voice dictation lets a dispatcher speak their resolution summary or incident note while still managing other communications. The Web Speech API was chosen over Wispr Flow (system-level, requires installation) or cloud STT APIs (cost, latency, data privacy concerns) because it runs entirely in the browser, works offline after page load, and requires zero configuration from a campus deploying the tool.

---

## v1.7 — Map Pin Status Differentiation

### What changed

**Three distinct pin states on the map**
- **Open** — colored dot by severity (unchanged: red/orange/yellow/green)
- **Responding (in-progress)** — purple pin with an expanding pulse ring (`@keyframes map-pin-pulse`). The ring scales from 1× to 3.4× over 1.8 seconds and fades out, then repeats. The pin glows purple. This makes actively-responding incidents immediately visible on the map even at a glance.
- **Resolved** — small, muted gray dot at reduced opacity. Visually recedes so closed incidents don't compete with active ones for attention.

**Popup status pills**
The incident popup now shows status as a colored pill (blue for open, purple for in-progress, gray for resolved) matching the dashboard styling. In-progress popups include a small purple dot before the "In Progress" label for additional clarity.

**Pin legend in map panel**
Added a compact "Pin Legend" section to the map header card showing what each pin style means. Uses a live `animate-ping` Tailwind demo for the Responding entry so the legend is self-explaining.

### Design rationale
A dispatcher glancing at the map should immediately see which incidents are active and which already have someone responding. The pulsing purple ring is borrowed from real-world CAD map conventions (active dispatch shown with a beacon). Resolved incidents are kept on the map but visually subordinated — they provide context without competing for attention.

---

## v1.6 — Resolution Workflow, In-Progress Visual, Resolved Today

### What changed

**Resolution now requires a note**
Clicking "✓ Resolve" on a Dashboard queue card no longer immediately resolves the incident. Instead, the card expands inline showing a textarea labeled "Resolution summary — what happened? Who responded?" The dispatcher must enter a non-empty note before "Confirm Resolve" becomes active. On confirm, the note is saved to `incident_notes` and then the status is set to resolved. Canceling leaves the incident unchanged. This creates an audit trail for every closed incident — critical for Clery Act compliance and shift handoffs.

**In-progress visual distinction**
In-progress cards now render with a purple tinted background (`bg-purple-50`) and purple border instead of the default white/gray. The "→ In Progress" button label changed to "→ Responding" to be clearer about what it means. Once in-progress, a pulsing "Responding ×" button replaces it — clicking it toggles the incident back to open if the dispatcher made a mistake or the response is being reassigned. The × makes the toggleable nature obvious without needing a separate "Cancel" button.

**Resolved Today section**
A new "✓ Resolved Today" card appears in the Dashboard right column when at least one incident has been closed during the current calendar day. Shows up to 6 entries: incident type (struck through), location, and time since resolution. Clicking any entry opens the full detail modal. Uses `resolvedAt` timestamp (added in this version) so the section only shows incidents actually closed today — not just incidents that occurred today.

**`resolvedAt` DB column**
Added `resolvedAt TEXT` to the incidents table via migration. Set to `datetime('now')` (UTC) when status is PATCHed to "resolved"; cleared to NULL if an incident is re-opened. Frontend `Incident` type updated to include optional `resolvedAt`.

### Design rationale
- Required resolution note over optional: optional notes are never filled in during a busy shift. Making it required is a minor friction that prevents silent closes and gives the next dispatcher context.
- Inline prompt on the card (not a separate modal) keeps the dispatcher in the queue view — they don't lose their place.
- Strikethrough + muted style in Resolved Today signals closure without removing context.

---

## v1.5 — Bug Fix: Map "Today" Filter Drops Evening Incidents

### Problem

After 5:00 PM Pacific time, the map's "Today" filter would show zero incidents — and any EPD incident from that evening would display "just now" on the Dashboard instead of an elapsed time.

**Root cause:** EPD timestamps are Pacific local time (`"04/08/2026 05:19:04 PM"`). Node.js on a Pacific Mac parses this via `new Date()` as Pacific local, converting it to `"2026-04-09T00:19:04.000Z"` (midnight UTC = next calendar day). The map filter used `.slice(0, 10)` on the stored UTC string, yielding `"2026-04-09"`. Meanwhile, `toDateStr(new Date())` also used `.toISOString().slice(0, 10)` — which flips to `"2026-04-09"` at 5 PM Pacific. So after 5 PM:
- Incidents from earlier today (before 5 PM Pacific) were stored as `"2026-04-08T..."` → filter saw them as "yesterday"
- Incidents from the current evening were stored as `"2026-04-09T..."` → filter matched "today" (UTC April 9)
- Net result: selecting "Today" showed only post-5-PM incidents, and anything from the morning disappeared

**"just now" display:** The same UTC-next-day offset meant an evening EPD incident briefly had a UTC timestamp slightly ahead of the current UTC clock → `timeAgo` showed "just now" until the local clock caught up.

### Fix

`MapView.tsx`: Changed `toDateStr()` to build the date string from local year/month/day components instead of `.toISOString()`. Added `incidentLocalDate()` which converts any stored timestamp (ISO UTC or legacy space-separated) to the user's local calendar date before comparison. Filter now uses `incidentLocalDate(i.dateOccurred)` against local `dateFrom`/`dateTo` — so "Today" always means the user's current calendar date regardless of UTC rollover time.

The scraper and `timeAgo` fixes from v1.4 are still correct and complementary — storing full ISO UTC strings ensures elapsed-time math in the browser is accurate. The map filter now consistently converts those UTC strings back to local dates before comparing.

---

## v1.4 — Bug Fix: Timestamp Timezone & Map Pin

### Problems fixed

**`-127m ago` on Dashboard** (and any negative time-ago display)

Two sources of the same root cause — UTC timestamps being parsed as local time by the browser:

1. `SubmitIncident.tsx` used `new Date().toISOString().slice(0, 16)` as the default `datetime-local` input value. `toISOString()` produces a UTC string (e.g. `"2026-04-08T22:55"`); without a `Z` suffix, browsers parse this as *local* time, making the incident appear to be ~7 hours in the future for Pacific-timezone users. Fixed by adjusting for the local timezone offset before slicing: `d.setMinutes(d.getMinutes() - d.getTimezoneOffset())`.

2. `scraper.js` `parseEPDDate()` stripped the ISO `T` separator with `.replace('T', ' ')`, producing `"2026-04-08 18:02"`. Space-separated datetime strings are not a valid ISO format — parsing is browser-dependent and often treated as local rather than UTC. Fixed by returning `d.toISOString()` directly (full ISO 8601 with `Z`), which is always unambiguous.

3. `timeAgo()` in `Dashboard.tsx` had no guard for negative diffs. Even after the above fixes, a future timestamp (e.g. a scraper race condition or a manually entered future time) would render as a negative number. Added `if (diff < 0) return 'just now'` as a defensive fallback.

**Missing map pin for today's incidents**

When an incident is submitted via the manual form, geocoding runs asynchronously after the POST response. The map endpoint (`GET /api/incidents/map`) only returns rows with `lat IS NOT NULL AND lng IS NOT NULL` — so the pin won't appear until geocoding completes. The map already auto-refreshes every 15 seconds, so pins appear shortly after submission. If geocoding fails (address not recognized by Nominatim), the incident will never appear on the map — this is a known limitation documented below.

### Design rationale
- Root cause fixed at the source (form default, scraper output) rather than patching the display function alone — prevents the same bad data from surfacing elsewhere (Analytics date filters, Incident Log sort order, map date filters)
- `timeAgo` defensive clamp kept as a belt-and-suspenders fallback

---

## v2.6 — Dashboard Dispatcher Enhancements & Incident Log Print/Filter

### What was added

**Dashboard — dispatcher workflow features**
- **Search bar** — live text filter across incident nature, location, and case number in the active queue
- **Source filter pills** — filter queue by data source: All / EPD Live / UOPD CSV / Imported / Manual
- **Age sort toggle** — switch between severity-first (default) and oldest-first ordering so dispatchers can catch incidents that have been sitting too long
- **Acknowledge button** — one-click transition from `open` → `acknowledged` (yellow badge) directly on queue cards, giving dispatchers a way to claim an incident without fully opening it
- **Quick-add modal** — "Log Incident" button opens a slide-in form to submit a new incident without leaving the dashboard; on success the new card appears in the queue immediately
- **Print shift summary** — generates a formatted HTML report of all incidents from the past 8 hours, opens in a new window, and triggers the browser print dialog

**Incident Log — date range filter and print**
- **From/To date inputs** — client-side date range filter applied on top of existing server-side severity/status filters; month groupings update live as dates change
- **Clear button** now also resets date range fields
- **Print button** — generates a formatted HTML report of the currently filtered view (all active filters — search, severity, status, date range — reflected in the report header and record count)

### Design rationale
The Dashboard additions were driven by a dispatcher's workflow: acknowledge to claim, search to find, print to hand off. The source filter addresses the mixed-provenance nature of the data (EPD live feed vs. historical CSV vs. imports). The Incident Log print feature allows exporting any filtered slice (e.g., all critical incidents last month) for documentation or supervisor review.

---

## v2.5 — EPD Auto-Resolve via Disposition Feed

### What changed

**Disposition-driven map pin lifecycle**
The EPD scraper now reads the `disposition` field from the feed to automatically drive incident status — no dispatcher action required for live EPD incidents:

- **New incident, empty disposition** → inserted as `in-progress` → purple pulsing pin on map (units responding)
- **New incident, disposition already filled** → inserted as `resolved` → muted gray pin (call already cleared before we polled)
- **Re-poll: previously in-progress incident now has a disposition** → status set to `resolved`, `resolved_at` timestamp written → pin changes to gray automatically

The map auto-refreshes every 15 seconds, so pin transitions happen without a page reload.

### Design rationale
The EPD feed's disposition field is the authoritative signal for whether a call is active or cleared. Empty = still on scene. Filled (CLR, GOA, UTL, ARR, etc.) = units have left. Wiring this directly to the `status` column means the dispatcher map reflects real-world EPD state without anyone having to touch the dashboard.

---

## v2.4 — Location Alias Map & Address Normalizer

### What was added

**`backend/locationAliases.js`**
A new module with two responsibilities:
- **`KNOWN_COORDS`** — hardcoded lat/lng for Eugene/UO-area intersections and vague entries (e.g. `E 15th Ave/University St`, `Off Campus Location`) that Nominatim cannot resolve on its own. Covers all 15 intersection formats and 2 vague entries found in the UOPD Clery log.
- **`normalizeLocation()`** — fixes abbreviated address strings before sending to Nominatim: strips "Blk" block prefix, expands bare street names missing their type suffix (`Kincaid` → `Kincaid St`, `Franklin` → `Franklin Blvd`, etc.), and converts slash-format intersections to `&` format which Nominatim handles better.
- **`lookupAlias()`** — returns `{lat,lng}` if address is in the alias map, `null` if it's a known-unresolvable entry, or `undefined` if not in the map (proceed to Nominatim).

**`backend/geocoder.js` updated**
`geocodeAddress()` now checks the alias map first, then normalizes the address, then falls through to Nominatim. Result: 287 of 290 incidents geocoded (the remaining 3 are genuinely unresolvable entries like "General Location").

**Bulk geocoding run locally**
After deploying the alias map, `geocodeAllPending` was run directly against Supabase from a local script, bypassing Vercel's 10-second serverless timeout. All 287 geocodable incidents now have coordinates in the database.

### Why
The map was showing only ~160 of 290 incidents. Root cause was two separate issues: (1) Vercel's serverless timeout killing the geocoding background process after ~10 locations per cold start, and (2) Nominatim failing on slash-format intersections and abbreviated addresses. The alias map fixes (2); running locally fixed (1).

---

## v2.3 — Manual Incident Entry on Import Page

### What changed
Added a **"Report Single Incident"** section to the bottom of the Import page (`/import`). Dispatchers can now log a single incident by typing directly — no need to create a CSV.

**Form fields:** Incident Type (required), Location (required), Date & Time Occurred, Description.

On submission, POSTs to `POST /api/incidents` — same pipeline as before. AI classification and geocoding run automatically in the background. A success confirmation appears inline for 4 seconds after submit.

### Why
The manual submission form was removed in v0.9 in favor of bulk import. This restores single-incident entry as a secondary section on the Import page rather than a dedicated nav page — keeping the nav focused on the dispatcher's primary workflow while still covering the edge case of on-site incidents not in any feed.

---

## v2.2 — OpenAI SDK Swap & Vercel Fixes

### What changed

**AI provider switched from Anthropic to OpenAI**
- `backend/classifier.js` — replaced `@anthropic-ai/sdk` with `openai`, switched model from `claude-haiku-4-5` to `gpt-4o-mini` for incident classification
- `backend/routes/import.js` — replaced Anthropic document content block (PDF extraction) with OpenAI `gpt-4o` vision call
- `backend/package.json` and root `package.json` — removed `@anthropic-ai/sdk`, added `openai ^4.0.0`
- `backend/.env` — renamed `ANTHROPIC_API_KEY` to `OPENAI_API_KEY`

**`better-sqlite3` moved to `devDependencies`**
The native C++ addon can't compile on Vercel's build environment. Since `DATABASE_URL` is always set in production (Supabase), the SQLite branch never runs on Vercel. Moving it to `devDependencies` prevents build failures without affecting local development.

**Vercel cron schedule fixed**
Changed scraper cron from `*/10 * * * *` to `0 8 * * *` — Vercel Hobby plan only allows daily crons. Frequent polling handled externally via cron-job.org.

**Node.js engine updated**
Root `package.json` engine requirement updated from `18.x` to `24.x` to match Vercel's current supported runtime.

**Import page icons**
Replaced all emoji icons on the Import page (⬆️ 📄 🤖 💾 ✓) with clean Heroicons SVGs for a more polished, production-ready appearance.

---

## Known Limitations & Future Work

### Scraper parser is EPD-specific

The live dispatch feed scraper (`backend/scraper.js`) is partially productizable but not fully. The configurable parts — dispatch URL, campus center/radius, city/state — work for any school. However, the HTML parser (`parseDispatchLog`) assumes Eugene PD's specific table structure: fixed column order (callTime, dispatchTime, nature, disposition, eventNumber, location, priority, caseNum), an EPD-specific checkbox offset, and all-caps abbreviation expansion (BLVD, AVE, ST, etc.).

If another school's PD publishes a dispatch log in the same HTML table format as Eugene PD, the scraper works as-is. Most PDs use different formats or JSON APIs.

**What needs to be done:** Two paths forward:
1. **Configurable column map** — expose column index assignments in `campus.config.js` so each deployment can describe its PD's table structure without touching code
2. **AI-powered parsing** — pass the raw HTML to GPT-4o and let it extract the structured data, the same way PDF import works. This would handle any format automatically with no configuration required and is the more productizable long-term approach.

---

### Geocoding on Vercel: serverless timeout

Geocoding runs as a background process triggered on server startup (`geocodeAllPending` in `app.js`). On Vercel, serverless functions time out after 10 seconds — the geocoding loop (1 req/sec via Nominatim rate limit) gets killed before completing for large batches. The current workaround is that map pins fill in gradually as Vercel re-invokes the function on each request, eventually geocoding all locations over multiple cold starts.

**What needs to be done:** Move `geocodeAllPending` out of the startup path and into a dedicated cron endpoint (e.g. `GET /api/geocode/run`) called on a daily schedule. This decouples geocoding from request latency, survives Vercel's timeout limit for daily incremental batches, and makes the process observable (can return progress counts). For the initial bulk geocode of existing data, the endpoint can be called manually once from a local script or curl.

---

## Known Limitations (existing)

### No real-time resolution feedback from UOPD or EPD

The system currently has no way to automatically mark an incident as resolved based on external data sources. Both data feeds have this constraint:

- **UOPD Clery log** — Published as a periodic static PDF/CSV for compliance purposes. It reflects the state of cases at the time of export, not live case status. There is no API or real-time endpoint.
- **EPD dispatch log** — The public EPD feed (`coeapps.eugene-or.gov/epddispatchlog`) shows active and recent calls but does not include disposition or resolution data. An incident disappearing from the feed does not reliably signal resolution — it may simply have aged off the display window.

**What this means in practice:** Incidents imported from the Clery CSV or captured via the EPD scraper will remain at their initial status (`open`) until a dispatcher manually updates them. Without a direct integration with UOPD's internal CAD system (e.g., PremierOne or Axon Records), which is not publicly accessible, automatic resolution is not achievable.

**Current workaround:** Dispatchers can manually resolve any incident by opening the detail modal from the Dashboard or Incident Log and changing the status dropdown, or by clicking the inline "✓ Resolve" button on Dashboard queue cards. This works but relies entirely on dispatcher action rather than source-of-truth data.

**Future path:** A formal integration with UOPD's CAD system via a vendor API or data export agreement would close this gap. Alternatively, if UOPD began publishing a structured, timestamped disposition feed (rather than a compliance report), the scraper pipeline could be extended to consume it.

---

## Current Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS |
| Mapping | react-leaflet v4, leaflet.markercluster, OpenStreetMap |
| Charts | Recharts |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 |
| AI | Claude API (claude-haiku-4-5) — classification & prioritization |
| Geocoding | Nominatim (OpenStreetMap) — free, no API key |
| Live data | EPD public dispatch log — polled every 10 minutes |

## Current Routes

| Path | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Dispatcher triage — active queue, hotspots, recent feed |
| `/log` | Incident Log | Full historical record, month-grouped |
| `/map` | Map | Geographic view with date + severity filters, spiderify |
| `/analytics` | Analytics | Time intelligence, trends, type/severity breakdowns |
| `/import` | Import Incidents | Bulk import via CSV or PDF with preview and deduplication |

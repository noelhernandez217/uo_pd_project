# CampusSafe — Project Details

Technical reference covering the full stack, every feature's implementation, and how the system fits together.

---

## Requirements Assessment

### Core Requirements

| Requirement | Status | Notes |
|---|---|---|
| Help manage, prioritize, or analyze incidents more intelligently | ✅ Exceeded | Dispatcher triage dashboard, AI severity sorting, hotspot detection, time-open indicators, stalled incident visibility |
| Replace/augment spreadsheet workflow | ✅ Yes | Bulk CSV/PDF import replaces manual entry; live EPD feed adds data automatically |
| Must be productizable across campuses | ✅ Exceeded | Full campus config UI with geocoded university search, curated dispatch feed dropdown, all hardcoded values externalized |
| Use AI tools where appropriate | ✅ Yes | Claude Haiku for classification on every incident, Claude Sonnet for PDF extraction, heuristic fallback if no API key |
| Be ready to explain AI usage | ✅ Yes | PROJECT_DETAILS.md documents exactly how each model is used, why, and what the fallback does |

### Core Product Loop

| Step | Status | Notes |
|---|---|---|
| Incident submission | ⚠️ Partial | Manual submission form was removed and replaced with bulk Import (CSV/PDF). Single incident entry no longer exists as a dedicated page — a quick-add modal from the Dashboard was noted as the right replacement but not built. This is the one honest gap. |
| AI classification | ✅ Yes | Every incident classified on ingest — severity, summary, recommendation |
| Dashboard with filters + severity | ✅ Exceeded | Severity-sorted active queue, 14-day window, inline status buttons, dispatcher notes, time-open indicators |
| Trends/Analytics | ✅ Exceeded | Time intelligence (peak hour, busiest day/month), hour-of-day chart, day-of-week chart, volume trends, type/severity breakdowns |

### Key Features

| Feature | Status | Notes |
|---|---|---|
| Incident submission form | ⚠️ Replaced | Removed in v0.9. Bulk Import (CSV/PDF) covers real-world data entry more accurately. A lightweight quick-add modal from the Dashboard would close this gap without restoring the full page. |
| AI classification & prioritization | ✅ Yes | Claude Haiku on every incident; severity, summary, and recommended action generated automatically |
| Live dashboard with severity color-coding | ✅ Yes | Color-coded severity bars, badge labels, and sort order on every queue card |
| Incident detail view | ✅ Exceeded | Notes, AI analysis panel, time-open indicator, show on map, inline status controls |
| Status management | ✅ Yes | Inline one-click buttons on queue cards and full dropdown in the detail modal |
| Multi-campus support | ✅ Exceeded | Full settings UI with geocoded university search and curated dispatch feed selector — not just a data field |

### Development Guidelines

| Guideline | Status |
|---|---|
| Changelog maintained with rationale for every change | ✅ Documented through v1.3 |
| Dispatcher utility as top priority | ✅ All Dashboard features evaluated against dispatcher perspective |
| Core product loop prioritized over peripheral features | ✅ Submission → Classification → Dashboard → Analytics intact |
| Productizability | ✅ Campus config layer fully externalized in v1.3 |
| Polish and UX | ✅ Animations, skeleton loading, frosted glass, toast notifications added in v1.2 |

### Known Gaps

**Scraper parser is EPD-specific**
The dispatch URL, campus center/radius, and city/state are all configurable. But `parseDispatchLog` in `scraper.js` assumes Eugene PD's exact HTML table structure and column order. A different school's PD feed would require either a configurable column map in `campus.config.js` or an AI-powered HTML parser (like the PDF import pipeline) that works with any format automatically.

**Geocoding on Vercel (serverless timeout)**
Geocoding runs as a background process on server startup. Vercel serverless functions time out after 10 seconds, so large batches never fully complete in a single invocation — pins fill in gradually across multiple cold starts instead. The fix is to move `geocodeAllPending` into a dedicated cron endpoint (`GET /api/geocode/run`) on a daily schedule, decoupling it from request handling entirely.

**Multi-tenancy (multiple campuses in one instance)**
The current build is **single-instance by design** — one deployment serves one campus. This is analogous to how WordPress works: each university runs their own instance with their own database, settings, and data. Switching the campus in Settings overwrites the existing configuration rather than adding a second profile alongside it.

This is a deliberate architectural decision for the current scope. The realistic deployment model for a tool like this is one instance per institution — each campus safety team manages their own data, their own scraper, and their own settings without visibility into another school's incidents.

**Why multi-tenancy is a future consideration, not a current gap:**
A SaaS multi-tenant model (one instance, many schools) introduces significant complexity — data isolation between tenants, per-campus scraper scheduling, billing, and access control. That's a product-level decision, not just a technical one.

**Plan to implement if needed:**
1. **Database** — add a `campus_id` UUID column to the `incidents`, `incident_notes`, and `settings` tables. Each campus gets a row in a new `campuses` table with its own config.
2. **Backend** — `campus.config.js` refactored to support multiple cached configs keyed by `campus_id`. All SQL queries in every route gain a `WHERE campus_id = ?` scope. The scraper runs a separate poll loop per enabled campus.
3. **Auth layer** — each campus admin authenticates and receives a session scoped to their `campus_id`. Without auth, multi-tenancy has no data isolation.
4. **Frontend** — campus switcher in the navbar for super-admin users. All dashboard, map, analytics, and log views filtered by the active campus context.

Estimated effort: 2-3 days for a functional implementation; longer with a proper auth layer. Not in scope for the current build.

**Manual incident submission**
The one feature listed in the original requirements that is not fully present is a **single-incident manual submission form**. The decision to replace it with bulk Import was deliberate — dispatchers don't type individual incident reports during a shift, and the live EPD feed covers real-time data entry automatically. However, the spec lists it as a key feature and it is step 1 of the core product loop. The recommended fix is a lightweight "Report Incident" modal accessible from the Dashboard, which would satisfy the requirement without restoring a dedicated page.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [API Route Reference](#3-api-route-reference)
4. [AI Classification](#4-ai-classification)
5. [CSV Data Seeding](#5-csv-data-seeding)
6. [Geocoding](#6-geocoding)
7. [EPD Live Scraper](#7-epd-live-scraper)
8. [Dashboard](#8-dashboard)
9. [Incident Log](#9-incident-log)
10. [Map View](#10-map-view)
11. [Analytics](#11-analytics)
12. [Import (CSV & PDF)](#12-import-csv--pdf)
13. [Incident Notes](#13-incident-notes)
14. [Toast Notifications](#14-toast-notifications)
15. [Inline Status Updates](#15-inline-status-updates)
16. [Show on Map](#16-show-on-map)
17. [Campus Settings & Search](#17-campus-settings--search)
18. [UI Animations & Polish](#18-ui-animations--polish)

---

## 1. Architecture Overview

CampusSafe is a full-stack web application split into two independent processes that communicate over HTTP.

```
┌─────────────────────────────────────────────┐
│  Frontend (React + TypeScript, port 5173)   │
│  Vite dev server proxies /api → backend     │
└────────────────────┬────────────────────────┘
                     │ HTTP (REST)
┌────────────────────▼────────────────────────┐
│  Backend (Node.js + Express, port 3001)     │
│  ├── SQLite database (incidents.db)         │
│  ├── Claude API (Anthropic SDK)             │
│  ├── Nominatim geocoder (OpenStreetMap)     │
│  └── EPD dispatch log scraper (Cheerio)     │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| Frontend framework | React | v18 with TypeScript |
| Build tool | Vite | Handles HMR, proxies `/api` to backend |
| Styling | Tailwind CSS | Utility-first; no component library |
| Routing | React Router | v6, `BrowserRouter` wrapping |
| HTTP client | Axios | Centralized in `src/api/` modules |
| Mapping | react-leaflet | v4 (v5 requires React 19 — incompatible) |
| Map tiles | OpenStreetMap | No API key required |
| Clustering | leaflet.markercluster | Spiderify-only mode (`clusterRadius: 1`) |
| Charts | Recharts | Line, bar, pie charts in Analytics |
| Backend runtime | Node.js + Express | REST API, no authentication layer |
| Database | SQLite via better-sqlite3 | Synchronous API, zero-config file storage |
| AI | Anthropic SDK | claude-haiku-4-5 for classification, claude-sonnet-4-6 for PDF extraction |
| HTML scraping | Cheerio | jQuery-like DOM traversal of EPD dispatch HTML |
| File uploads | Multer | Memory storage, 20MB limit |
| CSV parsing | csv-parse | Synchronous `parse()` for seed + import |

### Frontend Structure

```
src/
├── api/           — Axios wrappers (incidents.ts, config.ts)
├── components/    — Reusable UI (Navbar, SeverityBadge, StatusBadge, IncidentDetail, Toast, ClusterLayer)
├── context/       — CampusContext (config provider)
├── pages/         — Route-level components (Dashboard, IncidentLog, MapView, Analytics, ImportIncidents, Settings)
└── index.css      — Tailwind directives + custom CSS keyframe animations
```

### Backend Structure

```
backend/
├── server.js          — Express app entry point, startup sequence
├── db.js              — SQLite connection + schema creation + migrations
├── campus.config.js   — Dynamic config module (reads from settings table)
├── seed.js            — One-time CSV import on first startup
├── classifier.js      — Claude API classification + heuristic fallback
├── geocoder.js        — Nominatim geocoding with rate limiting
├── scraper.js         — EPD dispatch log polling
├── proximity.js       — Haversine distance + campus radius check
└── routes/
    ├── incidents.js   — CRUD for incidents
    ├── notes.js       — Per-incident notes
    ├── trends.js      — Aggregated analytics queries
    ├── import.js      — CSV/PDF file upload and import
    └── config.js      — Campus configuration GET/PATCH
```

### Startup Sequence

When `node server.js` runs:
1. SQLite database is opened; schema and migrations are applied (idempotent)
2. `seedDatabase()` — if the incidents table is empty, the Clery CSV is parsed and inserted synchronously
3. `geocodeAllPending()` — starts a background async loop geocoding any incidents without coordinates at 1 req/sec
4. `startPolling()` — schedules the EPD scraper to run every 10 minutes
5. Express begins listening on port 3001

---

## 2. Database Schema

All tables are created in `db.js` using `CREATE TABLE IF NOT EXISTS`, making the schema fully idempotent.

### `incidents`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `nature` | TEXT | Incident type (e.g., "Theft 2", "Suspicious Activity") |
| `caseNumber` | TEXT | UOPD case number from Clery log |
| `dateReported` | TEXT | ISO-like string: `"2026-01-15 14:30"` |
| `dateOccurred` | TEXT | ISO-like string; used for queue sorting and time calculations |
| `location` | TEXT | Free-text address or building name |
| `disposition` | TEXT | Outcome string from Clery log |
| `severity` | TEXT | `"low"`, `"medium"`, `"high"`, `"critical"` |
| `aiSummary` | TEXT | One-sentence Claude-generated summary |
| `aiRecommendation` | TEXT | One-sentence Claude-generated action |
| `status` | TEXT | `"open"`, `"in-progress"`, `"resolved"` |
| `campus` | TEXT | Campus name (set from `getConfig().campusName`) |
| `createdAt` | TEXT | SQLite `datetime('now')` default |
| `lat` | REAL | Populated by background geocoder |
| `lng` | REAL | Populated by background geocoder |
| `source` | TEXT | `"uopd_csv"`, `"epd_live"`, `"import_csv"`, `"import_pdf"` |
| `eventNumber` | TEXT | EPD event number for deduplication of live feed |
| `distanceFromCampus` | REAL | Haversine distance in meters from campus center |

### `incident_notes`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `incidentId` | INTEGER | Foreign key → `incidents.id`, CASCADE DELETE |
| `text` | TEXT | Note body |
| `createdAt` | TEXT | SQLite `datetime('now')` default |

### `settings`

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | Config key (e.g., `"campusName"`, `"campusLat"`) |
| `value` | TEXT | Config value stored as string; cast to correct type on read |

---

## 3. API Route Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/incidents` | All incidents with optional query filters: `status`, `severity`, `campus`, `type`, `search` |
| GET | `/api/incidents/map` | Incidents with `lat`/`lng` only (for map rendering) |
| GET | `/api/incidents/:id` | Single incident |
| POST | `/api/incidents` | Create incident (triggers Claude classification + background geocoding) |
| PATCH | `/api/incidents/:id/status` | Update status to `open`, `in-progress`, or `resolved` |
| GET | `/api/incidents/:id/notes` | All notes for an incident |
| POST | `/api/incidents/:id/notes` | Add a note |
| DELETE | `/api/incidents/:id/notes/:noteId` | Delete a note |
| GET | `/api/trends` | Aggregated analytics: by type, severity, status, day, totals |
| POST | `/api/import/preview/csv` | Parse CSV and return first 5 rows + count (no DB write) |
| POST | `/api/import/preview/pdf` | Extract records from PDF via Claude and return preview (no DB write) |
| POST | `/api/import/confirm` | Re-parse file, deduplicate, insert to DB, start background geocoding |
| GET | `/api/config` | Current campus configuration |
| PATCH | `/api/config` | Update campus configuration (persists to `settings` table) |
| GET | `/api/scraper/status` | Last poll time, incident count, how many were added |
| POST | `/api/scraper/poll` | Manually trigger an EPD poll cycle |
| GET | `/api/health` | `{ status: "ok", campus: "<campusName>" }` |

---

## 4. AI Classification

**File:** `backend/classifier.js`
**Model:** `claude-haiku-4-5-20251001`
**Triggered by:** New incident submission, EPD scraper, background import upgrade

### How it works

Every incident goes through classification to receive three AI-generated fields: `severity`, `aiSummary`, and `aiRecommendation`.

**Claude path** (when `ANTHROPIC_API_KEY` is set):
The classifier sends a structured prompt to Claude Haiku with the incident type, location, and description. The prompt instructs Claude to return a JSON object only — no markdown or explanation. The severity scale is defined in the prompt:
- `critical` — violent crime, weapons, assault, active medical emergency, sexual assault
- `high` — burglary, DUI, significant theft, threats, harassment
- `medium` — minor theft, trespassing, suspicious activity, vandalism, noise disturbance
- `low` — lost property, information-only, non-criminal matters

Claude responds with `{ "severity": "...", "aiSummary": "...", "aiRecommendation": "..." }`. The response is parsed with `JSON.parse()`.

**Heuristic fallback** (no API key, or Claude API failure):
A keyword-matching function scans the incident's `nature` field for terms like "assault", "robbery", "weapon" (critical), "burglary", "DUI" (high), "theft", "trespass" (medium), defaulting to "low". The summary is constructed from the nature and disposition strings. Recommendations are generic per severity level.

**Why two models are used:**
- **Haiku** (`claude-haiku-4-5`) is used for classification because it's fast and cheap — hundreds of incidents can be classified in a short time.
- **Sonnet** (`claude-sonnet-4-6`) is used for PDF extraction because it requires deeper document understanding and structured output from unformatted text.

### Bulk seeding vs. live classification
During initial CSV seeding, `classifyHeuristic()` is called instead of `classifyWithClaude()`. This avoids making 290+ API calls at startup and keeps cold-start time short. The live EPD scraper and import pipeline use the full Claude path, with heuristic as fallback.

---

## 5. CSV Data Seeding

**File:** `backend/seed.js`
**Triggered:** Once at startup if the incidents table is empty

### How it works

`seedDatabase()` checks the incident count. If zero, it reads `clery_crime_log_2026.csv` from the project root using Node's `fs` module, then parses it with `csv-parse/sync`'s synchronous `parse()` function.

**Column mapping:**
The Clery log CSV uses specific column names that are mapped to the database schema:
- `Nature` → `nature`
- `Case #` → `caseNumber`
- `Date Reported` → `dateReported`
- `Date/Time Occurred` → `dateOccurred`
- `General Location` → `location`
- `Disposition` → `disposition`

Both title-case and lowercase variants are checked (`r['Nature'] || r['nature']`) to handle format inconsistencies.

**Date normalization:**
Clery dates use the format `"03/29/26 @ 0254"`. A `parseDate()` function splits on `@`, parses the two-digit year (adding 2000), and reconstructs as `"YYYY-MM-DD HH:MM"`.

**Disposition-to-status mapping (`resolveStatus()`):**
Rather than marking all non-"Cleared" incidents as open, dispositions are explicitly mapped:
- `"Suspended. Inactive."` → `resolved`
- `"Other."` / `"Others."` → `resolved`
- `"Unfounded."` → `resolved`
- Anything starting with `"Cleared"` → `resolved`
- `"Open."` → `open`
- Any other disposition → `resolved` (conservative default)

This mapping was added after discovering that 241 incidents were incorrectly marked `open` on the initial seed because the original logic only checked for "Cleared".

All rows are inserted in a single SQLite transaction via `db.transaction()`, which is significantly faster than individual inserts.

---

## 6. Geocoding

**File:** `backend/geocoder.js`
**Service:** Nominatim (OpenStreetMap) — free, no API key
**Rate limit:** 1 request per second (Nominatim policy)

### How it works

`geocodeAddress(address)` appends the campus city and state (read from `getConfig()`) to the location string before querying Nominatim. For example, "1585 E 13th Ave" becomes `"1585 E 13th Ave, Eugene, OR"`. This dramatically improves geocoding accuracy since most location strings in the Clery log are campus-local references.

The request is made using Node's built-in `https` module (no external HTTP library) with a `User-Agent` header identifying CampusSafe.

`geocodeAllPending(db)` finds all incidents without coordinates, de-duplicates by location string, geocodes each unique location once, then applies the result to all incidents at that location via `UPDATE ... WHERE location = ?`. This reduces API calls from ~290 to ~100 for the initial dataset.

A 1,100ms sleep between requests respects Nominatim's rate limit.

**Why city/state is configurable:**
If another campus is configured (e.g., Oregon State University in Corvallis, OR), addresses from that campus's crime log would resolve incorrectly if "Eugene, OR" were still appended. The campus city and state are read from `getConfig()` at call time, so geocoding is always scoped to the active campus.

---

## 7. EPD Live Scraper

**Files:** `backend/scraper.js`, `backend/proximity.js`
**Source:** Eugene Police Department public dispatch log
**Poll interval:** Every 10 minutes

### How it works

`startPolling()` schedules `pollEPDLog()` to run immediately and then on a 10-minute interval via `setInterval`.

**Fetch:** `fetchHTML(url)` makes an HTTPS GET request to the configured `pdDispatchUrl` (from `getConfig()`). The URL can be changed in the Settings UI to point to any other police department's public dispatch log.

**Parse:** The HTML is loaded into Cheerio. The function walks every `<tr>` in the page's `<table>`, extracts cells, and maps them to fields: date, time, event number, nature, address, and agency. Rows with fewer than 7 cells are skipped.

**Address normalization:** EPD lists intersection addresses like `"RIVERWALK LP/GOODPASTURE LP, EUG"`. A `formatLocationForGeocoding()` function converts the `/` separator to ` & `, strips the city abbreviation, and formats as `"Riverwalk Lp & Goodpasture Lp, Eugene, OR"` for Nominatim.

**Proximity filter:** Each EPD incident is geocoded, then `isNearCampus()` computes the Haversine distance between the result and the campus center coordinates (from `getConfig()`). Only incidents within `campusRadiusMeters` (~0.75 miles by default) are imported. This is the primary filter that makes the EPD feed campus-relevant rather than city-wide.

**Deduplication:** The EPD event number is stored in the `eventNumber` column. Before inserting any row, the scraper checks `SELECT id FROM incidents WHERE eventNumber = ?`. If it exists, the row is skipped. This means re-polling never creates duplicates regardless of how many times a particular call appears in the feed.

**Classification:** Every qualifying EPD incident is passed through `classifyWithClaude()` before being saved.

**Status tracking:** `getStatus()` returns `{ lastPollTime, lastPollCount, lastPollAdded }`, which the Dashboard polls every 60 seconds to display the "EPD live · last synced" indicator.

**Manual trigger:** `POST /api/scraper/poll` allows triggering a poll cycle on demand (used for testing and verification).

### Haversine formula (proximity.js)

The Haversine formula calculates the great-circle distance between two lat/lng points on a sphere:

```
a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
distance = R * 2 * atan2(√a, √(1-a))
```

Where R = 6,371,000 meters (Earth's radius). Both campus center coordinates and the patrol radius are read from `getConfig()` at call time.

---

## 8. Dashboard

**File:** `frontend/src/pages/Dashboard.tsx`
**Route:** `/`
**Purpose:** Real-time dispatcher triage view

### How it works

On mount, `fetchAll()` calls `GET /api/incidents` (no filters) and stores the full incident list in state. A 60-second `setInterval` re-calls `fetchAll(true)` in polling mode.

**Active Queue:**
Open and in-progress incidents are filtered from the full list, then sorted by `SEVERITY_ORDER` (`critical: 0, high: 1, medium: 2, low: 3`). By default, only incidents whose `dateOccurred` falls within the past 14 days are shown. A `stalledCount` computed value tracks how many older open incidents exist; if any, an amber toggle link appears that expands the view to show all.

**New incident detection:**
A `knownIdsRef` (React ref, not state) stores a `Set<number>` of all incident IDs seen on the previous fetch. On polling fetches, any ID in the new data that isn't in `knownIdsRef` is considered new. A toast fires for each new incident with severity-matched type (`critical` → red, `high` → amber, anything else → info). The first fetch is silent — `knownIdsRef` starts as `null` and is initialized without firing toasts.

**Location Hotspots:**
Computed from incidents in the past 7 days. A `locationMap` groups incidents by `location` string. Locations with 2 or more incidents are returned, sorted by count, limited to 4. The worst-severity incident in each group determines the dot color.

**Recent Activity Feed:**
All incidents sorted by `dateOccurred` descending, limited to 12. Shown as a compact feed in the right column.

**EPD status indicator:**
A separate `fetch('/api/scraper/status')` runs on mount and every 60 seconds. The result populates the pulsing green "EPD live · last synced" label in the shift header.

**Skeleton loading:**
While `loading` is true, the page renders a structural skeleton that mirrors the real layout — a header row, four queue card placeholders, and a right column panel. Each skeleton element uses the `.skeleton` CSS class which applies a 1.5-second opacity pulse animation.

---

## 9. Incident Log

**File:** `frontend/src/pages/IncidentLog.tsx`
**Route:** `/log`
**Purpose:** Full historical archive with search and filtering

### How it works

`fetchIncidents()` calls `GET /api/incidents` with whatever filters and search term are currently set. The backend supports `?status=`, `?severity=`, `?campus=`, `?type=`, and `?search=` query parameters. The `search` parameter performs a LIKE query across `nature`, `location`, `caseNumber`, and `aiSummary`.

Results are sorted by `dateOccurred` descending on the frontend. They are then grouped into a `monthGroups` object keyed by `"YYYY-MM"` strings using `useMemo`.

**Month groups:**
Each group renders as a collapsible card. The header shows the month name, incident count, and a row of severity dot badges summarizing how many of each severity are in that month. A `Set<string>` called `expandedMonths` tracks which groups are open. The most recent month is auto-expanded on first load.

**Clicking a row** opens the `IncidentDetail` modal. `handleStatusChange()` updates the row in place without re-fetching.

---

## 10. Map View

**File:** `frontend/src/pages/MapView.tsx`
**Route:** `/map`
**Purpose:** Geographic visualization of geocoded incidents

### How it works

`GET /api/incidents/map` returns only incidents with non-null `lat` and `lng`. The response is stored in state. A 15-second `setInterval` re-fetches to pick up newly geocoded incidents during background processing.

**MapContainer:** react-leaflet's `MapContainer` renders the Leaflet map. It is lazy-loaded via `React.lazy` in `App.tsx` so a Leaflet initialization error cannot crash the rest of the app. The initial center and zoom come from the campus config (`useCampus()`).

**ClusterLayer:** A separate component (`components/ClusterLayer.tsx`) wraps `MarkerClusterGroup` from `leaflet.markercluster`. The `clusterRadius: 1` option means the clusterer will not group geographically separate points — it only groups markers at the exact same coordinates. Clicking a cluster at the same point fans out ("spiderfies") the markers so every incident is individually accessible. This solves the problem of incidents at the same building address stacking silently and only showing the top one.

**Severity filter:** A filter panel shows buttons for each severity level. Toggling one filters the `filtered` array in `useMemo`. The `ClusterLayer` receives a `key` prop that changes whenever any filter changes, forcing a full remount and re-render of the marker layer.

**Date filter:** Preset buttons (Today, Past 7 Days, Past 30 Days, All Time, Custom Range) compute `dateFrom` and `dateTo` strings that are applied to the `filtered` useMemo. Custom Range shows two date inputs. A 220px spacer is added at the bottom of the panel when custom mode is active so the date picker calendar has room to open without clipping.

**Floating panel:** The left panel uses `position: absolute` over the map with `overflowY: auto` so content can scroll within the fixed viewport height. A collapse toggle button slides the panel off-screen with a CSS `left` transition.

**Frosted glass:** All panel cards use `bg-white/80 backdrop-blur-md border-white/60` so the map tiles are visible through the panel, reinforcing spatial context.

**URL param fly-to:** When navigated to `/map?lat=X&lng=Y`, a `FlyToLocation` child component reads those params via `useSearchParams` and calls `map.flyTo()` from `useMap()`. This hook must be inside a child of `MapContainer` — it cannot be called in the parent component.

---

## 11. Analytics

**File:** `frontend/src/pages/Analytics.tsx`
**Route:** `/analytics`
**Data source:** `GET /api/trends`

### How it works

The trends endpoint runs five SQLite queries and returns them in a single response:
- `byType` — top 8 incident natures by count
- `bySeverity` — counts per severity level, ordered by severity
- `byStatus` — counts per status
- `byDay` — daily counts for the past 60 days
- `totals` — aggregate counts (total, open, inProgress, resolved, critical, high)

**Time Intelligence:** Computed on the frontend from the `byDay` data. Each date string is parsed to extract the hour of day and day of week. The most frequent hour and day are identified by building frequency maps. Results appear as summary cards: Peak Hour, Busiest Day, Busiest Month.

**Hour-of-day bar chart:** 24 bars, one per hour (0–23). Each bar is color-coded: indigo for late night (0–5), green for daytime (6–17), orange for evening (18–23). This lets dispatchers see at a glance when incidents cluster during the day.

**Day-of-week bar chart:** 7 bars. Weekend bars (Saturday, Sunday) are colored orange; weekdays are green.

**Line chart:** Daily incident volume over 60 days using Recharts' `LineChart`.

**Bar chart:** Top incident types by count using `BarChart`.

**Pie chart:** Severity breakdown using `PieChart`. `paddingAngle={3}` separates slices visually. Labels are rendered as `"severity XX%"` strings on each slice using a standard label formatter.

---

## 12. Import (CSV & PDF)

**File:** `backend/routes/import.js`, `frontend/src/pages/ImportIncidents.tsx`
**Route:** `/import`
**Libraries:** Multer (file upload), csv-parse (CSV), Anthropic SDK (PDF)

### How it works

The UI uses a drag-and-drop zone that accepts `.csv` and `.pdf` files up to 20MB (enforced by Multer's `limits.fileSize`). The file is uploaded using the browser's `FormData` API.

**Two-step flow:**
1. **Preview** — File is uploaded to either `/api/import/preview/csv` or `/api/import/preview/pdf`. The backend parses the file, returns the first 5 rows and the total count. No database writes happen at this stage.
2. **Confirm** — If the dispatcher approves, the same file is re-uploaded to `/api/import/confirm` with a `type` field. The backend re-parses it, filters out case numbers already in the database, inserts all new records synchronously, then returns the import result immediately.

**CSV parsing:**
`csv-parse/sync` reads the buffer as a UTF-8 string and maps column headers to schema fields. Both title-case (`"Case #"`) and lowercase variants are checked for compatibility with different Clery log exports.

**PDF extraction:**
The PDF buffer is base64-encoded and sent to Claude Sonnet as a `document` content block alongside a text prompt asking Claude to return a JSON array of incident objects. No regex or template-based parsing is used — Claude reads the document and structures the data from whatever format it finds. The response is stripped of any accidental markdown code fences before `JSON.parse()`.

**Post-insert background processing:**
After the synchronous insert returns to the client, `setImmediate()` starts a background loop that geocodes each imported incident and upgrades its classification from heuristic to full Claude AI. This is why import confirmation is fast but AI summaries appear a few seconds later.

**Deduplication:**
Before inserting, each row with a `caseNumber` is checked against `SELECT id FROM incidents WHERE caseNumber = ?`. Matching rows are skipped. Rows with no case number are always inserted.

**Source tagging:**
Imported records receive `source = 'import_csv'` or `source = 'import_pdf'`, alongside `'uopd_csv'` (seed) and `'epd_live'` (scraper), for auditability.

---

## 13. Incident Notes

**Files:** `backend/routes/notes.js`, `frontend/src/components/IncidentDetail.tsx`
**Routes:** `GET/POST/DELETE /api/incidents/:id/notes/:noteId`

### How it works

Notes are stored in the `incident_notes` table with a foreign key to `incidents.id`. The notes router uses `mergeParams: true` so it has access to the parent `:id` parameter from `incidents.js`, which mounts it via `router.use('/:id/notes', require('./notes'))`.

**Frontend:**
When `IncidentDetail` mounts, `getNotes(incident.id)` fetches all notes for that incident. Notes are displayed chronologically with their `createdAt` timestamp formatted via `toLocaleString()`.

A `<textarea>` captures new note text. Pressing Enter (without Shift) calls `handleAddNote()`, which POSTs the text and appends the returned note object to local state — no re-fetch required. The ✕ button calls `handleDeleteNote()`, which fires the DELETE request and filters the note out of local state optimistically.

---

## 14. Toast Notifications

**File:** `frontend/src/components/Toast.tsx`

### How it works

Toast uses a module-level pub/sub pattern — no React state or context is involved in the publisher. A `listeners` array holds handler functions. `fireToast(text, type)` creates a message object with an auto-incrementing ID and calls every registered listener.

`ToastContainer` is a React component that registers itself as a listener on mount and deregisters on unmount. It maintains its own `toasts` array in state. When a message arrives, it adds it to the array and schedules a `setTimeout` to remove it after 5,000ms.

`<ToastContainer />` is mounted once in `App.tsx` at the top level, outside any route, so it persists across navigation.

**Styling:** Three types — `info` (blue border, blue text), `warning` (amber), `critical` (red). Each has a matching icon (🔔, ⚠️, 🚨).

**Animation:** Each toast div has the `.toast-enter` CSS class, which applies a `slide-in-right` keyframe that translates from `translateX(calc(100% + 1rem))` (off-screen right) to `translateX(0)` over 300ms with a spring-like cubic-bezier curve.

---

## 15. Inline Status Updates

**File:** `frontend/src/pages/Dashboard.tsx`

### How it works

Each Active Queue card renders two small pill buttons below the AI recommendation line. Their visibility depends on current status:
- `open` → shows both `→ In Progress` and `✓ Resolve`
- `in-progress` → shows only `✓ Resolve`
- `resolved` → shows neither (resolved incidents don't appear in the queue)

Clicking a button calls `handleQuickStatus(e, incident, status)`. The event handler immediately calls `e.stopPropagation()` so the click doesn't bubble to the card's `onClick`, which would open the detail modal.

A `quickSaving` state holds the ID of whichever incident is currently being saved. While saving, both buttons are `disabled` to prevent double-clicks. On success, the incident is updated in-place in the `incidents` array via `setIncidents`. If the detail modal is open for that incident, `setSelected(updated)` refreshes it too.

The status change is sent via `PATCH /api/incidents/:id/status`. The backend validates that status is one of the three allowed values before writing.

---

## 16. Show on Map

**Files:** `frontend/src/components/IncidentDetail.tsx`, `frontend/src/pages/MapView.tsx`

### How it works

`handleShowOnMap()` in `IncidentDetail`:
1. Calls `onClose()` to dismiss the modal
2. Reads `lat` and `lng` from the incident (cast via `as any` since they're not in the TypeScript interface but are present in the runtime data from `/api/incidents/map`)
3. Calls `navigate('/map?lat=X&lng=Y&id=Z')` from React Router's `useNavigate`

`MapView` reads these params with `useSearchParams()` from React Router. `flyLat` and `flyLng` are parsed as floats.

Inside `MapContainer`, a `FlyToLocation` child component calls `useMap()` (which only works inside a `MapContainer` child, not the parent component). A `useEffect` watches `lat` and `lng` and calls `map.flyTo([lat, lng], 18, { duration: 1.2 })` — a smooth animated fly to zoom level 18 over 1.2 seconds.

---

## 17. Campus Settings & Search

**Files:** `backend/campus.config.js`, `backend/routes/config.js`, `frontend/src/pages/Settings.tsx`, `frontend/src/context/CampusContext.tsx`
**Route:** `/settings`

### Config storage

`campus.config.js` exposes `getConfig()` and `setConfig()`. `getConfig()` reads all rows from the `settings` table, converts them from strings to their correct types (float for coordinates, int for radius, boolean for `pdDispatchEnabled`), and merges with env var defaults. Since it reads from the database on every call, configuration changes take effect immediately on the next operation — no server restart needed.

`setConfig()` uses `INSERT OR REPLACE INTO settings` (SQLite's upsert) to write each key-value pair. All values are stored as strings.

### API

`GET /api/config` returns the result of `getConfig()`. `PATCH /api/config` accepts a partial object, filters it against a whitelist of allowed keys, calls `setConfig()`, and returns the updated config.

### CampusContext

`CampusProvider` wraps the entire app in `App.tsx`. On mount it fetches `/api/config` and stores the result. `useCampus()` returns `{ config, reload }`. Components that need the campus name or coordinates call `useCampus()` instead of using hardcoded strings.

### Settings page

**Campus search:**
A text input with a 400ms debounce queries `https://nominatim.openstreetmap.org/search?q=...&format=json&limit=6&addressdetails=1` directly from the browser. Results appear in a dropdown. Selecting a result calls `handleSelectResult()`, which extracts the short name (first comma-segment of `display_name`), lat, lng, city, and state from the Nominatim response and updates the form state. The map preview animates to the new location via `RecenterMap` (a `useMap()` component).

**Map preview:**
A `MapContainer` renders inside the settings page with a green `Circle` component showing the patrol radius. A `RecenterMap` child component watches `lat` and `lng` and calls `map.flyTo()` with `{ duration: 0.8 }` for a smooth animation whenever coordinates change. The map is rendered after a 100ms delay (`setMapReady`) to ensure the container has DOM dimensions before Leaflet initializes.

**Radius slider:**
An `<input type="range">` from 200 to 5,000 meters in 100m steps. The current value is shown in both meters and miles (`meters / 1609.34`). The Circle radius on the map updates in real time as the slider moves.

**Dispatch toggle:**
A custom CSS toggle switch implemented with a `<button>` and two `<span>` elements. Clicking calls `set('pdDispatchEnabled', !form.pdDispatchEnabled)`. When disabled, the URL and feed selector are hidden.

**Curated dispatch feed dropdown:**
When the dispatch feed is enabled, a `<select>` dropdown appears above the manual URL input, populated from `frontend/src/data/knownDispatchFeeds.ts`. Each entry in the data file has an `id`, `label`, `university`, `city`, `state`, `url`, and `status` (`"verified"` or `"unverified"`). Selecting a feed with a confirmed URL fills the manual URL input via `set('pdDispatchUrl', feed.url)`. Entries without a URL (unverified, pending research) are rendered as disabled `<option>` elements so they appear in the list as informational entries without being selectable. A divider ("or enter manually") visually separates the dropdown from the free-text URL input, making it clear both paths lead to the same field. Verified entries are marked with ✓ in the option label; unverified entries show "(unverified)". Adding a new verified feed requires only editing the data file — no component changes needed.

**Save:**
Calls `PATCH /api/config` with the full form state. On success, calls `reload()` to refresh `CampusContext` across the app, then fires a success toast.

---

## 18. UI Animations & Polish

**File:** `frontend/src/index.css`

All animations are implemented as CSS keyframes rather than a third-party animation library.

### Modal entrance (`modal-backdrop`, `modal-panel`)

```css
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}
```

The backdrop fades in over 200ms. The panel scales up from 95% and slides up 8px over 250ms with a `cubic-bezier(0.16, 1, 0.3, 1)` curve (fast start, decelerate to rest). Applied via `.modal-backdrop` and `.modal-panel` classes on the two root elements of `IncidentDetail`.

### Toast slide-in (`toast-enter`)

```css
@keyframes slide-in-right {
  from { transform: translateX(calc(100% + 1rem)); opacity: 0; }
  to   { transform: translateX(0);                opacity: 1; }
}
```

Toasts enter from the right edge of the screen over 300ms. The same spring curve is used as the modal to keep motion language consistent.

### Skeleton loading (`.skeleton`)

```css
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
.skeleton { animation: skeleton-pulse 1.5s ease-in-out infinite; }
```

Applied to `div` elements that mirror the shape of real content. Each skeleton card in the Dashboard loading state has a severity bar placeholder, a title line, a location line, and a recommendation line — all the same proportions as real queue cards.

### Frosted glass (Map panel)

Tailwind's `bg-white/80` (80% opacity white) combined with `backdrop-blur-md` creates the frosted glass effect on all map panel elements. The `border-white/60` border reinforces the glass look. No JavaScript is involved — this is pure CSS applied at the class level.

---

## AI Cost Notes

The app uses **claude-haiku-4-5-20251001** (Anthropic's cheapest model) for incident classification.

| | Rate |
|---|---|
| Input tokens | $0.80 / 1M tokens |
| Output tokens | $4.00 / 1M tokens |

A single incident classification is approximately 300 tokens in and 150 tokens out, costing **~$0.0009 per classification** (less than a tenth of a cent). A $10 API credit covers roughly **11,000 classifications**.

To monitor actual usage, visit **console.anthropic.com → Usage** for a real-time breakdown of token consumption and dollar spend by day and model.

---

## Known Limitations

- **No real-time resolution feedback:** The UOPD Clery log is a static compliance report; EPD dispatch does not expose disposition data. Incidents must be manually resolved in the UI. A CAD system integration would be required for automatic resolution.
- **Nominatim rate limit:** Geocoding runs at 1 request per second per Nominatim's terms of service. Large imports (100+ new locations) take proportionally longer to geocode.
- **EPD data delay:** The EPD dispatch feed carries a disclosed 2-hour delay. CampusSafe is a near-real-time supplement to existing radio communications, not a replacement.
- **Single campus per instance:** The settings system supports one active campus configuration at a time. Multi-campus enterprise deployments would require either multiple instances or a more complex multi-tenant database schema.

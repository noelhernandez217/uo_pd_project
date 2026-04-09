# CampusSafe — Known Limitations

A running record of known gaps, constraints, and workarounds in the current build.

---

## 1. No automatic incident resolution from external feeds

**What the problem is**
The system has no way to automatically mark an incident as resolved based on external data. Both live data sources have this constraint:

- **UOPD Clery log** — A periodic static PDF/CSV published for Clery Act compliance. It reflects case state at time of export, not live status. No API or real-time endpoint exists.
- **EPD dispatch log** — The public EPD feed shows active and recent calls but includes no disposition or resolution data. An incident disappearing from the feed does not reliably signal resolution — it may have simply aged off the display window.

**What this means in practice**
Incidents imported from the Clery CSV or captured via the EPD scraper remain `open` until a dispatcher manually updates them. Without a direct integration with UOPD's internal CAD system (e.g., PremierOne or Axon Records), which is not publicly accessible, automatic resolution is not achievable.

**Current workaround**
Dispatchers manually resolve incidents via the status dropdown in the detail modal or the inline "✓ Resolve" button on Dashboard queue cards.

**Future path**
A formal integration with UOPD's CAD system via a vendor API or data export agreement would close this gap. Alternatively, if UOPD published a structured, timestamped disposition feed, the scraper pipeline could be extended to consume it.

---

## 2. Geocoding failures leave incidents off the map

**What the problem is**
All map pins require a geocoded `lat`/`lng`. When a location string can't be resolved by Nominatim (OpenStreetMap's geocoder), the incident has no coordinates and will never appear on the map — regardless of filters or refresh.

This affects two paths:
- **Manually submitted incidents** — geocoding runs asynchronously after the POST response. The map auto-refreshes every 15 seconds, so pins appear shortly after submission *if* geocoding succeeds.
- **EPD scraper incidents** — if both the primary geocode (intersection) and the fallback (first street only) fail, the incident is skipped entirely and never inserted into the database.

Common failure causes:
- Abbreviated or non-standard address formats not recognized by Nominatim
- Intersections outside the Nominatim coverage area
- Very new streets or recent renames not yet in OpenStreetMap

**What this means in practice**
The map is not a complete spatial view of all incidents — it only shows incidents that were successfully geocoded. An incident visible in the Dashboard or Incident Log may have no map pin.

**Note:** the "Today" date filter previously excluded evening incidents due to a UTC/local date mismatch — this was fixed in v1.5 and is no longer a limitation.

**Current workaround**
None — the gap is silent. Dispatchers can check the Incident Log to see incidents without map pins; there is no visual indicator on the map that ungeocoded incidents exist.

**Future path**
Options in order of complexity:
1. Show ungeocoded incidents as a fallback pin at the campus center with a distinct icon and "location approximate" label
2. Allow manual lat/lng entry in the incident detail modal
3. Switch from Nominatim to a commercial geocoder (Google Maps, Mapbox) with higher coverage

---

## 3. EPD dispatch data has a ~2-hour delay

**What the problem is**
The Eugene Police Department's public dispatch log (`coeapps.eugene-or.gov/epddispatchlog`) is documented as having an approximately 2-hour delay before incidents appear. The scraper polls every 10 minutes, but cannot surface incidents faster than the source publishes them.

**What this means in practice**
Live EPD incidents on the Dashboard may be 2+ hours old even when the "EPD live · last synced" indicator shows a recent sync. The sync timestamp reflects when the feed was polled, not when the underlying incident occurred.

**Current workaround**
The timestamp on each incident card shows actual time of occurrence (`dateOccurred`), not sync time — so dispatchers can see the real age of an incident. The ~2-hour lag is a property of the public feed, not a CampusSafe bug.

**Future path**
A direct CAD integration would eliminate the delay entirely, but requires a vendor agreement.

---

## 4. Scraper coverage is limited to the public EPD feed format

**What the problem is**
The scraper parses a specific HTML table format used by Eugene PD's dispatch log. Other police departments may publish dispatch data in different formats (different column orders, different URL structures, PDFs, JSON APIs, etc.). The scraper will silently return zero results if the HTML structure doesn't match expectations.

**What this means in practice**
The "Live Dispatch Feed" setting in CampusSafe accepts any URL, but only URLs that serve the same HTML table format as Eugene PD will actually work. Unverified feeds in the Settings dropdown may or may not be compatible.

**Current workaround**
The Settings page labels feeds as "Verified" or "Unverified." Only Eugene PD is currently verified. Admins setting up a new campus should test their PD's feed URL before relying on it.

**Future path**
Extend the scraper to support additional formats (e.g. JSON feeds, alternate HTML structures). Each new verified format should be documented in `frontend/src/data/knownDispatchFeeds.ts`.

---

## 5. No user authentication or access control

**What the problem is**
The app has no login, session management, or role-based access control. Any user with network access to the running server can view all incidents, submit new ones, resolve or reopen any incident, and change campus configuration.

**What this means in practice**
Suitable only for a trusted internal network or local development environment. Not safe to expose to the public internet as-is.

**Current workaround**
Deploy behind a VPN, firewall, or reverse proxy with HTTP basic auth.

**Future path**
Add a lightweight auth layer — at minimum, a shared password or API key for the backend. A full role model (dispatcher vs. supervisor vs. read-only) would be needed for production deployment.

---

## 6. Voice dictation does not work in Safari

**What the problem is**
The in-app voice dictation feature (mic button on the resolution note and dispatcher notes fields) is built on the browser's native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). Safari does not implement this API. The mic button renders as nothing in Safari — it is hidden rather than broken — but the dictation feature is completely unavailable.

Affected browsers: Safari (all versions), Firefox. Works in: Chrome, Edge.

**What this means in practice**
Dispatchers using Safari cannot use the in-app mic button to dictate notes or resolution summaries. They must type manually.

**Current workaround**
Wispr Flow (or any other system-level dictation tool) works in Safari without any browser API support — it operates at the OS level and types into whichever text field is focused, regardless of browser. A dispatcher running Wispr Flow can click into any textarea and dictate as normal. This is actually the recommended path for Safari users since it also works across all other apps they use.

macOS's built-in dictation (System Settings → Keyboard → Dictation) is a free alternative that works the same way — press the mic key (or double-tap Fn), speak, and the text is typed into the focused field.

**Future path**
Safari added partial Web Speech API support behind a feature flag in some versions. Full support may arrive in a future Safari release without any code changes needed on our end. Alternatively, the mic button could be replaced with a server-side audio upload flow using a transcription API (e.g. OpenAI Whisper), which would work in all browsers but adds latency and cost.

---

## 7. SQLite is single-writer and not suitable for high-concurrency deployments

**What the problem is**
The database is SQLite via `better-sqlite3`. SQLite serializes all writes — concurrent write operations (e.g., the EPD scraper inserting incidents while a dispatcher is resolving one) will queue rather than run in parallel. At high write volume or with many simultaneous users, this becomes a bottleneck.

**What this means in practice**
Acceptable for a single campus with one or a few dispatchers. Not suitable for multi-tenant deployments or campuses with very high incident volume (hundreds per hour).

**Current workaround**
None required at typical campus safety scale. The EPD scraper's 1-second-per-incident geocode delay naturally limits write throughput to a rate SQLite handles comfortably.

**Future path**
Migrate the data layer to PostgreSQL for any production deployment at scale. The schema is simple enough that the migration is straightforward.

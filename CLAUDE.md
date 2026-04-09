# Campus Safety Incident Management Tool

## Assignment

Build a tool for a university's campus safety team to help them manage, prioritize, or analyze incident reports more intelligently.

### Context
- The team receives dozens of incident reports per day (noise complaints, medical calls, suspicious activity, etc.)
- Currently tracking everything manually in a spreadsheet
- Goal: replace/augment that workflow with something smarter

### Requirements
- Scope is intentionally broad — use judgment to create something valuable
- Must be **productizable**: usable as a system across different campuses
- Use AI tools where appropriate; be ready to explain how they were used
- Estimated effort: ~6 hours
- Perfection is not expected — the goal is to assess approach, AI tool usage, and ability to build from scratch

## Future Development Ideas
Features deferred for later consideration — not in scope for current build but worth revisiting.

- **Shift-based filtering** — Dispatchers work defined shifts (days, swings, graves). A "since shift start" filter or shift login concept would let the queue automatically scope to what happened on the current officer's watch. Requires a notion of user sessions or shift times.
- **Officer assignment** — Ability to assign an incident to a specific officer by name/badge number and track who is responding
- **Shift handoff report** — Auto-generated summary of all incidents during a shift, exportable as PDF for the next dispatcher
- **Keyboard shortcuts** — Power-user shortcuts for common actions (mark resolved, open notes, etc.)
- **Duplicate/pattern detection** — If 3 incidents occur at the same location within 24 hours, auto-flag as a pattern requiring supervisor attention

---

## Development Guidelines

### Changelog Requirement
Every change made to this project — new features, removals, refactors, UI updates, bug fixes — must be logged in `CHANGELOG.md` before the task is considered complete. Each entry should include:
- What was added, changed, or removed
- Why the decision was made (design rationale, dispatcher perspective, user feedback, etc.)
- Any alternatives that were considered and ruled out

New versions should be incremented sequentially (v0.9, v1.0, etc.) and grouped by logical milestone rather than individual commits. When in doubt, log it.

### Priorities (in order)
1. Dispatcher utility — does this help someone on shift act faster or more confidently?
2. Core product loop — Submission → AI Classification → Dashboard → Analytics
3. Productizability — would this work across different campuses with minimal config changes?
4. Polish and UX — visual clarity, no information overload

Changes that don't serve priority 1 or 2 should be deferred or placed in Analytics/Incident Log rather than the Dashboard.

---

## Project Plan

### Tools Used
- **React** (TypeScript) — frontend UI framework
- **CSS / Tailwind** — styling
- **Claude API (Anthropic)** — AI-powered incident classification and prioritization
- **Node.js / Express** (or similar) — lightweight backend API
- **JSON / SQLite** — local data persistence for incidents

### Architecture
- **Frontend (React + TypeScript):** Single-page dashboard for viewing, submitting, and managing incidents
- **Backend (Node/Express):** REST API that stores incident reports and calls the Claude API for classification
- **AI Layer (Claude API):** On incident submission, the report text is sent to Claude to classify type (medical, noise, suspicious activity, etc.), assign severity (low / medium / high / critical), and suggest a recommended response
- **Data Layer:** Incidents stored with metadata — timestamp, location, type, severity, status (open / in-progress / resolved), and AI-generated notes

### Core Product Loop (Primary Emphasis)
The core value proposition follows this end-to-end flow:

1. **Incident Submission** — staff logs a report (description, location, time)
2. **AI Classification** — Claude API automatically categorizes type and assigns severity (low / medium / high / critical)
3. **Dashboard with Filters + Severity** — all incidents displayed with color-coded severity, filterable by type, status, campus, and date
4. **Trends Panel** — visual summary of incident volume and breakdown by type over time, demonstrating the AI's analytical value

Every feature built should serve or support this loop. Scope decisions should prioritize completing this flow end-to-end over adding peripheral features.

### Key Features
- **Incident submission form** — campus safety staff can log a new incident with description, location, and time
- **AI classification & prioritization** — automatically categorizes incident type and severity using Claude
- **Live dashboard** — sortable, filterable table of all incidents with severity color-coding
- **Incident detail view** — full report with AI summary, recommended action, and status controls
- **Status management** — mark incidents as open, in-progress, or resolved
- **Multi-campus support** — campus identifier scoped to each incident, making the system deployable across different universities

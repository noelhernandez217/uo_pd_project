-- CampusSafe — Supabase / PostgreSQL Schema
-- Run this in the Supabase SQL Editor before first deployment.
-- Safe to re-run: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS incidents (
  id                   SERIAL PRIMARY KEY,
  nature               TEXT NOT NULL,
  case_number          TEXT,
  date_reported        TEXT,
  date_occurred        TEXT,
  location             TEXT,
  disposition          TEXT,
  severity             TEXT DEFAULT 'medium',
  ai_summary           TEXT,
  ai_recommendation    TEXT,
  status               TEXT DEFAULT 'open',
  campus               TEXT DEFAULT 'University of Oregon',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  lat                  REAL,
  lng                  REAL,
  source               TEXT DEFAULT 'uopd_csv',
  event_number         TEXT,
  distance_from_campus REAL,
  resolved_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS incident_notes (
  id          SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_incidents_status        ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity      ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_date_occurred ON incidents (date_occurred);
CREATE INDEX IF NOT EXISTS idx_incidents_event_number  ON incidents (event_number);   -- scraper dedup
CREATE INDEX IF NOT EXISTS idx_incidents_case_number   ON incidents (case_number);    -- import dedup
CREATE INDEX IF NOT EXISTS idx_incidents_coords        ON incidents (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;                                           -- map queries
CREATE INDEX IF NOT EXISTS idx_notes_incident_id       ON incident_notes (incident_id);

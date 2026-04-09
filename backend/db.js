"use strict";

// Unified database interface — async all / get / run
// • If DATABASE_URL is set: uses pg (PostgreSQL / Supabase)
// • Otherwise: uses better-sqlite3 (local dev)
//
// Both paths expose:
//   db.all(sql, params?)  → Promise<row[]>   (camelCase keys)
//   db.get(sql, params?)  → Promise<row|null> (camelCase keys)
//   db.run(sql, params?)  → Promise<{ insertId, changes }>

// snake_case → camelCase key transform applied to all query results
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const rowToCamel = (row) =>
  row
    ? Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    : null;

// Convert SQLite-style ? positional placeholders → PostgreSQL $N
function toPgSQL(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

// ── PostgreSQL (Supabase / production) ─────────────────────────────────────
if (process.env.DATABASE_URL) {
  const { Pool, types } = require("pg");
  // Parse pg bigint (OID 20) as JS number instead of string — affects COUNT(*) etc.
  types.setTypeParser(20, (val) => parseInt(val, 10));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, // keep pool small for serverless cold starts
  });

  module.exports = {
    async all(sql, params = []) {
      const { rows } = await pool.query(toPgSQL(sql), params);
      return rows.map(rowToCamel);
    },

    async get(sql, params = []) {
      const { rows } = await pool.query(toPgSQL(sql), params);
      return rows[0] ? rowToCamel(rows[0]) : null;
    },

    // For INSERTs that need the new row id, include RETURNING id in the SQL
    async run(sql, params = []) {
      const result = await pool.query(toPgSQL(sql), params);
      return {
        insertId: result.rows?.[0]?.id ?? null,
        changes: result.rowCount ?? 0,
      };
    },

    // Settings upsert — uses ON CONFLICT for PostgreSQL
    async upsertSetting(key, value) {
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, String(value)],
      );
    },
  };
} else {
  // ── SQLite (local development) ────────────────────────────────────────────
  const Database = require("better-sqlite3");
  const path = require("path");

  const sqlite = new Database(path.join(__dirname, "incidents.db"));

  // Schema — snake_case column names to match the PostgreSQL schema
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at           TEXT DEFAULT (CURRENT_TIMESTAMP),
      lat                  REAL,
      lng                  REAL,
      source               TEXT DEFAULT 'uopd_csv',
      event_number         TEXT,
      distance_from_campus REAL,
      resolved_at          TEXT
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS incident_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  module.exports = {
    async all(sql, params = []) {
      return sqlite
        .prepare(sql)
        .all(...params)
        .map(rowToCamel);
    },

    async get(sql, params = []) {
      const row = sqlite.prepare(sql).get(...params);
      return row ? rowToCamel(row) : null;
    },

    // INSERT ... RETURNING id → use .get() to capture returned row
    // All other statements → use .run()
    async run(sql, params = []) {
      if (/RETURNING\s+id/i.test(sql)) {
        const row = sqlite.prepare(sql).get(...params);
        return { insertId: rowToCamel(row)?.id ?? null, changes: 1 };
      }
      const result = sqlite.prepare(sql).run(...params);
      return {
        insertId: result.lastInsertRowid ?? null,
        changes: result.changes,
      };
    },

    // Settings upsert — uses INSERT OR REPLACE for SQLite
    async upsertSetting(key, value) {
      sqlite
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .run(key, String(value));
    },
  };
}

// Campus configuration — single source of truth for all campus-specific settings.
// Settings are loaded async from the DB at startup and cached in memory.
// getConfig() is synchronous (reads from cache) so it can be called anywhere.
// Call loadConfig() once during init() before any other modules run.

const DEFAULTS = {
  campusName:          process.env.CAMPUS_NAME              || 'University of Oregon',
  campusLat:           parseFloat(process.env.CAMPUS_LAT    || '44.0449'),
  campusLng:           parseFloat(process.env.CAMPUS_LNG    || '-123.0722'),
  campusRadiusMeters:  parseInt(process.env.CAMPUS_RADIUS_METERS || '1200'),
  campusCity:          process.env.CAMPUS_CITY              || 'Eugene',
  campusState:         process.env.CAMPUS_STATE             || 'OR',
  pdDispatchUrl:       process.env.PD_DISPATCH_URL          || 'https://coeapps.eugene-or.gov/epddispatchlog',
  pdDispatchEnabled:   process.env.PD_DISPATCH_ENABLED !== 'false',
}

let cachedConfig = { ...DEFAULTS }

// Load (or reload) config from the settings table into the in-memory cache.
async function loadConfig() {
  try {
    const db = require('./db')
    const rows = await db.all('SELECT key, value FROM settings')
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    cachedConfig = {
      campusName:         stored.campusName         || DEFAULTS.campusName,
      campusLat:          stored.campusLat          ? parseFloat(stored.campusLat)        : DEFAULTS.campusLat,
      campusLng:          stored.campusLng          ? parseFloat(stored.campusLng)        : DEFAULTS.campusLng,
      campusRadiusMeters: stored.campusRadiusMeters ? parseInt(stored.campusRadiusMeters) : DEFAULTS.campusRadiusMeters,
      campusCity:         stored.campusCity         || DEFAULTS.campusCity,
      campusState:        stored.campusState        || DEFAULTS.campusState,
      pdDispatchUrl:      stored.pdDispatchUrl      || DEFAULTS.pdDispatchUrl,
      pdDispatchEnabled:  stored.pdDispatchEnabled !== undefined
        ? stored.pdDispatchEnabled === 'true'
        : DEFAULTS.pdDispatchEnabled,
    }
  } catch {
    // DB not ready yet — keep defaults until the next loadConfig() call
  }
}

// Synchronous read from in-memory cache — safe to call anywhere
function getConfig() {
  return cachedConfig
}

// Persist config changes to the settings table, then refresh the cache
async function setConfig(updates) {
  const db = require('./db')
  for (const [key, value] of Object.entries(updates)) {
    await db.upsertSetting(key, String(value))
  }
  await loadConfig()
}

module.exports = { getConfig, setConfig, loadConfig, DEFAULTS }

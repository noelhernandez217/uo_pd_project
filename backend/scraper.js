const https = require('https')
const { load: cheerioLoad } = require('cheerio')
const db = require('./db')
const { geocodeAddress } = require('./geocoder')
const { classifyWithClaude } = require('./classifier')
const { distanceFromCampus, isNearCampus } = require('./proximity')
const { getConfig } = require('./campus.config')

const POLL_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

let lastPollTime  = null
let lastPollCount = 0
let lastPollAdded = 0
let polling       = false

// ── Fetch raw HTML ──────────────────────────────────────────────────────────
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'CampusSafe/1.0 (university campus safety research tool)',
        'Accept': 'text/html',
      },
    }
    https.get(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

// ── Parse EPD table rows ────────────────────────────────────────────────────
function parseDispatchLog(html) {
  const $ = cheerioLoad(html)
  const incidents = []

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get()
    if (cells.length < 7) return

    const hasCheckbox = !cells[0].match(/\d{2}\/\d{2}\/\d{4}/)
    const offset = hasCheckbox ? 1 : 0

    const callTime     = cells[offset]     || ''
    const dispatchTime = cells[offset + 1] || ''
    const nature       = cells[offset + 2] || ''
    const disposition  = cells[offset + 3] || ''
    const eventNumber  = cells[offset + 4] || ''
    const location     = cells[offset + 5] || ''
    const priority     = cells[offset + 6] || ''
    const caseNum      = cells[offset + 7] || ''

    if (!eventNumber || !nature) return

    incidents.push({ callTime, dispatchTime, nature, disposition, eventNumber, location, priority, caseNum })
  })

  return incidents
}

// ── Parse EPD date string to ISO ────────────────────────────────────────────
function parseEPDDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Format location for geocoding (EPD uses "STREET1/STREET2, EUG") ─────────
function formatLocationForGeocoding(location) {
  const cleaned = location
    .replace(/, EUG$/i, '')
    .replace(/\//g, ' & ')
    .replace(/\bLP\b/g, 'Loop')
    .replace(/\bBLVD\b/g, 'Blvd')
    .replace(/\bAVE\b/g, 'Ave')
    .replace(/\bST\b/g, 'St')
    .replace(/\bDR\b/g, 'Dr')
    .replace(/\bRD\b/g, 'Rd')
    .replace(/\bCT\b/g, 'Ct')
    .replace(/\bPL\b/g, 'Pl')
    .replace(/\bHWY\b/g, 'Hwy')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return `${cleaned}, Eugene, OR`
}

// ── Main poll function ──────────────────────────────────────────────────────
async function pollEPDLog() {
  if (polling) return
  polling = true

  try {
    const { pdDispatchUrl, pdDispatchEnabled } = getConfig()
    if (!pdDispatchEnabled) {
      console.log('[EPD Scraper] Dispatch feed disabled in config, skipping poll.')
      return
    }
    console.log(`[EPD Scraper] Polling ${pdDispatchUrl}...`)
    const html = await fetchHTML(pdDispatchUrl)
    const rows = parseDispatchLog(html)

    lastPollTime  = new Date().toISOString()
    lastPollCount = rows.length
    lastPollAdded = 0

    console.log(`[EPD Scraper] Found ${rows.length} incidents in today's log.`)

    for (const row of rows) {
      const exists = await db.get('SELECT id FROM incidents WHERE event_number = ?', [row.eventNumber])
      if (exists) continue

      const formattedAddress = formatLocationForGeocoding(row.location)
      let coords = await geocodeAddress(formattedAddress)

      if (!coords) {
        const firstStreet = formattedAddress.split('&')[0].trim()
        coords = await geocodeAddress(firstStreet)
        if (coords) {
          console.log(`[EPD Scraper] Geocoded via fallback (first street): ${firstStreet}`)
        }
        await new Promise((r) => setTimeout(r, 1100))
      }

      if (!coords) {
        console.log(`[EPD Scraper] Could not geocode (skipping): ${row.location}`)
        continue
      }

      const distance = distanceFromCampus(coords.lat, coords.lng)
      const distanceMiles = (distance / 1609.34).toFixed(2)

      if (!isNearCampus(coords.lat, coords.lng)) {
        const radiusMiles = ((parseFloat(process.env.CAMPUS_RADIUS_METERS) || 1200) / 1609.34).toFixed(2)
        console.log(`[EPD Scraper] Outside radius — ${distanceMiles} mi from campus (limit ${radiusMiles} mi): ${row.location}`)
        continue
      }

      console.log(`[EPD Scraper] New campus-area incident (${distanceMiles} mi): ${row.nature} @ ${row.location}`)

      const classification = await classifyWithClaude(row.nature, row.disposition, row.location)

      await db.run(`
        INSERT INTO incidents
          (nature, case_number, date_occurred, date_reported, location, disposition,
           severity, ai_summary, ai_recommendation, status,
           campus, source, event_number, lat, lng, distance_from_campus)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, 'epd_live', ?, ?, ?, ?)
      `, [
        row.nature,
        row.caseNum || row.eventNumber,
        parseEPDDate(row.callTime),
        parseEPDDate(row.callTime),
        row.location,
        row.disposition,
        classification.severity,
        classification.aiSummary,
        classification.aiRecommendation,
        getConfig().campusName,
        row.eventNumber,
        coords.lat,
        coords.lng,
        distance,
      ])

      lastPollAdded++

      await new Promise((r) => setTimeout(r, 1100))
    }

    if (lastPollAdded > 0) {
      console.log(`[EPD Scraper] Added ${lastPollAdded} new campus-area incident(s).`)
    } else {
      console.log(`[EPD Scraper] No new campus-area incidents.`)
    }
  } catch (err) {
    console.error('[EPD Scraper] Error:', err.message)
  } finally {
    polling = false
  }
}

function startPolling() {
  console.log('[EPD Scraper] Starting — will poll every 10 minutes.')
  pollEPDLog()
  setInterval(pollEPDLog, POLL_INTERVAL_MS)
}

function getStatus() {
  return { lastPollTime, lastPollCount, lastPollAdded, polling, intervalMinutes: 10 }
}

module.exports = { startPolling, getStatus, pollEPDLog }

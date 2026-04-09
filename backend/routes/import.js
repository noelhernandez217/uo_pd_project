const express = require('express')
const router = express.Router()
const multer = require('multer')
const { parse: parseCSV } = require('csv-parse/sync')
const OpenAI = require('openai')
const db = require('../db')
const { classifyHeuristic, classifyWithClaude } = require('../classifier')
const { geocodeAddress } = require('../geocoder')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
})

function normalizeDate(str) {
  if (!str) return null
  if (str.includes('@')) {
    const [datePart, timePart] = str.split('@').map((s) => s.trim())
    const [m, d, y] = datePart.split('/')
    const fullYear = parseInt(y) < 100 ? 2000 + parseInt(y) : parseInt(y)
    const hh = (timePart || '0000').slice(0, 2)
    const mm = (timePart || '0000').slice(2, 4)
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${hh}:${mm}`
  }
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 16).replace('T', ' ')
  return str
}

function parseCSVRows(buffer) {
  const records = parseCSV(buffer.toString('utf8'), {
    columns: true, skip_empty_lines: true, trim: true,
  })
  return records.map((r) => ({
    nature:        r['Nature']               || r['nature']                || '',
    case_number:   r['Case #']               || r['case #']               || '',
    date_reported: normalizeDate(r['Date Reported']      || r['date reported']      || ''),
    date_occurred: normalizeDate(r['Date/Time Occurred'] || r['date/time occurred'] || ''),
    location:      r['General Location']     || r['general location']     || '',
    disposition:   r['Disposition']          || r['disposition']          || '',
  })).filter((r) => r.nature)
}

async function parsePDFRows(buffer) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for PDF import')

  const client = new OpenAI()
  const base64PDF = buffer.toString('base64')

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `Extract all incident records from this campus safety / police dispatch log PDF.
Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
Each object must have exactly these fields:
{
  "nature": "incident type or description",
  "caseNumber": "case or report number (empty string if not present)",
  "dateReported": "date reported in MM/DD/YY format (empty string if not present)",
  "dateOccurred": "date and time occurred in MM/DD/YY @ HHMM format (empty string if not present)",
  "location": "location address",
  "disposition": "outcome or disposition (empty string if not present)"
}
Skip page headers, footers, totals rows, and any non-incident content.
Return only the JSON array.` },
        { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64PDF}` } },
      ],
    }],
  })

  const text = response.choices[0].message.content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
  const rows = JSON.parse(text)

  return rows
    .filter((r) => r.nature)
    .map((r) => ({
      nature:        r.nature       || '',
      case_number:   r.caseNumber   || '',
      date_reported: normalizeDate(r.dateReported),
      date_occurred: normalizeDate(r.dateOccurred),
      location:      r.location     || '',
      disposition:   r.disposition  || '',
    }))
}

// ── POST /api/import/preview/csv ─────────────────────────────────────────────
router.post('/preview/csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  try {
    const rows = parseCSVRows(req.file.buffer)
    res.json({ count: rows.length, rows: rows.slice(0, 5), total: rows.length })
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse CSV: ' + err.message })
  }
})

// ── POST /api/import/preview/pdf ─────────────────────────────────────────────
router.post('/preview/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  try {
    const rows = await parsePDFRows(req.file.buffer)
    res.json({ count: rows.length, rows: rows.slice(0, 5), total: rows.length })
  } catch (err) {
    console.error('PDF extraction error:', err)
    res.status(500).json({ error: 'Failed to extract PDF: ' + err.message })
  }
})

// ── POST /api/import/confirm ──────────────────────────────────────────────────
router.post('/confirm', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const fileType = req.body.type // 'csv' or 'pdf'
  let rows = []

  try {
    if (fileType === 'csv') {
      rows = parseCSVRows(req.file.buffer)
    } else if (fileType === 'pdf') {
      rows = await parsePDFRows(req.file.buffer)
    } else {
      return res.status(400).json({ error: 'type must be csv or pdf' })
    }
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse file: ' + err.message })
  }

  // Skip records already in DB by case_number
  const toInsert = []
  for (const r of rows) {
    if (r.case_number) {
      const exists = await db.get('SELECT id FROM incidents WHERE case_number = ?', [r.case_number])
      if (exists) continue
    }
    toInsert.push(r)
  }

  // Heuristic classify and insert all
  const source = fileType === 'pdf' ? 'import_pdf' : 'import_csv'
  for (const r of toInsert) {
    const cl = classifyHeuristic(r.nature, r.disposition)
    await db.run(`
      INSERT INTO incidents
        (nature, case_number, date_reported, date_occurred, location, disposition,
         severity, ai_summary, ai_recommendation, status, campus, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'University of Oregon', ?)
    `, [
      r.nature, r.case_number, r.date_reported, r.date_occurred,
      r.location, r.disposition, cl.severity, cl.aiSummary, cl.aiRecommendation, source,
    ])
  }

  res.json({ imported: toInsert.length, skipped: rows.length - toInsert.length })

  // Background: geocode + upgrade to Claude classification
  setImmediate(async () => {
    const inserted = await db.all(
      `SELECT id, nature, location, disposition FROM incidents
       WHERE source = ? AND lat IS NULL ORDER BY id DESC LIMIT ?`,
      [source, toInsert.length]
    )

    for (const inc of inserted) {
      const coords = await geocodeAddress(inc.location)
      if (coords) {
        await db.run('UPDATE incidents SET lat = ?, lng = ? WHERE id = ?', [coords.lat, coords.lng, inc.id])
      }
      const cl = await classifyWithClaude(inc.nature, inc.disposition, inc.location)
      await db.run(
        'UPDATE incidents SET severity = ?, ai_summary = ?, ai_recommendation = ? WHERE id = ?',
        [cl.severity, cl.aiSummary, cl.aiRecommendation, inc.id]
      )
      await new Promise((r) => setTimeout(r, 1100))
    }
    console.log(`[Import] Background geocoding + AI classification complete for ${inserted.length} records.`)
  })
})

module.exports = router

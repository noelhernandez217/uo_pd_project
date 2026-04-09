const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const db = require('./db')
const { classifyHeuristic } = require('./classifier')

const RESOLVED_DISPOSITIONS = [
  'suspended. inactive.',
  'other.',
  'others.',
  'unfounded.',
]

function resolveStatus(disposition) {
  if (!disposition) return 'open'
  const d = disposition.toLowerCase()
  if (d.startsWith('cleared')) return 'resolved'
  if (RESOLVED_DISPOSITIONS.includes(d)) return 'resolved'
  if (d === 'open.' || d === 'open') return 'open'
  return 'resolved'
}

function parseDate(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('@')
  const datePart = parts[0].trim()
  const timePart = parts[1] ? parts[1].trim().padStart(4, '0') : '0000'

  const [month, day, year] = datePart.split('/')
  if (!month || !day || !year) return dateStr

  const fullYear = parseInt(year) < 100 ? 2000 + parseInt(year) : parseInt(year)
  const hours = timePart.substring(0, 2)
  const minutes = timePart.substring(2, 4)

  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hours}:${minutes}`
}

async function seedDatabase() {
  const existing = await db.get('SELECT COUNT(*) as count FROM incidents')
  if (existing && existing.count > 0) {
    console.log(`Database already seeded with ${existing.count} incidents. Skipping.`)
    return
  }

  const csvPath = path.join(__dirname, '..', 'clery_crime_log_2026.csv')
  if (!fs.existsSync(csvPath)) {
    console.warn('CSV file not found at:', csvPath)
    return
  }

  const content = fs.readFileSync(csvPath, 'utf8')
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true })

  const rows = records.map((r) => {
    const nature = r['Nature'] || r['nature'] || ''
    const disposition = r['Disposition'] || r['disposition'] || ''
    const cl = classifyHeuristic(nature, disposition)
    return {
      nature,
      case_number:       r['Case #'] || r['case #'] || '',
      date_reported:     parseDate(r['Date Reported'] || r['date reported'] || ''),
      date_occurred:     parseDate(r['Date/Time Occurred'] || r['date/time occurred'] || ''),
      location:          r['General Location'] || r['general location'] || '',
      disposition,
      severity:          cl.severity,
      ai_summary:        cl.aiSummary,
      ai_recommendation: cl.aiRecommendation,
      status:            resolveStatus(disposition),
      campus:            'University of Oregon',
    }
  })

  let inserted = 0
  for (const row of rows) {
    await db.run(`
      INSERT INTO incidents
        (nature, case_number, date_reported, date_occurred, location, disposition,
         severity, ai_summary, ai_recommendation, status, campus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      row.nature, row.case_number, row.date_reported, row.date_occurred,
      row.location, row.disposition, row.severity, row.ai_summary,
      row.ai_recommendation, row.status, row.campus,
    ])
    inserted++
  }

  console.log(`Seeded ${inserted} incidents from CSV.`)
}

module.exports = { seedDatabase }

const express = require('express')
const router = express.Router()
router.use('/:id/notes', require('./notes'))
const db = require('../db')
const { classifyWithClaude } = require('../classifier')
const { geocodeAddress } = require('../geocoder')
const { getConfig } = require('../campus.config')

// GET /api/incidents/map — geocoded incidents for map view
router.get('/map', async (req, res) => {
  try {
    const incidents = await db.all(`
      SELECT id, nature, location, date_occurred, severity, status,
             ai_summary, ai_recommendation, case_number, lat, lng
      FROM incidents
      WHERE lat IS NOT NULL AND lng IS NOT NULL
    `)
    res.json(incidents)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/incidents
router.get('/', async (req, res) => {
  try {
    const { status, severity, campus, type, search } = req.query

    let query = 'SELECT * FROM incidents WHERE 1=1'
    const params = []

    if (status)   { query += ' AND status = ?';              params.push(status) }
    if (severity) { query += ' AND severity = ?';            params.push(severity) }
    if (campus)   { query += ' AND campus = ?';              params.push(campus) }
    if (type)     { query += ' AND nature LIKE ?';           params.push(`%${type}%`) }
    if (search) {
      query += ' AND (nature LIKE ? OR location LIKE ? OR case_number LIKE ? OR ai_summary LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    query += ' ORDER BY date_occurred DESC'

    const incidents = await db.all(query, params)
    res.json(incidents)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/incidents/:id
router.get('/:id', async (req, res) => {
  try {
    const incident = await db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id])
    if (!incident) return res.status(404).json({ error: 'Incident not found' })
    res.json(incident)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/incidents
router.post('/', async (req, res) => {
  const { nature, location, dateOccurred, description } = req.body

  if (!nature || !location) {
    return res.status(400).json({ error: 'nature and location are required' })
  }

  try {
    const classification = await classifyWithClaude(nature, description, location)

    const { insertId } = await db.run(`
      INSERT INTO incidents
        (nature, location, date_occurred, disposition, severity,
         ai_summary, ai_recommendation, status, campus)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
      RETURNING id
    `, [
      nature,
      location,
      dateOccurred || new Date().toISOString(),
      description || '',
      classification.severity,
      classification.aiSummary,
      classification.aiRecommendation,
      getConfig().campusName,
    ])

    const incident = await db.get('SELECT * FROM incidents WHERE id = ?', [insertId])

    // Geocode in background
    geocodeAddress(location).then(async (coords) => {
      if (coords) {
        await db.run('UPDATE incidents SET lat = ?, lng = ? WHERE id = ?', [coords.lat, coords.lng, insertId])
      }
    })

    res.status(201).json(incident)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create incident' })
  }
})

// PATCH /api/incidents/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body
  const validStatuses = ['open', 'in-progress', 'resolved']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` })
  }

  try {
    const sql = status === 'resolved'
      ? 'UPDATE incidents SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?'
      : 'UPDATE incidents SET status = ?, resolved_at = NULL WHERE id = ?'

    const { changes } = await db.run(sql, [status, req.params.id])
    if (changes === 0) return res.status(404).json({ error: 'Incident not found' })

    const incident = await db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id])
    res.json(incident)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

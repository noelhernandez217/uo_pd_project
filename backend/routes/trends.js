const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/trends
router.get('/', async (req, res) => {
  try {
    const byType = await db.all(`
      SELECT nature as type, COUNT(*) as count
      FROM incidents
      GROUP BY nature
      ORDER BY count DESC
      LIMIT 8
    `)

    const bySeverity = await db.all(`
      SELECT severity, COUNT(*) as count
      FROM incidents
      GROUP BY severity
      ORDER BY CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high'     THEN 2
        WHEN 'medium'   THEN 3
        WHEN 'low'      THEN 4
      END
    `)

    const byStatus = await db.all(`
      SELECT status, COUNT(*) as count
      FROM incidents
      GROUP BY status
    `)

    // Compute cutoff in JS so the same query works in both SQLite and pg
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const sinceDateStr = since.toISOString().slice(0, 10)

    const byDay = await db.all(`
      SELECT
        substr(date_occurred, 1, 10) as date,
        COUNT(*) as count
      FROM incidents
      WHERE date_occurred IS NOT NULL
        AND date_occurred >= ?
      GROUP BY date
      ORDER BY date ASC
    `, [sinceDateStr])

    const totals = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as "inProgress",
        SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN severity = 'critical'  THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'high'      THEN 1 ELSE 0 END) as high
      FROM incidents
    `)

    res.json({ byType, bySeverity, byStatus, byDay, totals })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

const express = require('express')
const router = express.Router({ mergeParams: true }) // access :id from parent
const db = require('../db')

// GET /api/incidents/:id/notes
router.get('/', async (req, res) => {
  try {
    const notes = await db.all(
      'SELECT * FROM incident_notes WHERE incident_id = ? ORDER BY created_at ASC',
      [req.params.id]
    )
    res.json(notes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/incidents/:id/notes
router.post('/', async (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'Note text is required' })

  try {
    const { insertId } = await db.run(
      'INSERT INTO incident_notes (incident_id, text) VALUES (?, ?) RETURNING id',
      [req.params.id, text.trim()]
    )
    const note = await db.get('SELECT * FROM incident_notes WHERE id = ?', [insertId])
    res.status(201).json(note)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/incidents/:id/notes/:noteId
router.delete('/:noteId', async (req, res) => {
  try {
    const { changes } = await db.run(
      'DELETE FROM incident_notes WHERE id = ? AND incident_id = ?',
      [req.params.noteId, req.params.id]
    )
    if (changes === 0) return res.status(404).json({ error: 'Note not found' })
    res.json({ deleted: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

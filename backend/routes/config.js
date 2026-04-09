const express = require('express')
const router = express.Router()
const { getConfig, setConfig } = require('../campus.config')

const ALLOWED_KEYS = [
  'campusName', 'campusLat', 'campusLng', 'campusRadiusMeters',
  'campusCity', 'campusState', 'pdDispatchUrl', 'pdDispatchEnabled',
]

// GET /api/config
router.get('/', (req, res) => {
  res.json(getConfig())
})

// PATCH /api/config
router.patch('/', async (req, res) => {
  const updates = {}
  for (const key of ALLOWED_KEYS) {
    if (key in req.body) updates[key] = req.body[key]
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid config keys provided' })
  }
  try {
    await setConfig(updates)
    res.json(getConfig())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

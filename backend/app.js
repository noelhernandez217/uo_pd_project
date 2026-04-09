require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { getConfig } = require('./campus.config')

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

// Routes
app.use('/api/incidents',  require('./routes/incidents'))
app.use('/api/trends',     require('./routes/trends'))
app.use('/api/import',     require('./routes/import'))
app.use('/api/config',     require('./routes/config'))
app.use('/api/transcribe', require('./routes/transcribe'))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', campus: getConfig().campusName })
})

app.get('/api/scraper/status', (req, res) => {
  const { getStatus } = require('./scraper')
  res.json(getStatus())
})

app.post('/api/scraper/poll', (req, res) => {
  const { pollEPDLog } = require('./scraper')
  res.json({ message: 'Poll triggered' })
  pollEPDLog()
})

// One-time async initialization — must be awaited before the app handles requests.
// Loads config, seeds DB (no-op if already seeded), geocodes, starts EPD polling.
async function init() {
  const { loadConfig } = require('./campus.config')
  const { seedDatabase } = require('./seed')
  const { geocodeAllPending } = require('./geocoder')
  const { startPolling } = require('./scraper')
  const db = require('./db')

  await loadConfig()   // must run before anything that calls getConfig()
  await seedDatabase() // no-op if DB already has incidents
  geocodeAllPending(db) // runs in background (long-running, don't await)
  startPolling()        // kicks off EPD polling loop
}

module.exports = { app, init }

const https = require('https')
const { getConfig } = require('./campus.config')
const { lookupAlias, normalizeLocation } = require('./locationAliases')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function geocodeAddress(address) {
  // 1. Check alias map first (intersections, vague entries)
  const aliasResult = lookupAlias(address)
  if (aliasResult !== undefined) {
    return Promise.resolve(aliasResult) // may be null (skip) or {lat,lng}
  }

  // 2. Normalize the address before sending to Nominatim
  const normalized = normalizeLocation(address)

  const { campusCity, campusState } = getConfig()
  return new Promise((resolve) => {
    const query = encodeURIComponent(`${normalized}, ${campusCity}, ${campusState}`)
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`
    const options = {
      headers: { 'User-Agent': 'CampusSafe/1.0 (university campus safety tool)' },
    }

    https.get(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const results = JSON.parse(data)
          if (results.length > 0) {
            resolve({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) })
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      })
    }).on('error', () => resolve(null))
  })
}

async function geocodeAllPending(db) {
  const uniqueLocations = await db.all(`
    SELECT DISTINCT location FROM incidents
    WHERE lat IS NULL AND location IS NOT NULL AND location != ''
  `)

  if (uniqueLocations.length === 0) {
    console.log('All incidents already geocoded.')
    return
  }

  console.log(`Geocoding ${uniqueLocations.length} unique locations in background...`)

  for (const { location } of uniqueLocations) {
    const coords = await geocodeAddress(location)
    if (coords) {
      await db.run(
        'UPDATE incidents SET lat = ?, lng = ? WHERE location = ?',
        [coords.lat, coords.lng, location]
      )
    }
    await sleep(1100) // Nominatim rate limit: 1 req/sec
  }

  const result = await db.get('SELECT COUNT(*) as count FROM incidents WHERE lat IS NOT NULL')
  console.log(`Geocoding complete. ${result?.count ?? 0} incidents now have coordinates.`)
}

module.exports = { geocodeAddress, geocodeAllPending }

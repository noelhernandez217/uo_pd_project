'use strict'

// Hardcoded coordinates for Eugene/UO-area intersections and
// vague entries that Nominatim cannot resolve on its own.
// Coordinates are approximate — accurate to within ~50m.
const KNOWN_COORDS = {
  // Vague/unusable
  'general location':          null,
  'off campus location':       null,

  // UO-area intersections (slash format in raw data)
  'agate st/15th ave':         { lat: 44.0437, lng: -123.0700 },
  'e 13th aly/kincaid st':     { lat: 44.0467, lng: -123.0760 },
  'e 13th ave/agate st':       { lat: 44.0469, lng: -123.0700 },
  'e 13th ave/university st':  { lat: 44.0469, lng: -123.0735 },
  'e 14th ave/kincaid st':     { lat: 44.0453, lng: -123.0760 },
  'e 15th ave/moss st':        { lat: 44.0437, lng: -123.0796 },
  'e 15th ave/university st':  { lat: 44.0437, lng: -123.0735 },
  'e 15th/moss st':            { lat: 44.0437, lng: -123.0796 },
  'e 19th ave/agate aly':      { lat: 44.0374, lng: -123.0700 },
  'e 19th ave/potter st':      { lat: 44.0374, lng: -123.0710 },
  'e 24th/emerald st':         { lat: 44.0310, lng: -123.0790 },
  'hilyard st/e 18th aly':     { lat: 44.0390, lng: -123.0756 },
  'ne 29th ave/liberty st':    { lat: 44.0786, lng: -123.0680 },
  'patterson/e broadway':      { lat: 44.0560, lng: -123.0920 },
  'w 6th aly/madison st':      { lat: 44.0490, lng: -123.0965 },
}

// Normalize an address string before sending to Nominatim:
//   1. Strip "Blk" block prefix  (1900 Blk Jefferson → 1900 Jefferson)
//   2. Expand bare street names missing their type suffix
//   3. Convert slash intersections to & format Nominatim understands
function normalizeLocation(address) {
  if (!address) return address
  let s = address.trim()

  // "1900 Blk Jefferson St" → "1900 Jefferson St"
  s = s.replace(/\bBlk\b\s*/i, '')

  // Bare name with no suffix — only expand when the next token is a number or end-of-string
  s = s.replace(/\bKincaid\b(?!\s+(St|Ave|Blvd|Dr|Ln|Rd))/i,  'Kincaid St')
  s = s.replace(/\bAgate\b(?!\s+(St|Ave|Blvd|Dr|Ln|Rd))/i,    'Agate St')
  s = s.replace(/\bFranklin\b(?!\s+(St|Ave|Blvd|Dr|Ln|Rd))/i, 'Franklin Blvd')
  s = s.replace(/\bPatterson\b(?!\s+(St|Ave|Blvd|Dr|Ln|Rd))/i,'Patterson St')

  // "A/B" intersection → "A & B" (Nominatim handles & better than /)
  if (s.includes('/')) {
    s = s.replace('/', ' & ')
  }

  return s.trim()
}

// Look up an address — returns { lat, lng } | null | undefined
//   { lat, lng }  → use these coords directly
//   null          → known-unresolvable, skip geocoding
//   undefined     → not in alias map, proceed to Nominatim
function lookupAlias(address) {
  if (!address) return undefined
  const key = address.trim().toLowerCase()
  if (Object.prototype.hasOwnProperty.call(KNOWN_COORDS, key)) {
    return KNOWN_COORDS[key] // may be null (intentional skip)
  }
  return undefined
}

module.exports = { KNOWN_COORDS, normalizeLocation, lookupAlias }

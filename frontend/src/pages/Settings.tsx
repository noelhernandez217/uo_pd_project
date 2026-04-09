import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { CampusConfig, updateConfig } from '../api/config'
import { useCampus } from '../context/CampusContext'
import { fireToast } from '../components/Toast'
import { KNOWN_DISPATCH_FEEDS } from '../data/knownDispatchFeeds'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: { city?: string; town?: string; village?: string; state?: string; country_code?: string }
}

function RecenterMap({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: 0.8 }) }, [lat, lng, zoom, map])
  return null
}

export default function Settings() {
  const { config, reload } = useCampus()
  const [form, setForm] = useState<CampusConfig>(config)
  const [saving, setSaving] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // Campus search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync form when config loads from server
  useEffect(() => { setForm(config) }, [config])
  // Small delay so the map container has dimensions before rendering
  useEffect(() => { const t = setTimeout(() => setMapReady(true), 100); return () => clearTimeout(t) }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSearchInput(value: string) {
    setSearchQuery(value)
    setShowResults(true)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (!value.trim()) { setSearchResults([]); return }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true)
      try {
        const q = encodeURIComponent(value)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=6&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const data: NominatimResult[] = await res.json()
        setSearchResults(data)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
  }

  function handleSelectResult(result: NominatimResult) {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    const addr = result.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? form.campusCity
    const state = addr.state ?? form.campusState
    // Extract a short display name (first comma-separated segment)
    const shortName = result.display_name.split(',')[0].trim()

    setForm((prev) => ({
      ...prev,
      campusLat: lat,
      campusLng: lng,
      campusCity: city,
      campusState: state,
      campusName: shortName,
    }))
    setSearchQuery(shortName)
    setShowResults(false)
  }

  function set<K extends keyof CampusConfig>(key: K, value: CampusConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateConfig(form)
      reload()
      fireToast(`Settings saved for ${form.campusName}`, 'info')
    } catch {
      fireToast('Failed to save settings', 'critical')
    } finally {
      setSaving(false)
    }
  }

  const previewLat = isNaN(form.campusLat) ? config.campusLat : form.campusLat
  const previewLng = isNaN(form.campusLng) ? config.campusLng : form.campusLng
  const radiusMiles = (form.campusRadiusMeters / 1609.34).toFixed(2)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Campus Settings</h1>
        <p className="text-sm text-gray-400 mt-1">
          Configure CampusSafe for your institution. Changes apply immediately — no restart required.
        </p>
      </div>

      {/* Campus Search */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Find Your Campus</h2>
          <p className="text-xs text-gray-400 mt-0.5">Search by university name to automatically set coordinates and location fields.</p>
        </div>
        <div ref={searchRef} className="relative">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder="e.g. Oregon State University, Corvallis"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-pulse">…</span>
            )}
          </div>
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
              {searchResults.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => handleSelectResult(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{r.display_name.split(',')[0]}</p>
                  <p className="text-xs text-gray-400 truncate">{r.display_name.split(',').slice(1, 3).join(',').trim()}</p>
                </button>
              ))}
            </div>
          )}
          {showResults && !searching && searchQuery.trim() && searchResults.length === 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl px-4 py-3">
              <p className="text-sm text-gray-400">No results found. Try a more specific name.</p>
            </div>
          )}
        </div>
      </section>

      {/* Campus Identity */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Campus Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Campus Name</label>
            <input
              type="text"
              value={form.campusName}
              onChange={(e) => set('campusName', e.target.value)}
              placeholder="e.g. Oregon State University"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <input
              type="text"
              value={form.campusCity}
              onChange={(e) => set('campusCity', e.target.value)}
              placeholder="e.g. Corvallis"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
            <input
              type="text"
              value={form.campusState}
              onChange={(e) => set('campusState', e.target.value.toUpperCase().slice(0, 2))}
              placeholder="OR"
              maxLength={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </section>

      {/* Geographic Boundary */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Geographic Boundary</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Sets the campus center point and patrol radius. Only incidents from your local PD feed that fall within this radius are imported.
          </p>
        </div>

        {/* Map preview */}
        <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 240 }}>
          {mapReady && (
            <MapContainer
              center={[previewLat, previewLng]}
              zoom={14}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Circle
                center={[previewLat, previewLng]}
                radius={form.campusRadiusMeters}
                pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.08, weight: 2 }}
              />
              <RecenterMap lat={previewLat} lng={previewLng} zoom={14} />
            </MapContainer>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
            <input
              type="number"
              step="0.0001"
              value={form.campusLat}
              onChange={(e) => set('campusLat', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
            <input
              type="number"
              step="0.0001"
              value={form.campusLng}
              onChange={(e) => set('campusLng', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Patrol Radius — {form.campusRadiusMeters.toLocaleString()} m ({radiusMiles} mi)
          </label>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={form.campusRadiusMeters}
            onChange={(e) => set('campusRadiusMeters', parseInt(e.target.value))}
            className="w-full accent-green-700"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>200 m</span>
            <span>5,000 m</span>
          </div>
        </div>
      </section>

      {/* Live Dispatch Feed */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Live Dispatch Feed</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            URL of your local police department's public dispatch log. Must be an HTML table format. Polled every 10 minutes.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Enable dispatch feed</span>
          <button
            onClick={() => set('pdDispatchEnabled', !form.pdDispatchEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              form.pdDispatchEnabled ? 'bg-green-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.pdDispatchEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {form.pdDispatchEnabled && (
          <div className="space-y-3">
            {/* Curated feed selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Select a known feed</label>
              <select
                defaultValue=""
                onChange={(e) => {
                  const feed = KNOWN_DISPATCH_FEEDS.find((f) => f.id === e.target.value)
                  if (feed?.url) set('pdDispatchUrl', feed.url)
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="">— Select a department —</option>
                {KNOWN_DISPATCH_FEEDS.map((feed) => (
                  <option
                    key={feed.id}
                    value={feed.id}
                    disabled={!feed.url}
                  >
                    {feed.label} · {feed.university}
                    {feed.status === 'verified' ? ' ✓' : ' (unverified)'}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                ✓ = confirmed compatible with CampusSafe scraper. Unverified feeds may require format adjustments.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-gray-100" />
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">or enter manually</span>
              <div className="flex-1 border-t border-gray-100" />
            </div>

            {/* Manual URL input */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dispatch Log URL</label>
              <input
                type="url"
                value={form.pdDispatchUrl}
                onChange={(e) => set('pdDispatchUrl', e.target.value)}
                placeholder="https://your-local-pd.gov/dispatchlog"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Must be a public HTML page with a table of dispatch calls. Polled every 10 minutes.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Save */}
      <div className="flex items-center justify-between pb-8">
        <p className="text-xs text-gray-400">
          Settings are stored in the local database and take effect on the next scraper poll.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-green-700 text-white rounded-lg px-6 py-2.5 text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

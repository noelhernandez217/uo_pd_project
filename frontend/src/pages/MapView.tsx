import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Incident } from '../api/incidents'
import ClusterLayer from '../components/ClusterLayer'
import { useCampus } from '../context/CampusContext'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  high:     'bg-orange-50 border-orange-200 text-orange-700',
  medium:   'bg-yellow-50 border-yellow-200 text-yellow-700',
  low:      'bg-green-50 border-green-200 text-green-700',
}

// Fallback center — overridden by campus config at runtime
const DEFAULT_CENTER: [number, number] = [44.0449, -123.0722]

function FlyToLocation({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], 18, { duration: 1.2 })
  }, [map, lat, lng])
  return null
}

interface MapIncident extends Incident {
  lat: number
  lng: number
}

type DatePreset = 'today' | '7d' | '30d' | 'all' | 'custom'

function toDateStr(d: Date) {
  // Use local calendar date, not UTC, so "today" matches the user's clock
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function incidentLocalDate(dateOccurred: string): string {
  return toDateStr(new Date(dateOccurred))
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateStr(d)
}

const DATE_PRESETS: { label: string; id: DatePreset }[] = [
  { label: 'Today',        id: 'today'  },
  { label: 'Past 7 Days',  id: '7d'     },
  { label: 'Past 30 Days', id: '30d'    },
  { label: 'All Time',     id: 'all'    },
  { label: 'Custom Range', id: 'custom' },
]

export default function MapView() {
  const { config } = useCampus()
  const campusCenter: [number, number] = [config.campusLat, config.campusLng]
  const [searchParams] = useSearchParams()
  const flyLat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null
  const flyLng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : null

  const [incidents, setIncidents] = useState<MapIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [panelOpen, setPanelOpen] = useState(true)
  const [preset, setPreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState(daysAgo(7))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))

  async function fetchMapIncidents() {
    try {
      const res = await fetch('/api/incidents/map')
      const data = await res.json()
      setIncidents(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMapIncidents() }, [lastRefresh])
  useEffect(() => {
    const interval = setInterval(() => setLastRefresh(Date.now()), 15000)
    return () => clearInterval(interval)
  }, [])

  const { dateFrom, dateTo } = useMemo(() => {
    const today = toDateStr(new Date())
    switch (preset) {
      case 'today':  return { dateFrom: today,      dateTo: today }
      case '7d':     return { dateFrom: daysAgo(7), dateTo: today }
      case '30d':    return { dateFrom: daysAgo(30),dateTo: today }
      case 'custom': return { dateFrom: customFrom, dateTo: customTo }
      default:       return { dateFrom: null,        dateTo: null }
    }
  }, [preset, customFrom, customTo])

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (severityFilter !== 'all' && i.severity !== severityFilter) return false
      if (dateFrom && i.dateOccurred && incidentLocalDate(i.dateOccurred) < dateFrom) return false
      if (dateTo   && i.dateOccurred && incidentLocalDate(i.dateOccurred) > dateTo)   return false
      return true
    })
  }, [incidents, severityFilter, dateFrom, dateTo])

  const severityCounts = useMemo(() => ({
    critical: filtered.filter((i) => i.severity === 'critical').length,
    high:     filtered.filter((i) => i.severity === 'high').length,
    medium:   filtered.filter((i) => i.severity === 'medium').length,
    low:      filtered.filter((i) => i.severity === 'low').length,
  }), [filtered])

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* Full-screen map */}
      <MapContainer
        center={campusCenter.some(isNaN) ? DEFAULT_CENTER : campusCenter}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filtered.length > 0 && (
          <ClusterLayer
            key={`${severityFilter}-${dateFrom}-${dateTo}-${lastRefresh}`}
            incidents={filtered}
            clusterRadius={1}
          />
        )}
        {flyLat !== null && flyLng !== null && (
          <FlyToLocation lat={flyLat} lng={flyLng} />
        )}
      </MapContainer>

      {/* Floating side panel */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: panelOpen ? 12 : -296,
          width: 296,
          bottom: 12,
          zIndex: 1000,
          transition: 'left 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* Header card */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-4" style={{ pointerEvents: 'auto' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900 text-sm leading-tight">Incident Map</h2>
              <p className="text-xs text-gray-400 mt-0.5">{config.campusName}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                {loading ? 'geocoding...' : 'incidents'}
              </p>
            </div>
          </div>

          {/* Mini severity breakdown bar */}
          <div className="mt-3 flex rounded-full overflow-hidden h-2 gap-px">
            {(['critical','high','medium','low'] as const).map((s) => {
              const pct = filtered.length > 0 ? (severityCounts[s] / filtered.length) * 100 : 0
              return pct > 0 ? (
                <div
                  key={s}
                  title={`${s}: ${severityCounts[s]}`}
                  style={{ width: `${pct}%`, background: SEVERITY_COLORS[s] }}
                />
              ) : null
            })}
          </div>
          <div className="flex justify-between mt-1">
            {(['critical','high','medium','low'] as const).map((s) => (
              <span key={s} className="text-[10px] text-gray-400">
                <span style={{ color: SEVERITY_COLORS[s] }}>●</span> {severityCounts[s]}
              </span>
            ))}
          </div>

          {/* Pin legend */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Pin Legend</p>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: '#ef4444' }} />
              Colored = Open (by severity)
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="relative inline-flex items-center justify-center w-4 h-4">
                <span className="absolute inline-block w-3 h-3 rounded-full bg-purple-400 opacity-50 animate-ping" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-white" />
              </span>
              Purple pulse = Responding
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-white shadow opacity-50" style={{ background: '#9ca3af' }} />
              Gray = Resolved
            </div>
          </div>
        </div>

        {/* Severity filter card */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-4" style={{ pointerEvents: 'auto' }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Filter by Severity</p>
          <div className="space-y-1.5">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                severityFilter === 'all'
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              All Severities
              <span className={`float-right font-normal ${severityFilter === 'all' ? 'text-green-200' : 'text-gray-400'}`}>
                {incidents.length}
              </span>
            </button>
            {(['critical','high','medium','low'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s === severityFilter ? 'all' : s)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  severityFilter === s
                    ? `${SEVERITY_BG[s]} border-current`
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ background: SEVERITY_COLORS[s] }}
                />
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="float-right font-normal text-gray-400">
                  {incidents.filter((i) => i.severity === s).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Date filter card */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-4" style={{ pointerEvents: 'auto' }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Filter by Date</p>
          <div className="space-y-1.5">
            {DATE_PRESETS.filter((p) => p.id !== 'custom').map(({ label, id }) => (
              <button
                key={id}
                onClick={() => setPreset(id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  preset === id
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setPreset('custom')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                preset === 'custom'
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              Custom Range
            </button>
            {preset === 'custom' && (
              <div className="space-y-2 pt-1">
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">From</p>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">To</p>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={toDateStr(new Date())}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Refresh */}
        <button
          onClick={() => setLastRefresh(Date.now())}
          className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 px-4 py-2.5 text-xs text-green-700 font-semibold hover:bg-green-50/80 transition-colors text-left"
          style={{ pointerEvents: 'auto' }}
        >
          ↻ Refresh Map
          {loading && <span className="float-right text-blue-400 font-normal animate-pulse">Geocoding...</span>}
        </button>

        {/* Spacer so the custom date calendar has room to open below the inputs */}
        {preset === 'custom' && (
          <div style={{ height: 220, flexShrink: 0, pointerEvents: 'none' }} />
        )}
      </div>

      {/* Panel toggle tab */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        style={{
          position: 'absolute',
          top: '50%',
          left: panelOpen ? 320 : 12,
          transform: 'translateY(-50%)',
          zIndex: 1001,
          transition: 'left 0.25s ease',
          pointerEvents: 'auto',
        }}
        className="bg-white/80 backdrop-blur-md shadow-lg border border-white/60 rounded-r-xl px-1.5 py-3 text-gray-500 hover:text-green-700 hover:bg-green-50/80 transition-colors"
        title={panelOpen ? 'Collapse panel' : 'Expand panel'}
      >
        <span className="text-sm">{panelOpen ? '‹' : '›'}</span>
      </button>

      {/* Empty state */}
      {filtered.length === 0 && !loading && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 999, pointerEvents: 'none' }}
          className="flex items-center justify-center"
        >
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 px-8 py-6 text-center">
            <p className="text-gray-700 font-semibold">No incidents in this range</p>
            <p className="text-gray-400 text-sm mt-1">Adjust the severity or date filter</p>
          </div>
        </div>
      )}
    </div>
  )
}

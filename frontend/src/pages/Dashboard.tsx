import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Incident, getIncidents, updateStatus, addNote } from '../api/incidents'
import MicButton from '../components/MicButton'
import SeverityBadge from '../components/SeverityBadge'
import StatusBadge from '../components/StatusBadge'
import IncidentDetail from '../components/IncidentDetail'
import { fireToast } from '../components/Toast'
import { useCampus } from '../context/CampusContext'

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'just now'
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  return `${days}d ago`
}

export default function Dashboard() {
  const { config } = useCampus()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Incident | null>(null)
  const [scraperStatus, setScraperStatus] = useState<{ lastPollTime: string | null; lastPollAdded: number } | null>(null)
  const [showAllOpen, setShowAllOpen] = useState(false)
  const [quickSaving, setQuickSaving] = useState<number | null>(null)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const knownIdsRef = useRef<Set<number> | null>(null)

  const fetchAll = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true)
    try {
      const data = await getIncidents()
      if (isPolling && knownIdsRef.current) {
        data.forEach((inc) => {
          if (!knownIdsRef.current!.has(inc.id)) {
            const toastType = inc.severity === 'critical' ? 'critical'
              : inc.severity === 'high' ? 'warning' : 'info'
            fireToast(`New incident: ${inc.nature} — ${inc.location || inc.campus}`, toastType)
          }
        })
      }
      knownIdsRef.current = new Set(data.map((i) => i.id))
      setIncidents(data)
    } finally {
      if (!isPolling) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll for new incidents every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchAll(true), 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  useEffect(() => {
    const fetchStatus = () =>
      fetch('/api/scraper/status').then((r) => r.json()).then(setScraperStatus).catch(() => {})
    fetchStatus()
    const interval = setInterval(fetchStatus, 60000)
    return () => clearInterval(interval)
  }, [])

  function handleStatusChange(updated: Incident) {
    setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    setSelected(updated)
  }

  async function handleQuickStatus(e: React.MouseEvent, incident: Incident, status: string) {
    e.stopPropagation()
    setQuickSaving(incident.id)
    try {
      const updated = await updateStatus(incident.id, status)
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
      if (selected?.id === updated.id) setSelected(updated)
    } finally {
      setQuickSaving(null)
    }
  }

  async function handleConfirmResolve(e: React.MouseEvent, incident: Incident) {
    e.stopPropagation()
    if (!resolveNote.trim()) return
    setQuickSaving(incident.id)
    try {
      await addNote(incident.id, resolveNote.trim())
      const updated = await updateStatus(incident.id, 'resolved')
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
      if (selected?.id === updated.id) setSelected(updated)
      setResolvingId(null)
      setResolveNote('')
    } finally {
      setQuickSaving(null)
    }
  }

  function localDateStr(isoStr: string): string {
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // ── Active Queue: open + in-progress, past 14 days by default ────────
  const cutoff14 = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  }, [])

  const activeQueue = useMemo(() => {
    return incidents
      .filter((i) => {
        if (i.status !== 'open' && i.status !== 'in-progress') return false
        if (!showAllOpen && i.dateOccurred && i.dateOccurred.slice(0, 10) < cutoff14) return false
        return true
      })
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  }, [incidents, showAllOpen, cutoff14])

  const stalledCount = useMemo(() =>
    incidents.filter((i) =>
      (i.status === 'open' || i.status === 'in-progress') &&
      i.dateOccurred && i.dateOccurred.slice(0, 10) < cutoff14
    ).length,
    [incidents, cutoff14]
  )

  // ── Recent Feed: last 12 incidents by dateOccurred ─────────────────────
  const recentFeed = useMemo(() =>
    [...incidents]
      .filter((i) => i.dateOccurred)
      .sort((a, b) => b.dateOccurred!.localeCompare(a.dateOccurred!))
      .slice(0, 12),
    [incidents]
  )

  // ── Hotspots: locations with 2+ open incidents in past 7 days ─────────
  const hotspots = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const locationMap: Record<string, Incident[]> = {}
    incidents.forEach((i) => {
      if (!i.location || !i.dateOccurred) return
      if (i.dateOccurred.slice(0, 10) < cutoffStr) return
      if (!locationMap[i.location]) locationMap[i.location] = []
      locationMap[i.location].push(i)
    })

    return Object.entries(locationMap)
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4)
  }, [incidents])

  const resolvedToday = useMemo(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return [...incidents]
      .filter((i) => i.status === 'resolved' && i.resolvedAt && localDateStr(i.resolvedAt) === today)
      .sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!))
      .slice(0, 6)
  }, [incidents])

  const criticalCount = activeQueue.filter((i) => i.severity === 'critical').length
  const highCount     = activeQueue.filter((i) => i.severity === 'high').length

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Shift header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-5 w-48 bg-gray-200 rounded-lg" />
          <div className="skeleton h-3 w-64 bg-gray-100 rounded-lg" />
        </div>
        <div className="skeleton h-7 w-28 bg-gray-100 rounded-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue skeleton */}
        <div className="lg:col-span-2 space-y-3">
          <div className="skeleton h-4 w-32 bg-gray-200 rounded" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-start gap-4">
              <div className="skeleton w-1 self-stretch rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <div className="skeleton h-4 w-40 bg-gray-200 rounded" />
                  <div className="skeleton h-4 w-16 bg-gray-100 rounded-full" />
                </div>
                <div className="skeleton h-3 w-56 bg-gray-100 rounded" />
                <div className="skeleton h-3 w-72 bg-gray-100 rounded" />
              </div>
              <div className="skeleton h-3 w-12 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        {/* Right col skeleton */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div className="skeleton h-3 w-32 bg-gray-200 rounded" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="skeleton w-2 h-2 rounded-full bg-gray-200 mt-1" />
                <div className="flex-1 space-y-1">
                  <div className="skeleton h-3 w-full bg-gray-100 rounded" />
                  <div className="skeleton h-2 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Shift header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dispatch Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{config.campusName} · {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</p>
        </div>
        {scraperStatus?.lastPollTime && (
          <div className="text-xs text-gray-400 hidden sm:block">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5 animate-pulse"/>
            EPD live · last synced {new Date(scraperStatus.lastPollTime).toLocaleTimeString()}
            {scraperStatus.lastPollAdded > 0 && (
              <span className="ml-1 text-green-600 font-medium">+{scraperStatus.lastPollAdded} new</span>
            )}
          </div>
        )}
        <div className="flex gap-3">
          {criticalCount > 0 && (
            <span className="bg-red-100 text-red-700 border border-red-300 text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
              {criticalCount} CRITICAL
            </span>
          )}
          {highCount > 0 && (
            <span className="bg-orange-100 text-orange-700 border border-orange-300 text-xs font-bold px-3 py-1.5 rounded-full">
              {highCount} HIGH
            </span>
          )}
          {criticalCount === 0 && highCount === 0 && (
            <span className="bg-green-100 text-green-700 border border-green-300 text-xs font-semibold px-3 py-1.5 rounded-full">
              No critical alerts
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Active Queue (left, 2/3) ───────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Active Queue
              {!showAllOpen && <span className="ml-2 text-gray-400 font-normal normal-case">· past 14 days</span>}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{activeQueue.length} unresolved</span>
              {stalledCount > 0 && (
                <button
                  onClick={() => setShowAllOpen((v) => !v)}
                  className="text-xs underline text-amber-600 hover:text-amber-800"
                >
                  {showAllOpen
                    ? 'Show recent only'
                    : `+ ${stalledCount} older open incident${stalledCount !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>

          {activeQueue.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-12 text-center">
              <p className="text-green-600 font-semibold">All clear</p>
              <p className="text-gray-400 text-sm mt-1">No open incidents</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeQueue.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => setSelected(incident)}
                  className={`rounded-xl border shadow-sm px-4 py-3 flex items-start gap-4 cursor-pointer hover:shadow-md transition-all ${
                    incident.status === 'in-progress'
                      ? 'bg-purple-50 border-purple-200 hover:border-purple-400'
                      : 'bg-white border-gray-200 hover:border-green-300'
                  }`}
                >
                  {/* Severity bar */}
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ background: SEVERITY_COLORS[incident.severity] ?? '#d1d5db' }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{incident.nature}</span>
                      <SeverityBadge severity={incident.severity} />
                      <StatusBadge status={incident.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{incident.location}</p>
                    {incident.aiRecommendation && (
                      <p className="text-xs text-blue-600 mt-1 italic truncate">{incident.aiRecommendation}</p>
                    )}
                    {resolvingId === incident.id ? (
                      <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1.5 items-start">
                          <textarea
                            autoFocus
                            value={resolveNote}
                            onChange={(e) => setResolveNote(e.target.value)}
                            placeholder="Resolution summary — what happened? Who responded? (required)"
                            rows={2}
                            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                          />
                          <MicButton
                            onTranscript={(t) => setResolveNote((prev) => prev ? `${prev} ${t}` : t)}
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            disabled={!resolveNote.trim() || quickSaving === incident.id}
                            onClick={(e) => handleConfirmResolve(e, incident)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-green-400 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 transition-colors"
                          >
                            ✓ Confirm Resolve
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setResolvingId(null); setResolveNote('') }}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                        {incident.status === 'open' && (
                          <button
                            disabled={quickSaving === incident.id}
                            onClick={(e) => handleQuickStatus(e, incident, 'in-progress')}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-40 transition-colors"
                          >
                            → Responding
                          </button>
                        )}
                        {incident.status === 'in-progress' && (
                          <button
                            disabled={quickSaving === incident.id}
                            onClick={(e) => handleQuickStatus(e, incident, 'open')}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-300 text-purple-600 bg-purple-50 hover:bg-white disabled:opacity-40 transition-colors flex items-center gap-1"
                            title="Click to cancel responding"
                          >
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                            Responding ×
                          </button>
                        )}
                        {(incident.status === 'open' || incident.status === 'in-progress') && (
                          <button
                            disabled={quickSaving === incident.id}
                            onClick={(e) => { e.stopPropagation(); setResolvingId(incident.id); setResolveNote('') }}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-40 transition-colors"
                          >
                            ✓ Resolve
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(incident.dateOccurred)}</p>
                    {incident.caseNumber && (
                      <p className="text-[10px] text-gray-300 font-mono mt-0.5">#{incident.caseNumber}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right column ──────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Location Hotspots */}
          {hotspots.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-amber-500 text-base">⚠</span>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Location Hotspots</h3>
                <span className="text-[10px] text-gray-400 ml-auto">Past 7 days</span>
              </div>
              <div className="space-y-2">
                {hotspots.map(([location, list]) => {
                  const worst = list.sort((a,b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]
                  return (
                    <div key={location} className="flex items-start gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ background: SEVERITY_COLORS[worst.severity] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{location}</p>
                        <p className="text-[10px] text-gray-400">{list.length} incidents</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Resolved Today */}
          {resolvedToday.length > 0 && (
            <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <span className="text-green-500 text-sm">✓</span> Resolved Today
                <span className="ml-auto text-[10px] font-normal text-gray-400">{resolvedToday.length} closed</span>
              </h3>
              <div className="space-y-2">
                {resolvedToday.map((incident) => (
                  <div
                    key={incident.id}
                    onClick={() => setSelected(incident)}
                    className="flex items-start gap-2 cursor-pointer group"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mt-1 shrink-0 opacity-40"
                      style={{ background: SEVERITY_COLORS[incident.severity] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 group-hover:text-green-700 transition-colors truncate line-through decoration-gray-300">
                        {incident.nature}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{incident.location}</p>
                    </div>
                    <span className="text-[10px] text-gray-300 whitespace-nowrap shrink-0">
                      {timeAgo(incident.resolvedAt!)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {recentFeed.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => setSelected(incident)}
                  className="flex items-start gap-2.5 cursor-pointer group"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ background: SEVERITY_COLORS[incident.severity] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 group-hover:text-green-700 transition-colors truncate">
                      {incident.nature}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">{incident.location}</p>
                  </div>
                  <span className="text-[10px] text-gray-300 whitespace-nowrap shrink-0">
                    {timeAgo(incident.dateOccurred)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {selected && (
        <IncidentDetail
          incident={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}

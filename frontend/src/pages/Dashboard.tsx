import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Incident, getIncidents, updateStatus, addNote, createIncident } from '../api/incidents'
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

type SortOrder = 'severity' | 'oldest' | 'newest'
type SourceFilter = 'all' | 'epd_live' | 'uopd_csv' | 'imported' | 'manual'

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

function toLocalDatetimeValue(d: Date) {
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function matchesSource(incident: Incident, filter: SourceFilter): boolean {
  if (filter === 'all') return true
  const src = (incident as any).source ?? ''
  if (filter === 'epd_live')  return src === 'epd_live'
  if (filter === 'uopd_csv')  return src === 'uopd_csv'
  if (filter === 'imported')  return src === 'import_csv' || src === 'import_pdf'
  if (filter === 'manual')    return !['epd_live','uopd_csv','import_csv','import_pdf'].includes(src)
  return true
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

  // New feature state
  const [searchQuery, setSearchQuery]     = useState('')
  const [sourceFilter, setSourceFilter]   = useState<SourceFilter>('all')
  const [sortOrder, setSortOrder]         = useState<SortOrder>('severity')
  const [showQuickAdd, setShowQuickAdd]   = useState(false)
  const [quickAddForm, setQuickAddForm]   = useState({
    nature: '', location: '', dateOccurred: toLocalDatetimeValue(new Date()), description: '',
  })
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false)

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

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!quickAddForm.nature.trim() || !quickAddForm.location.trim()) return
    setQuickAddSubmitting(true)
    try {
      const created = await createIncident(quickAddForm)
      setIncidents((prev) => [created, ...prev])
      setShowQuickAdd(false)
      setQuickAddForm({ nature: '', location: '', dateOccurred: toLocalDatetimeValue(new Date()), description: '' })
      fireToast(`Incident logged: ${created.nature}`, 'info')
    } finally {
      setQuickAddSubmitting(false)
    }
  }

  function printShiftSummary() {
    const now = new Date()
    // Print what the dispatcher is currently looking at: active queue as filtered,
    // plus resolved incidents matching the same source/search filters
    const open = activeQueue
    const resolved = incidents.filter((i) => {
      if (i.status !== 'resolved') return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!i.nature.toLowerCase().includes(q) && !(i.location || '').toLowerCase().includes(q)) return false
      }
      if (!matchesSource(i, sourceFilter)) return false
      return true
    })
    const shiftIncidents = [...open, ...resolved]

    const row = (i: Incident) => `
      <tr>
        <td>${i.nature}</td>
        <td>${i.location || '—'}</td>
        <td>${i.severity.toUpperCase()}</td>
        <td>${i.status}</td>
        <td>${i.dateOccurred ? new Date(i.dateOccurred).toLocaleTimeString() : '—'}</td>
      </tr>`

    const html = `<!DOCTYPE html><html><head><title>Shift Summary — ${now.toLocaleDateString()}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; font-size: 13px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      p { color: #666; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; color: #999; padding: 4px 8px; border-bottom: 1px solid #eee; }
      td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; }
    </style></head><body>
    <h1>Shift Summary — ${config.campusName}</h1>
    <p>Generated ${now.toLocaleString()} · Past 8 hours · ${shiftIncidents.length} total incidents</p>
    <h2>Active (${open.length})</h2>
    <table><thead><tr><th>Type</th><th>Location</th><th>Severity</th><th>Status</th><th>Time</th></tr></thead>
    <tbody>${open.map(row).join('')}</tbody></table>
    <h2>Resolved (${resolved.length})</h2>
    <table><thead><tr><th>Type</th><th>Location</th><th>Severity</th><th>Status</th><th>Time</th></tr></thead>
    <tbody>${resolved.map(row).join('')}</tbody></table>
    </body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  function localDateStr(isoStr: string): string {
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const cutoff14 = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  }, [])

  const activeQueue = useMemo(() => {
    const q = incidents.filter((i) => {
      if (!['open','acknowledged','in-progress'].includes(i.status)) return false
      if (!showAllOpen && i.dateOccurred && i.dateOccurred.slice(0, 10) < cutoff14) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!i.nature.toLowerCase().includes(q) && !(i.location || '').toLowerCase().includes(q)) return false
      }
      if (!matchesSource(i, sourceFilter)) return false
      return true
    })
    if (sortOrder === 'oldest') return q.sort((a, b) => (a.dateOccurred ?? '').localeCompare(b.dateOccurred ?? ''))
    if (sortOrder === 'newest') return q.sort((a, b) => (b.dateOccurred ?? '').localeCompare(a.dateOccurred ?? ''))
    return q.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  }, [incidents, showAllOpen, cutoff14, searchQuery, sourceFilter, sortOrder])

  const stalledCount = useMemo(() =>
    incidents.filter((i) =>
      ['open','acknowledged','in-progress'].includes(i.status) &&
      i.dateOccurred && i.dateOccurred.slice(0, 10) < cutoff14
    ).length, [incidents, cutoff14])

  const recentFeed = useMemo(() =>
    [...incidents].filter((i) => i.dateOccurred)
      .sort((a, b) => b.dateOccurred!.localeCompare(a.dateOccurred!)).slice(0, 12),
    [incidents])

  const hotspots = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const locationMap: Record<string, Incident[]> = {}
    incidents.forEach((i) => {
      if (!i.location || !i.dateOccurred) return
      if (i.dateOccurred.slice(0, 10) < cutoffStr) return
      if (!locationMap[i.location]) locationMap[i.location] = []
      locationMap[i.location].push(i)
    })
    return Object.entries(locationMap).filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length).slice(0, 4)
  }, [incidents])

  const resolvedToday = useMemo(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return [...incidents]
      .filter((i) => i.status === 'resolved' && i.resolvedAt && localDateStr(i.resolvedAt) === today)
      .sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!)).slice(0, 6)
  }, [incidents])

  const criticalCount = activeQueue.filter((i) => i.severity === 'critical').length
  const highCount     = activeQueue.filter((i) => i.severity === 'high').length

  const SOURCE_LABELS: Record<SourceFilter, string> = {
    all: 'All', epd_live: 'EPD Live', uopd_csv: 'Historical', imported: 'Imported', manual: 'Manual',
  }

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-5 w-48 bg-gray-200 rounded-lg" />
          <div className="skeleton h-3 w-64 bg-gray-100 rounded-lg" />
        </div>
        <div className="skeleton h-7 w-28 bg-gray-100 rounded-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        <div className="flex items-center gap-2 flex-wrap">
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
          {/* Quick add + print */}
          <button
            onClick={() => setShowQuickAdd(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-green-400 text-green-700 bg-green-50 hover:bg-green-100 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Log Incident
          </button>
          <button
            onClick={printShiftSummary}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
            title="Print shift summary (past 8 hours)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Print Summary
          </button>
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
                  {showAllOpen ? 'Show recent only' : `+ ${stalledCount} older open incident${stalledCount !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                placeholder="Search by type or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Source filter pills */}
            <div className="flex gap-1 flex-wrap">
              {(['all','epd_live','uopd_csv','imported','manual'] as SourceFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                    sourceFilter === s
                      ? 'bg-green-700 text-white border-green-700'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
                  }`}
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="text-[10px] font-semibold px-2 py-1 rounded-full border border-gray-300 text-gray-500 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors whitespace-nowrap bg-white"
            >
              <option value="severity">Sort: Severity</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="newest">Sort: Newest First</option>
            </select>
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
                      : incident.status === 'acknowledged'
                      ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-400'
                      : 'bg-white border-gray-200 hover:border-green-300'
                  }`}
                >
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
                          <MicButton onTranscript={(t) => setResolveNote((prev) => prev ? `${prev} ${t}` : t)} />
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
                      <div className="flex gap-1.5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {incident.status === 'open' && (
                          <button
                            disabled={quickSaving === incident.id}
                            onClick={(e) => handleQuickStatus(e, incident, 'acknowledged')}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-yellow-300 text-yellow-700 hover:bg-yellow-50 disabled:opacity-40 transition-colors"
                          >
                            ✓ Acknowledge
                          </button>
                        )}
                        {(incident.status === 'open' || incident.status === 'acknowledged') && (
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
                        {['open','acknowledged','in-progress'].includes(incident.status) && (
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

          {hotspots.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-amber-500 text-base">⚠</span>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Location Hotspots</h3>
                <span className="text-[10px] text-gray-400 ml-auto">Past 7 days</span>
              </div>
              <div className="space-y-2">
                {hotspots.map(([location, list]) => {
                  const worst = [...list].sort((a,b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]
                  return (
                    <div key={location} className="flex items-start gap-2">
                      <span className="inline-block w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: SEVERITY_COLORS[worst.severity] }} />
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

          {resolvedToday.length > 0 && (
            <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <span className="text-green-500 text-sm">✓</span> Resolved Today
                <span className="ml-auto text-[10px] font-normal text-gray-400">{resolvedToday.length} closed</span>
              </h3>
              <div className="space-y-2">
                {resolvedToday.map((incident) => (
                  <div key={incident.id} onClick={() => setSelected(incident)} className="flex items-start gap-2 cursor-pointer group">
                    <span className="inline-block w-2 h-2 rounded-full mt-1 shrink-0 opacity-40" style={{ background: SEVERITY_COLORS[incident.severity] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 group-hover:text-green-700 transition-colors truncate line-through decoration-gray-300">{incident.nature}</p>
                      <p className="text-[10px] text-gray-400 truncate">{incident.location}</p>
                    </div>
                    <span className="text-[10px] text-gray-300 whitespace-nowrap shrink-0">{timeAgo(incident.resolvedAt!)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {recentFeed.map((incident) => (
                <div key={incident.id} onClick={() => setSelected(incident)} className="flex items-start gap-2.5 cursor-pointer group">
                  <span className="inline-block w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: SEVERITY_COLORS[incident.severity] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 group-hover:text-green-700 transition-colors truncate">{incident.nature}</p>
                    <p className="text-[10px] text-gray-400 truncate">{incident.location}</p>
                  </div>
                  <span className="text-[10px] text-gray-300 whitespace-nowrap shrink-0">{timeAgo(incident.dateOccurred)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowQuickAdd(false)} />
          <div className="modal-panel relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Log Incident</h2>
              <button onClick={() => setShowQuickAdd(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleQuickAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Incident Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Theft, Suspicious Activity, Medical"
                  value={quickAddForm.nature}
                  onChange={(e) => setQuickAddForm((f) => ({ ...f, nature: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1451 Agate St"
                  value={quickAddForm.location}
                  onChange={(e) => setQuickAddForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={quickAddForm.dateOccurred}
                  onChange={(e) => setQuickAddForm((f) => ({ ...f, dateOccurred: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Additional details..."
                  value={quickAddForm.description}
                  onChange={(e) => setQuickAddForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-xl py-2 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickAddSubmitting || !quickAddForm.nature.trim() || !quickAddForm.location.trim()}
                  className="flex-1 bg-green-700 text-white rounded-xl py-2 text-sm font-semibold hover:bg-green-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {quickAddSubmitting ? 'Logging...' : 'Log Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

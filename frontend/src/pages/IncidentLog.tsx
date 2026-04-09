import { useEffect, useState, useCallback, useMemo } from 'react'
import { Incident, getIncidents, IncidentFilters } from '../api/incidents'
import SeverityBadge from '../components/SeverityBadge'
import StatusBadge from '../components/StatusBadge'
import IncidentDetail from '../components/IncidentDetail'
import { useCampus } from '../context/CampusContext'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}
const MONTHS_LABEL: Record<string, string> = {
  '01':'January','02':'February','03':'March','04':'April',
  '05':'May','06':'June','07':'July','08':'August',
  '09':'September','10':'October','11':'November','12':'December',
}

function monthLabel(key: string) {
  const [year, month] = key.split('-')
  return `${MONTHS_LABEL[month] ?? month} ${year}`
}

export default function IncidentLog() {
  const { config } = useCampus()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Incident | null>(null)
  const [filters, setFilters] = useState<IncidentFilters>({})
  const [search, setSearch] = useState('')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  const fetchIncidents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getIncidents({ ...filters, search: search || undefined })
      data.sort((a, b) => (b.dateOccurred ?? '').localeCompare(a.dateOccurred ?? ''))
      setIncidents(data)
    } finally {
      setLoading(false)
    }
  }, [filters, search])

  useEffect(() => { fetchIncidents() }, [fetchIncidents])

  useEffect(() => {
    if (incidents.length > 0 && expandedMonths.size === 0) {
      const firstKey = incidents.find((i) => i.dateOccurred)?.dateOccurred?.slice(0, 7)
      if (firstKey) setExpandedMonths(new Set([firstKey]))
    }
  }, [incidents])

  function handleStatusChange(updated: Incident) {
    setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    setSelected(updated)
  }

  function printLog() {
    const now = new Date()
    const filterDesc = [
      search && `Search: "${search}"`,
      filters.severity && `Severity: ${filters.severity}`,
      filters.status   && `Status: ${filters.status}`,
    ].filter(Boolean).join(' · ') || 'All incidents'

    const rows = incidents.map((i) => `
      <tr>
        <td>${i.caseNumber || '—'}</td>
        <td>${i.nature}</td>
        <td>${i.location || '—'}</td>
        <td>${i.dateOccurred?.slice(0, 16) || '—'}</td>
        <td>${i.severity.toUpperCase()}</td>
        <td>${i.status}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html><head><title>Incident Log — ${config.campusName}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; font-size: 12px; }
      h1 { font-size: 17px; margin-bottom: 4px; }
      p { color: #666; margin: 0 0 14px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; color: #999; padding: 4px 8px; border-bottom: 2px solid #e5e7eb; }
      td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
      tr:nth-child(even) td { background: #fafafa; }
    </style></head><body>
    <h1>Incident Log — ${config.campusName}</h1>
    <p>Printed ${now.toLocaleString()} · ${filterDesc} · ${incidents.length} records</p>
    <table>
      <thead><tr><th>Case #</th><th>Type</th><th>Location</th><th>Date</th><th>Severity</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const monthGroups = useMemo(() => {
    const groups: Record<string, Incident[]> = {}
    incidents.forEach((i) => {
      const key = i.dateOccurred?.slice(0, 7) ?? 'unknown'
      if (!groups[key]) groups[key] = []
      groups[key].push(i)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [incidents])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      <div>
        <h1 className="text-xl font-bold text-gray-900">Incident Log</h1>
        <p className="text-sm text-gray-400 mt-0.5">Full historical record · University of Oregon</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search by type, location, case #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={filters.severity ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <button onClick={() => { setFilters({}); setSearch('') }} className="text-sm text-gray-500 hover:text-gray-800 underline">Clear</button>
        <div className="ml-auto flex gap-3 items-center">
          <button onClick={() => setExpandedMonths(new Set(monthGroups.map(([k]) => k)))} className="text-sm text-green-700 underline">Expand all</button>
          <button onClick={() => setExpandedMonths(new Set())} className="text-sm text-gray-500 underline">Collapse all</button>
          <button
            onClick={printLog}
            disabled={loading || incidents.length === 0}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Month groups */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading incident log...</div>
      ) : (
        <div className="space-y-3">
          {monthGroups.map(([monthKey, monthIncidents]) => {
            const isOpen = expandedMonths.has(monthKey)
            const counts = {
              critical: monthIncidents.filter((i) => i.severity === 'critical').length,
              high:     monthIncidents.filter((i) => i.severity === 'high').length,
              medium:   monthIncidents.filter((i) => i.severity === 'medium').length,
              low:      monthIncidents.filter((i) => i.severity === 'low').length,
            }

            return (
              <div key={monthKey} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleMonth(monthKey)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800 text-sm">{monthLabel(monthKey)}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{monthIncidents.length} incidents</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5 items-center">
                      {(['critical','high','medium','low'] as const).map((s) =>
                        counts[s] > 0 ? (
                          <span key={s} className="flex items-center gap-0.5 text-xs text-gray-500">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[s] }}/>
                            {counts[s]}
                          </span>
                        ) : null
                      )}
                    </div>
                    <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Case #','Type','Location','Date','Severity','Status',''].map((h) => (
                            <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {monthIncidents.map((incident) => (
                          <tr key={incident.id} onClick={() => setSelected(incident)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                            <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{incident.caseNumber || '—'}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900 max-w-48 truncate">{incident.nature}</td>
                            <td className="px-4 py-2.5 text-gray-500 max-w-40 truncate">{incident.location}</td>
                            <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{incident.dateOccurred?.slice(0, 16) || '—'}</td>
                            <td className="px-4 py-2.5"><SeverityBadge severity={incident.severity} /></td>
                            <td className="px-4 py-2.5"><StatusBadge status={incident.status} /></td>
                            <td className="px-4 py-2.5 text-green-700 text-xs font-medium">View</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <IncidentDetail incident={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />
      )}
    </div>
  )
}

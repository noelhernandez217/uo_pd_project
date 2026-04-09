import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts'
import { getTrends, getIncidents, TrendsData, Incident } from '../api/incidents'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}
const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e']
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function formatHour(h: number) {
  if (h === 0)  return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

function parseHour(dateOccurred: string | null): number | null {
  if (!dateOccurred) return null
  const h = parseInt(dateOccurred.slice(11, 13))
  return isNaN(h) ? null : h
}

function parseDayOfWeek(dateOccurred: string | null): number | null {
  if (!dateOccurred) return null
  const d = new Date(dateOccurred)
  return isNaN(d.getTime()) ? null : d.getDay()
}

function monthLabel(key: string) {
  const months: Record<string, string> = {
    '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
    '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec',
  }
  const [year, month] = key.split('-')
  return `${months[month] ?? month} ${year}`
}

export default function Analytics() {
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getTrends(), getIncidents()])
      .then(([t, i]) => { setTrends(t); setIncidents(i) })
      .finally(() => setLoading(false))
  }, [])

  const timeStats = useMemo(() => {
    const hourCounts = Array(24).fill(0)
    const dayCounts  = Array(7).fill(0)

    incidents.forEach((i) => {
      const h = parseHour(i.dateOccurred)
      if (h !== null) hourCounts[h]++
      const d = parseDayOfWeek(i.dateOccurred)
      if (d !== null) dayCounts[d]++
    })

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
    const peakDay  = dayCounts.indexOf(Math.max(...dayCounts))

    const hourData = hourCounts.map((count, h) => ({ hour: formatHour(h), count, h }))
    const dayData  = DAYS.map((day, i) => ({ day: day.slice(0, 3), count: dayCounts[i] }))

    return { peakHour, peakDay, hourData, dayData, hourCounts, dayCounts }
  }, [incidents])

  const busiestMonth = useMemo(() => {
    const groups: Record<string, number> = {}
    incidents.forEach((i) => {
      const key = i.dateOccurred?.slice(0, 7)
      if (key) groups[key] = (groups[key] ?? 0) + 1
    })
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1])
    return sorted[0] ? { label: monthLabel(sorted[0][0]), count: sorted[0][1] } : null
  }, [incidents])

  if (loading) return <div className="py-24 text-center text-gray-400">Loading analytics...</div>
  if (!trends)  return <div className="py-24 text-center text-gray-400">No data available.</div>

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">University of Oregon · Last 60 days</p>
      </div>

      {/* Top-line totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: trends.totals.total,    color: 'text-gray-800' },
          { label: 'Open',     value: trends.totals.open,     color: 'text-blue-700' },
          { label: 'Resolved', value: trends.totals.resolved, color: 'text-green-700' },
          { label: 'Critical', value: trends.totals.critical, color: 'text-red-600'  },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Time Intelligence ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Time Intelligence</h2>

        {/* Peak insight cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Peak Hour</p>
            <p className="text-3xl font-bold text-indigo-800 mt-1">{formatHour(timeStats.peakHour)}</p>
            <p className="text-xs text-indigo-400 mt-0.5">{timeStats.hourCounts[timeStats.peakHour]} incidents at this hour</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
            <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide">Busiest Day</p>
            <p className="text-3xl font-bold text-purple-800 mt-1">{DAYS[timeStats.peakDay]}</p>
            <p className="text-xs text-purple-400 mt-0.5">{timeStats.dayCounts[timeStats.peakDay]} incidents on this day</p>
          </div>
          <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
            <p className="text-xs font-semibold text-rose-500 uppercase tracking-wide">Busiest Month</p>
            <p className="text-2xl font-bold text-rose-800 mt-1">{busiestMonth?.label ?? '—'}</p>
            <p className="text-xs text-rose-400 mt-0.5">{busiestMonth?.count ?? 0} incidents</p>
          </div>
        </div>

        {/* Hour + Day charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Incidents by Hour of Day</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={timeStats.hourData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} incidents`, 'Count']} />
                <Bar dataKey="count" radius={[2,2,0,0]}>
                  {timeStats.hourData.map((entry) => (
                    <Cell
                      key={entry.h}
                      fill={entry.h >= 22 || entry.h <= 5 ? '#6366f1' : entry.h >= 18 ? '#f97316' : '#15803d'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 mr-1"/>Late night</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-orange-400 mr-1"/>Evening</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-green-700 mr-1"/>Daytime</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Incidents by Day of Week</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={timeStats.dayData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} incidents`, 'Count']} />
                <Bar dataKey="count" radius={[2,2,0,0]}>
                  {timeStats.dayData.map((entry) => (
                    <Cell key={entry.day} fill={['Sat','Sun'].includes(entry.day) ? '#f97316' : '#15803d'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-sm bg-orange-400 mr-1"/>Weekend</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-green-700 mr-1"/>Weekday</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Incident Trends ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Incident Trends</h2>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Volume Over Time</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trends.byDay} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#15803d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Incident Types</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trends.byType} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} width={160} />
                <Tooltip />
                <Bar dataKey="count" fill="#15803d" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Severity Breakdown</p>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={trends.bySeverity}
                  dataKey="count"
                  nameKey="severity"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  paddingAngle={3}
                  labelLine={{ strokeWidth: 1 }}
                  label={({ severity, percent }) => `${severity} ${(percent * 100).toFixed(0)}%`}
                >
                  {trends.bySeverity.map((entry, i) => (
                    <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

interface Incident {
  id: number
  nature: string
  caseNumber: string
  location: string
  dateOccurred: string
  severity: string
  status: string
  aiSummary: string
  aiRecommendation: string
  lat: number
  lng: number
}

interface Props {
  incidents: Incident[]
  clusterRadius?: number   // default 60; pass a small value to disable geographic clustering while keeping spiderify
  spiderify?: boolean      // show coverage polygon on hover
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

const STATUS_LABELS: Record<string, string> = {
  open:          'Open',
  'in-progress': 'In Progress',
  resolved:      'Resolved',
}

function severityDotIcon(severity: string) {
  const color = SEVERITY_COLORS[severity] ?? '#6b7280'
  return L.divIcon({
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border-radius:50%;
      border:2px solid white;
      box-shadow:0 1px 5px rgba(0,0,0,0.4);
    "></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

// Purple pin with expanding pulse ring — used for in-progress (responding) incidents
function respondingIcon() {
  return L.divIcon({
    html: `
      <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
        <div class="map-pin-pulse" style="
          position:absolute;
          width:14px;height:14px;
          border-radius:50%;
          background:#a855f7;
        "></div>
        <div style="
          position:relative;z-index:1;
          width:14px;height:14px;
          background:#a855f7;
          border-radius:50%;
          border:2px solid white;
          box-shadow:0 1px 6px rgba(168,85,247,0.6);
        "></div>
      </div>`,
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  })
}

// Muted gray pin — used for resolved incidents
function resolvedIcon() {
  return L.divIcon({
    html: `<div style="
      width:10px;height:10px;
      background:#9ca3af;
      border-radius:50%;
      border:2px solid white;
      box-shadow:0 1px 3px rgba(0,0,0,0.25);
      opacity:0.55;
    "></div>`,
    className: '',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

function clusterIcon(cluster: L.MarkerCluster) {
  const markers = cluster.getAllChildMarkers() as (L.Marker & { options: { severity?: string } })[]
  const severities = markers.map((m) => m.options.severity ?? 'low')
  const worst = SEVERITY_ORDER.find((s) => severities.includes(s)) ?? 'low'
  const color = SEVERITY_COLORS[worst]
  const count = cluster.getChildCount()
  const size = count > 99 ? 52 : count > 9 ? 44 : 36

  return L.divIcon({
    html: `<div style="
      background:${color};
      width:${size}px;height:${size}px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:700;font-size:${count > 99 ? 12 : 14}px;
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      font-family:system-ui,sans-serif;
    ">${count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const STATUS_PILL: Record<string, string> = {
  open:          'background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;',
  'in-progress': 'background:#f3e8ff;color:#7e22ce;border:1px solid #d8b4fe;',
  resolved:      'background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;',
}

function popupHTML(incident: Incident): string {
  const color = SEVERITY_COLORS[incident.severity] ?? '#6b7280'
  const statusLabel = STATUS_LABELS[incident.status] ?? incident.status
  const statusPill = STATUS_PILL[incident.status] ?? STATUS_PILL.open
  const respondingBadge = incident.status === 'in-progress'
    ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#a855f7;margin-right:4px;vertical-align:middle;"></span>`
    : ''

  return `
    <div style="min-width:240px;max-width:300px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <strong style="color:#111;font-size:14px;">${incident.nature}</strong>
        <span style="
          background:${color}22;color:${color};
          border:1px solid ${color}55;
          border-radius:4px;padding:1px 7px;
          font-size:11px;font-weight:700;text-transform:uppercase;white-space:nowrap;
        ">${incident.severity}</span>
      </div>

      <div style="font-size:11px;margin-bottom:8px;">
        <span style="${statusPill}border-radius:4px;padding:1px 7px;font-weight:600;">
          ${respondingBadge}${statusLabel}
        </span>
        ${incident.caseNumber ? `<span style="font-family:monospace;color:#6b7280;margin-left:6px;">#${incident.caseNumber}</span>` : ''}
      </div>

      <div style="color:#374151;margin-bottom:4px;">
        <span style="color:#6b7280;font-size:11px;font-weight:600;">LOCATION</span><br/>
        ${incident.location || '—'}
      </div>

      ${incident.dateOccurred ? `
      <div style="color:#374151;margin-bottom:8px;">
        <span style="color:#6b7280;font-size:11px;font-weight:600;">OCCURRED</span><br/>
        ${incident.dateOccurred.slice(0, 16)}
      </div>` : ''}

      ${incident.aiSummary ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px;margin-top:6px;">
        <div style="color:#3b82f6;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">AI Analysis</div>
        <div style="color:#1e3a5f;margin-bottom:4px;">${incident.aiSummary}</div>
        ${incident.aiRecommendation ? `<div style="color:#475569;font-style:italic;font-size:12px;">${incident.aiRecommendation}</div>` : ''}
      </div>` : ''}
    </div>
  `
}

export default function ClusterLayer({ incidents, clusterRadius = 60 }: Props) {
  const map = useMap()

  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      iconCreateFunction: clusterIcon,
      maxClusterRadius: clusterRadius,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.5,
      showCoverageOnHover: clusterRadius > 10,
      zoomToBoundsOnClick: clusterRadius > 10,
      chunkedLoading: true,
    })

    incidents.forEach((incident) => {
      const icon = incident.status === 'in-progress'
        ? respondingIcon()
        : incident.status === 'resolved'
          ? resolvedIcon()
          : severityDotIcon(incident.severity)

      const marker = L.marker([incident.lat, incident.lng], { icon } as L.MarkerOptions)
      // Store severity on options so clusterIcon can read it
      ;(marker.options as any).severity = incident.severity

      marker.bindPopup(popupHTML(incident), { maxWidth: 320 })
      group.addLayer(marker)
    })

    map.addLayer(group)
    return () => { map.removeLayer(group) }
  }, [map, incidents])

  return null
}

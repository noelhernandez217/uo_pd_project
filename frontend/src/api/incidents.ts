import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export interface Incident {
  id: number
  nature: string
  caseNumber: string
  dateReported: string
  dateOccurred: string
  location: string
  disposition: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  aiSummary: string
  aiRecommendation: string
  status: 'open' | 'acknowledged' | 'in-progress' | 'resolved'
  campus: string
  createdAt: string
  resolvedAt?: string
}

export interface TrendsData {
  byType: { type: string; count: number }[]
  bySeverity: { severity: string; count: number }[]
  byStatus: { status: string; count: number }[]
  byDay: { date: string; count: number }[]
  totals: {
    total: number
    open: number
    inProgress: number
    resolved: number
    critical: number
    high: number
  }
}

export interface IncidentFilters {
  status?: string
  severity?: string
  campus?: string
  type?: string
  search?: string
}

export const getIncidents = (filters: IncidentFilters = {}) =>
  api.get<Incident[]>('/incidents', { params: filters }).then((r) => r.data)

export const getIncident = (id: number) =>
  api.get<Incident>(`/incidents/${id}`).then((r) => r.data)

export const createIncident = (data: {
  nature: string
  location: string
  dateOccurred: string
  description: string
}) => api.post<Incident>('/incidents', data).then((r) => r.data)

export const updateStatus = (id: number, status: string) =>
  api.patch<Incident>(`/incidents/${id}/status`, { status }).then((r) => r.data)

export const getTrends = () =>
  api.get<TrendsData>('/trends').then((r) => r.data)

export interface IncidentNote {
  id: number
  incidentId: number
  text: string
  createdAt: string
}

export const getNotes = (incidentId: number) =>
  api.get<IncidentNote[]>(`/incidents/${incidentId}/notes`).then((r) => r.data)

export const addNote = (incidentId: number, text: string) =>
  api.post<IncidentNote>(`/incidents/${incidentId}/notes`, { text }).then((r) => r.data)

export const deleteNote = (incidentId: number, noteId: number) =>
  api.delete(`/incidents/${incidentId}/notes/${noteId}`).then((r) => r.data)

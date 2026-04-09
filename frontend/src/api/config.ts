import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export interface CampusConfig {
  campusName: string
  campusLat: number
  campusLng: number
  campusRadiusMeters: number
  campusCity: string
  campusState: string
  pdDispatchUrl: string
  pdDispatchEnabled: boolean
}

export const getConfig = () =>
  api.get<CampusConfig>('/config').then((r) => r.data)

export const updateConfig = (updates: Partial<CampusConfig>) =>
  api.patch<CampusConfig>('/config', updates).then((r) => r.data)

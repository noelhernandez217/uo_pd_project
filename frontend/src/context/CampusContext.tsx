import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { CampusConfig, getConfig } from '../api/config'

const DEFAULT: CampusConfig = {
  campusName: 'CampusSafe',
  campusLat: 44.0449,
  campusLng: -123.0722,
  campusRadiusMeters: 1200,
  campusCity: 'Eugene',
  campusState: 'OR',
  pdDispatchUrl: '',
  pdDispatchEnabled: true,
}

const CampusContext = createContext<{
  config: CampusConfig
  reload: () => void
}>({ config: DEFAULT, reload: () => {} })

export function CampusProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CampusConfig>(DEFAULT)

  function reload() {
    getConfig().then(setConfig).catch(() => {})
  }

  useEffect(() => { reload() }, [])

  return (
    <CampusContext.Provider value={{ config, reload }}>
      {children}
    </CampusContext.Provider>
  )
}

export function useCampus() {
  return useContext(CampusContext)
}

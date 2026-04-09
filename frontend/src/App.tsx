import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import IncidentLog from './pages/IncidentLog'
import ImportIncidents from './pages/ImportIncidents'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import { ToastContainer } from './components/Toast'
import { CampusProvider } from './context/CampusContext'

const MapView = lazy(() => import('./pages/MapView'))

export default function App() {
  return (
    <CampusProvider>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <ToastContainer />
        <main>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/log"       element={<IncidentLog />} />
            <Route path="/import"    element={<ImportIncidents />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings"  element={<Settings />} />
            <Route path="/map"       element={
              <Suspense fallback={<div className="py-24 text-center text-gray-400">Loading map...</div>}>
                <MapView />
              </Suspense>
            } />
          </Routes>
        </main>
      </div>
    </CampusProvider>
  )
}

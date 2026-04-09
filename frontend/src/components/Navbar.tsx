import { NavLink } from 'react-router-dom'
import { useCampus } from '../context/CampusContext'

const links = [
  { to: '/',          label: 'Dashboard'    },
  { to: '/log',       label: 'Incident Log' },
  { to: '/map',       label: 'Map'          },
  { to: '/analytics', label: 'Analytics'    },
  { to: '/import',    label: 'Import'       },
]

export default function Navbar() {
  const { config } = useCampus()

  return (
    <nav className="bg-green-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">CampusSafe</span>
          <span className="text-green-300 text-sm hidden sm:block">{config.campusName}</span>
        </div>
        <div className="flex gap-1 items-center">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive ? 'bg-green-600 text-white' : 'text-green-100 hover:bg-green-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            title="Campus Settings"
            className={({ isActive }) =>
              `ml-1 px-2.5 py-1.5 rounded text-sm transition-colors ${
                isActive ? 'bg-green-600 text-white' : 'text-green-300 hover:bg-green-700 hover:text-white'
              }`
            }
          >
            ⚙
          </NavLink>
        </div>
      </div>
    </nav>
  )
}

import { Routes, Route, NavLink, Link } from 'react-router-dom'
import Home from './features/Home'
import Rankings from './features/Rankings'
import Compare from './features/Compare'
import PlayerDetail from './features/PlayerDetail'
import DefenseDetail from './features/DefenseDetail'
import OffenseDetail from './features/OffenseDetail'
import TeamDetail from './features/TeamDetail'
import Betting from './features/Betting'
import BettingGameDetail from './features/BettingGameDetail'
import About from './features/About'
import Settings from './features/Settings'

const NAV = [
  { to: '/', label: 'Top', icon: '🏆', end: true },
  { to: '/rankings', label: 'Rankings', icon: '📊' },
  { to: '/compare', label: 'Compare', icon: '⚖️' },
  { to: '/betting', label: 'Betting', icon: '🎯' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
] as const

const mobileNavCls = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-[10px] font-medium transition-colors ${
    isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
  }`

const desktopNavCls = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'text-emerald-400 bg-slate-800/80'
      : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/50'
  }`

export default function App() {
  return (
    <div className="flex flex-col h-full w-full max-w-lg lg:max-w-6xl mx-auto bg-slate-950 relative">
      <header className="hidden lg:flex items-center gap-3 px-6 py-3 border-b border-slate-800 shrink-0">
        <Link to="/" className="font-semibold text-slate-100 tracking-tight whitespace-nowrap">
          NFL Ratings
        </Link>
        <nav className="flex items-center gap-1 flex-1" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : undefined}
              className={desktopNavCls}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <Link
          to="/about"
          className="text-sm font-medium text-slate-400 hover:text-emerald-400 px-2 py-1"
        >
          About
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto scroll-touch pb-20 lg:pb-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/player/:id" element={<PlayerDetail />} />
          <Route path="/defense/:id" element={<DefenseDetail />} />
          <Route path="/offense/:id" element={<OffenseDetail />} />
          <Route path="/team/:id" element={<TeamDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/betting" element={<Betting />} />
          <Route path="/betting/:away/:home" element={<BettingGameDetail />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around safe-bottom z-50 lg:hidden"
        aria-label="Primary"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : undefined}
            className={mobileNavCls}
          >
            <span className="text-base" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

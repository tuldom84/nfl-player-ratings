import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import Home from './features/Home'
import Rankings from './features/Rankings'
import Compare from './features/Compare'
import PlayerDetail from './features/PlayerDetail'
import DefenseDetail from './features/DefenseDetail'
import OffenseDetail from './features/OffenseDetail'
import TeamDetail from './features/TeamDetail'
import Betting from './features/Betting'
import About from './features/About'
import Settings from './features/Settings'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-[10px] font-medium transition-colors ${
    isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
  }`

function AboutCornerLink() {
  const { pathname } = useLocation()
  if (pathname === '/about') return null
  return (
    <Link
      to="/about"
      className="fixed top-3 z-40 text-[11px] font-medium text-slate-400 hover:text-emerald-400"
      style={{ right: 'max(0.75rem, calc((100vw - 32rem) / 2 + 0.75rem))' }}
      aria-label="About"
    >
      About
    </Link>
  )
}

export default function App() {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto bg-slate-950 relative">
      <AboutCornerLink />
      <main className="flex-1 overflow-y-auto scroll-touch pb-20">
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
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around safe-bottom z-50">
        <NavLink to="/" end className={navCls}>
          <span className="text-base">🏆</span>
          <span>Top</span>
        </NavLink>
        <NavLink to="/rankings" className={navCls}>
          <span className="text-base">📊</span>
          <span>Rankings</span>
        </NavLink>
        <NavLink to="/compare" className={navCls}>
          <span className="text-base">⚖️</span>
          <span>Compare</span>
        </NavLink>
        <NavLink to="/settings" className={navCls}>
          <span className="text-base">⚙️</span>
          <span>Settings</span>
        </NavLink>
        <NavLink to="/betting" className={navCls}>
          <span className="text-base">🎯</span>
          <span>Betting</span>
        </NavLink>
      </nav>
    </div>
  )
}

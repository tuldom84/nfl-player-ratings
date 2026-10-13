import { Routes, Route, NavLink } from 'react-router-dom'
import Home from './features/Home'
import Rankings from './features/Rankings'
import Compare from './features/Compare'
import PlayerDetail from './features/PlayerDetail'
import DefenseDetail from './features/DefenseDetail'
import About from './features/About'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium transition-colors ${
    isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
  }`

export default function App() {
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto bg-slate-950">
      <main className="flex-1 overflow-y-auto scroll-touch pb-20">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/player/:id" element={<PlayerDetail />} />
          <Route path="/defense/:id" element={<DefenseDetail />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around safe-bottom z-50">
        <NavLink to="/" end className={navCls}>
          <span className="text-lg">🏆</span>
          <span>Top</span>
        </NavLink>
        <NavLink to="/rankings" className={navCls}>
          <span className="text-lg">📊</span>
          <span>Rankings</span>
        </NavLink>
        <NavLink to="/compare" className={navCls}>
          <span className="text-lg">⚖️</span>
          <span>Compare</span>
        </NavLink>
        <NavLink to="/about" className={navCls}>
          <span className="text-lg">ℹ️</span>
          <span>About</span>
        </NavLink>
      </nav>
    </div>
  )
}

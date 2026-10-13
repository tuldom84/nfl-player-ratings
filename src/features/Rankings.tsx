import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Position } from '../lib/types'

const POSITIONS: (Position | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']

export default function Rankings() {
  const { data, loading, error } = useDataLake()
  const [pos, setPos] = useState<Position | 'ALL'>('ALL')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!data) return []
    let list = pos === 'ALL' ? data.players : data.players.filter((p) => p.position === pos)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => b.grade - a.grade)
  }, [data, pos, query])

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  if (error || !data) return <div className="p-6 text-rose-400">{error || 'No data'}</div>

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold mb-4">Rankings</h1>

      {/* Search */}
      <input
        type="search"
        placeholder="Search player or team…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      {/* Position chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPos(p)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              pos === p
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500 mb-3">{filtered.length} players</p>

      <ul className="space-y-1">
        {filtered.map((p, idx) => (
          <li key={p.id}>
            <Link
              to={`/player/${p.id}`}
              className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900"
            >
              <span className="w-7 text-right text-sm text-slate-500 tabular-nums">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-slate-400">
                  {p.team} · {p.position}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold tabular-nums">
                {p.grade.toFixed(0)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Position } from '../lib/types'

const POSITIONS: (Position | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']

type RankRow = {
  id: string
  name: string
  team: string
  position: string
  grade: number
  isDefense?: boolean
}

export default function Rankings() {
  const { data, loading, error } = useDataLake()
  const [pos, setPos] = useState<Position | 'ALL'>('ALL')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!data) return [] as RankRow[]

    let list: RankRow[] = []

    if (pos === 'DST') {
      list = (data.defenses || []).map((d) => ({
        id: d.id,
        name: d.name,
        team: d.abbreviation || '',
        position: 'DST',
        grade: d.grade,
        isDefense: true,
      }))
    } else if (pos === 'ALL') {
      list = [
        ...data.players.map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          position: p.position,
          grade: p.grade,
        })),
        ...(data.defenses || []).map((d) => ({
          id: d.id,
          name: d.name,
          team: d.abbreviation || '',
          position: 'DST',
          grade: d.grade,
          isDefense: true,
        })),
      ]
    } else {
      list = data.players
        .filter((p) => p.position === pos)
        .map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          position: p.position,
          grade: p.grade,
        }))
    }

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

      <input
        type="search"
        placeholder="Search player or team…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

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

      <p className="text-xs text-slate-500 mb-3">
        {filtered.length} {pos === 'DST' ? 'defenses' : 'entries'}
      </p>

      <ul className="space-y-1">
        {filtered.map((p, idx) => {
          const inner = (
            <>
              <span className="w-7 text-right text-sm text-slate-500 tabular-nums">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-slate-400">
                  {p.isDefense ? 'Team Defense' : `${p.team} · ${p.position}`}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold tabular-nums">
                {p.grade.toFixed(0)}
              </span>
            </>
          )

          return (
            <li key={`${p.position}-${p.id}`}>
              {p.isDefense ? (
                <Link
                  to={`/defense/${p.id}`}
                  className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900"
                >
                  {inner}
                </Link>
              ) : (
                <Link
                  to={`/player/${p.id}`}
                  className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900"
                >
                  {inner}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

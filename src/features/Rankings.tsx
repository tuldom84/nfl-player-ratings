import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Position } from '../lib/types'

const POSITIONS: (Position | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']

type SortKey = 'value' | 'pos' | 'proj' | 'avg'

type RankRow = {
  id: string
  name: string
  team: string
  position: string
  /** Score shown as primary for current mode */
  displayGrade: number
  valueGrade: number
  posGrade: number
  avgPts?: number
  projectedPts?: number
  availability?: number
  opponent?: string
  homeAway?: string
  injuryStatus?: string
  isDefense?: boolean
}

export default function Rankings() {
  const { data, loading, error } = useDataLake()
  const [pos, setPos] = useState<Position | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('value')

  // ALL defaults to cross-position value; position tabs default to pos grade
  useEffect(() => {
    setSortBy(pos === 'ALL' ? 'value' : 'pos')
  }, [pos])

  const filtered = useMemo(() => {
    if (!data) return [] as RankRow[]

    let list: RankRow[] = []

    if (pos === 'DST') {
      list = (data.defenses || []).map((d) => ({
        id: d.id,
        name: d.name,
        team: d.abbreviation || '',
        position: 'DST',
        displayGrade: d.valueGrade ?? d.grade,
        valueGrade: d.valueGrade ?? d.grade,
        posGrade: d.grade,
        avgPts: d.fantasy?.avgPts,
        projectedPts: d.fantasy?.projectedPts,
        availability: d.availability,
        opponent: d.fantasy?.opponent,
        homeAway: d.fantasy?.homeAway,
        isDefense: true,
      }))
    } else if (pos === 'ALL') {
      list = [
        ...data.players.map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          position: p.position,
          displayGrade: p.valueGrade ?? p.grade,
          valueGrade: p.valueGrade ?? p.grade,
          posGrade: p.grade,
          avgPts: p.fantasy?.avgPts,
          projectedPts: p.fantasy?.projectedPts,
          availability: p.availability,
          opponent: p.fantasy?.opponent,
          homeAway: p.fantasy?.homeAway,
          injuryStatus: p.fantasy?.injuryStatus,
        })),
        ...(data.defenses || []).map((d) => ({
          id: d.id,
          name: d.name,
          team: d.abbreviation || '',
          position: 'DST',
          displayGrade: d.valueGrade ?? d.grade,
          valueGrade: d.valueGrade ?? d.grade,
          posGrade: d.grade,
          avgPts: d.fantasy?.avgPts,
          projectedPts: d.fantasy?.projectedPts,
          availability: d.availability,
          opponent: d.fantasy?.opponent,
          homeAway: d.fantasy?.homeAway,
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
          displayGrade: p.grade,
          valueGrade: p.valueGrade ?? p.grade,
          posGrade: p.grade,
          avgPts: p.fantasy?.avgPts,
          projectedPts: p.fantasy?.projectedPts,
          availability: p.availability,
          opponent: p.fantasy?.opponent,
          homeAway: p.fantasy?.homeAway,
          injuryStatus: p.fantasy?.injuryStatus,
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

    return [...list].sort((a, b) => {
      if (sortBy === 'proj') return (b.projectedPts ?? 0) - (a.projectedPts ?? 0)
      if (sortBy === 'avg') return (b.avgPts ?? 0) - (a.avgPts ?? 0)
      if (sortBy === 'pos') return b.posGrade - a.posGrade
      // value (cross-position)
      return b.valueGrade - a.valueGrade
    })
  }, [data, pos, query, sortBy])

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  if (error || !data) return <div className="p-6 text-rose-400">{error || 'No data'}</div>

  const week = data.meta.projectionWeek || data.meta.week

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold mb-1">Rankings</h1>
      <p className="text-xs text-slate-500 mb-3">
        {pos === 'ALL'
          ? 'ALL = cross-position PPR value (PPG × availability × pos weight)'
          : `${pos} = position-relative grade · also sortable by value / proj`}
        {' · '}Week {week}
      </p>

      <input
        type="search"
        placeholder="Search player or team…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPos(p)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              pos === p ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3 text-xs overflow-x-auto">
        {(
          [
            { key: 'value' as const, label: 'Value' },
            { key: 'pos' as const, label: 'Pos grade' },
            { key: 'proj' as const, label: `Wk ${week}` },
            { key: 'avg' as const, label: 'Avg PPG' },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key)}
            className={`flex-shrink-0 px-3 py-1 rounded-full ${
              sortBy === s.key ? 'bg-slate-700 text-white' : 'text-slate-500'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {filtered.length} {pos === 'DST' ? 'defenses' : pos === 'ALL' ? 'players + DST' : 'players'}
      </p>

      <ul className="space-y-1">
        {filtered.map((p, idx) => {
          const inj =
            p.injuryStatus && p.injuryStatus !== 'Active' ? (
              <span className="ml-1 text-[10px] text-rose-400 font-medium">{p.injuryStatus}</span>
            ) : null
          const matchup =
            p.homeAway === 'bye'
              ? 'BYE'
              : p.opponent
                ? `${p.homeAway === 'home' ? 'vs' : '@'} ${p.opponent}`
                : ''

          const primary =
            sortBy === 'proj'
              ? p.projectedPts != null
                ? p.projectedPts.toFixed(1)
                : '—'
              : sortBy === 'avg'
                ? p.avgPts != null
                  ? p.avgPts.toFixed(1)
                  : '—'
                : sortBy === 'pos'
                  ? p.posGrade.toFixed(0)
                  : p.valueGrade.toFixed(0)

          const primaryUnit =
            sortBy === 'proj' ? 'proj' : sortBy === 'avg' ? 'avg' : sortBy === 'pos' ? 'pos' : 'val'

          const inner = (
            <>
              <span className="w-7 text-right text-sm text-slate-500 tabular-nums">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {p.name}
                  {inj}
                </div>
                <div className="text-xs text-slate-400">
                  {p.isDefense ? 'Team Defense' : `${p.team} · ${p.position}`}
                  {matchup ? ` · ${matchup}` : ''}
                  {p.availability != null && p.availability < 0.95 && (
                    <span className="text-amber-500"> · {Math.round(p.availability * 100)}% avail</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-semibold tabular-nums text-sm">
                  {primary}
                  <span className="text-[10px] text-slate-500 font-normal"> {primaryUnit}</span>
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {sortBy !== 'value' && <>{p.valueGrade.toFixed(0)} val · </>}
                  {sortBy !== 'pos' && pos !== 'ALL' && <>{p.posGrade.toFixed(0)} pos · </>}
                  {p.avgPts != null ? `${p.avgPts.toFixed(1)} avg` : ''}
                </div>
              </div>
            </>
          )

          return (
            <li key={`${p.position}-${p.id}`}>
              {p.isDefense ? (
                <Link to={`/defense/${p.id}`} className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900">
                  {inner}
                </Link>
              ) : (
                <Link to={`/player/${p.id}`} className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900">
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

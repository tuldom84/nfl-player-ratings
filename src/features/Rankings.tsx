import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Position } from '../lib/types'

const POSITIONS: (Position | 'ALL' | 'OFF' | 'POWER')[] = [
  'ALL',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST',
  'OFF',
  'POWER',
]
const FILTERS_KEY = 'rankings-filters-v1'

type SortKey = 'value' | 'pos' | 'rps' | 'proj' | 'avg'

type RankRow = {
  id: string
  name: string
  team: string
  position: string
  displayGrade: number
  valueGrade: number
  posGrade: number
  rps: number
  avgPts?: number
  projectedPts?: number
  availability?: number
  opponent?: string
  homeAway?: string
  injuryStatus?: string
  isDefense?: boolean
  offRps?: number
  defRps?: number
}

type SavedFilters = {
  pos: Position | 'ALL' | 'OFF' | 'POWER'
  sortBy: SortKey
  query: string
}

const SORT_KEYS: SortKey[] = ['value', 'pos', 'rps', 'proj', 'avg']

function loadFilters(): SavedFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY)
    if (!raw) return { pos: 'ALL', sortBy: 'value', query: '' }
    const parsed = JSON.parse(raw) as SavedFilters
    const pos = POSITIONS.includes(parsed.pos) ? parsed.pos : 'ALL'
    const sortBy = SORT_KEYS.includes(parsed.sortBy) ? parsed.sortBy : 'value'
    const query = typeof parsed.query === 'string' ? parsed.query : ''
    return { pos, sortBy, query }
  } catch {
    return { pos: 'ALL', sortBy: 'value', query: '' }
  }
}

function saveFilters(f: SavedFilters) {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(f))
  } catch {
    /* ignore quota */
  }
}

function rankingsSubtitle(
  pos: Position | 'ALL' | 'OFF' | 'POWER',
  sortBy: SortKey
): string {
  if (pos === 'POWER') {
    return 'POWER = (offense RPS + defense RPS) ÷ 2 — real football team strength'
  }
  if (pos === 'OFF') {
    return 'OFF = team offense RPS (PPG, YPG, TDs, turnovers — not fantasy)'
  }
  if (sortBy === 'rps') {
    return 'RPS = real football value at position (not fantasy)'
  }
  if (sortBy === 'pos') {
    if (pos === 'ALL') {
      return 'Pos grade = fantasy value vs others at the same position (each position ranked separately)'
    }
    if (pos === 'DST') {
      return 'Pos grade = fantasy value vs all other team defenses'
    }
    return `Pos grade = fantasy value vs all other ${pos}s at the position`
  }
  if (sortBy === 'value') {
    return 'Value = fantasy value regardless of position (PPG × availability × positional weight)'
  }
  if (sortBy === 'proj') {
    return 'Weekly projection (matchup-adjusted)'
  }
  if (sortBy === 'avg') {
    return 'Season average fantasy points per game'
  }
  return 'Ranked by selected sort'
}

export default function Rankings() {
  const { data, loading, error } = useDataLake()
  const initial = loadFilters()
  const [pos, setPosState] = useState<Position | 'ALL' | 'OFF' | 'POWER'>(initial.pos)
  const [query, setQueryState] = useState(initial.query)
  const [sortBy, setSortByState] = useState<SortKey>(initial.sortBy)

  useEffect(() => {
    saveFilters({ pos, sortBy, query })
  }, [pos, sortBy, query])

  const setPos = useCallback((p: Position | 'ALL' | 'OFF' | 'POWER') => setPosState(p), [])
  const setSortBy = useCallback((s: SortKey) => setSortByState(s), [])
  const setQuery = useCallback((q: string) => setQueryState(q), [])

  const filtered = useMemo(() => {
    if (!data) return [] as RankRow[]

    let list: RankRow[] = []

    if (pos === 'POWER') {
      const offs = data.teamOffenses || []
      const defs = data.defenses || []
      const defById = new Map(defs.map((d) => [d.id, d]))
      list = offs.map((o) => {
        const d = defById.get(o.id)
        const defRps = d?.rps ?? d?.grade ?? 0
        const power = Math.round(((o.rps + defRps) / 2) * 10) / 10
        return {
          id: o.id,
          name: o.name,
          team: o.abbreviation || '',
          position: 'POWER',
          displayGrade: power,
          valueGrade: power,
          posGrade: power,
          rps: power,
          avgPts: o.stats?.pointsPerGame,
          projectedPts: undefined,
          availability: 1,
          isDefense: false,
          offRps: o.rps,
          defRps,
        }
      })
    } else if (pos === 'OFF') {
      list = (data.teamOffenses || []).map((o) => ({
        id: o.id,
        name: o.name,
        team: o.abbreviation || '',
        position: 'OFF',
        displayGrade: o.rps,
        valueGrade: o.rps,
        posGrade: o.rps,
        rps: o.rps,
        avgPts: o.stats?.pointsPerGame,
        projectedPts: undefined,
        availability: 1,
        isDefense: false,
      }))
    } else if (pos === 'DST') {
      list = (data.defenses || []).map((d) => ({
        id: d.id,
        name: d.name,
        team: d.abbreviation || '',
        position: 'DST',
        displayGrade: d.grade,
        valueGrade: d.valueGrade ?? d.grade,
        posGrade: d.grade,
        rps: d.rps ?? d.grade,
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
          rps: p.rps ?? p.grade,
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
          rps: d.rps ?? d.grade,
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
          rps: p.rps ?? p.grade,
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
        (p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
      )
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'proj') return (b.projectedPts ?? 0) - (a.projectedPts ?? 0)
      if (sortBy === 'avg') return (b.avgPts ?? 0) - (a.avgPts ?? 0)
      if (sortBy === 'pos') return b.posGrade - a.posGrade
      if (sortBy === 'rps') return b.rps - a.rps
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
        {rankingsSubtitle(pos, sortBy)}
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
            { key: 'rps' as const, label: 'RPS' },
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
        {filtered.length}{' '}
        {pos === 'DST'
          ? 'defenses'
          : pos === 'OFF'
            ? 'team offenses'
            : pos === 'POWER'
              ? 'teams'
              : pos === 'ALL'
                ? 'players + DST'
                : 'players'}
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
                  : sortBy === 'rps'
                    ? p.rps.toFixed(0)
                    : p.valueGrade.toFixed(0)

          const primaryUnit =
            sortBy === 'proj'
              ? 'proj'
              : sortBy === 'avg'
                ? 'avg'
                : sortBy === 'pos'
                  ? 'pos'
                  : sortBy === 'rps'
                    ? 'rps'
                    : 'val'

          const inner = (
            <>
              <span className="w-7 text-right text-sm text-slate-500 tabular-nums">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {p.name}
                  {inj}
                </div>
                <div className="text-xs text-slate-400">
                  {p.position === 'POWER'
                    ? `OFF ${p.offRps?.toFixed(0) ?? '—'} · DEF ${p.defRps?.toFixed(0) ?? '—'}`
                    : p.position === 'OFF'
                      ? 'Team Offense'
                      : p.isDefense
                        ? 'Team Defense'
                        : `${p.team} · ${p.position}`}
                  {matchup ? ` · ${matchup}` : ''}
                  {p.availability != null && p.availability < 0.95 && (
                    <span className="text-amber-500">
                      {' '}
                      · {Math.round(p.availability * 100)}% avail
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-semibold tabular-nums text-sm">
                  {primary}
                  <span className="text-[10px] text-slate-500 font-normal"> {primaryUnit}</span>
                </div>
                <div className="text-[10px] text-slate-500 tabular-nums">
                  {primaryUnit !== 'val' && <>{p.valueGrade.toFixed(0)} val · </>}
                  {primaryUnit !== 'pos' && <>{p.posGrade.toFixed(0)} pos · </>}
                  {primaryUnit !== 'rps' && <>{p.rps.toFixed(0)} rps · </>}
                  {p.avgPts != null ? `${p.avgPts.toFixed(1)} avg` : ''}
                </div>
              </div>
            </>
          )

          return (
            <li key={`${p.position}-${p.id}`}>
              {p.position === 'POWER' ? (
                <Link
                  to={`/team/${p.id}`}
                  className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900"
                >
                  {inner}
                </Link>
              ) : p.position === 'OFF' ? (
                <Link
                  to={`/offense/${p.id}`}
                  className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900"
                >
                  {inner}
                </Link>
              ) : p.isDefense ? (
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

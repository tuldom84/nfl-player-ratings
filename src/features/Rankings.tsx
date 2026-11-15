import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Position } from '../lib/types'
import { PlayerHeadshot } from '../components/PlayerHeadshot'
import DataLoadError from '../components/DataLoadError'
import ChipScroller from '../components/ChipScroller'

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
type PosFilter = Position | 'ALL' | 'OFF' | 'POWER'

type RankRow = {
  id: string
  name: string
  team: string
  position: string
  headshot?: string
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
  pos: PosFilter
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

function rankingsSubtitle(pos: PosFilter, sortBy: SortKey): string {
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
      return 'Pos grade = fantasy value vs others at the same position, as if all were healthy (each position ranked separately)'
    }
    if (pos === 'DST') {
      return 'Pos grade = fantasy value vs all other team defenses, as if all were healthy'
    }
    return `Pos grade = fantasy value vs all other ${pos}s at the position, as if all were healthy`
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

function entityLabel(pos: PosFilter, count: number): string {
  const noun =
    pos === 'DST'
      ? 'defenses'
      : pos === 'OFF'
        ? 'team offenses'
        : pos === 'POWER'
          ? 'teams'
          : pos === 'ALL'
            ? 'players + DST'
            : 'players'
  return `${count} ${noun}`
}

function rowHref(p: RankRow): string {
  if (p.position === 'POWER') return `/team/${p.id}`
  if (p.position === 'OFF') return `/offense/${p.id}`
  if (p.isDefense) return `/defense/${p.id}`
  return `/player/${p.id}`
}

function matchupLabel(p: RankRow): string {
  if (p.homeAway === 'bye') return 'BYE'
  if (p.opponent) return `${p.homeAway === 'home' ? 'vs' : '@'} ${p.opponent}`
  return ''
}

function roleLabel(p: RankRow): string {
  if (p.position === 'POWER') return `OFF ${p.offRps?.toFixed(0) ?? '—'} · DEF ${p.defRps?.toFixed(0) ?? '—'}`
  if (p.position === 'OFF') return 'Team Offense'
  if (p.isDefense) return 'Team Defense'
  return `${p.team} · ${p.position}`
}

function InjuryBadge({ status }: { status?: string }) {
  if (!status || status === 'Active') return null
  return (
    <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-rose-300 bg-rose-950/70 align-middle whitespace-nowrap">
      {status}
    </span>
  )
}

function Avatar({ p }: { p: RankRow }) {
  if (!p.isDefense && p.position !== 'OFF' && p.position !== 'POWER') {
    return <PlayerHeadshot src={p.headshot} name={p.name} position={p.position} size="sm" />
  }
  return (
    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">
      {p.position === 'POWER' ? 'TM' : p.position === 'OFF' ? 'OFF' : 'DST'}
    </div>
  )
}

function primaryValue(p: RankRow, sortBy: SortKey): { value: string; unit: string } {
  if (sortBy === 'proj') {
    return { value: p.projectedPts != null ? p.projectedPts.toFixed(1) : '—', unit: 'proj' }
  }
  if (sortBy === 'avg') {
    return { value: p.avgPts != null ? p.avgPts.toFixed(1) : '—', unit: 'avg' }
  }
  if (sortBy === 'pos') return { value: p.posGrade.toFixed(0), unit: 'pos' }
  if (sortBy === 'rps') return { value: p.rps.toFixed(0), unit: 'rps' }
  return { value: p.valueGrade.toFixed(0), unit: 'val' }
}

export default function Rankings() {
  const { data, loading, error } = useDataLake()
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = loadFilters()
  const urlPos = searchParams.get('pos')
  const startPos: PosFilter =
    urlPos && (POSITIONS as readonly string[]).includes(urlPos) ? (urlPos as PosFilter) : initial.pos

  const [pos, setPosState] = useState<PosFilter>(startPos)
  const [query, setQueryState] = useState(initial.query)
  const [sortBy, setSortByState] = useState<SortKey>(initial.sortBy)

  useEffect(() => {
    saveFilters({ pos, sortBy, query })
  }, [pos, sortBy, query])

  const setPos = useCallback(
    (p: PosFilter) => {
      setPosState(p)
      setSearchParams(p === 'ALL' ? {} : { pos: p }, { replace: true })
    },
    [setSearchParams]
  )
  const setSortBy = useCallback((s: SortKey) => setSortByState(s), [])
  const setQuery = useCallback((q: string) => setQueryState(q), [])

  const filtered = useMemo(() => {
    if (!data) return [] as RankRow[]

    let list: RankRow[]

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
          headshot: p.headshot,
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
          headshot: p.headshot,
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
  if (error || !data) return <DataLoadError message={error || 'No data'} />

  const week = data.meta.projectionWeek || data.meta.week
  const sortOptions = [
    { key: 'value' as const, label: 'Value' },
    { key: 'pos' as const, label: 'Pos grade' },
    { key: 'rps' as const, label: 'RPS' },
    { key: 'proj' as const, label: `Wk ${week}` },
    { key: 'avg' as const, label: 'Avg PPG' },
  ]

  return (
    <div className="px-4 lg:px-6 pt-4 pb-8">
      <h1 className="text-2xl font-bold mb-1">Rankings</h1>
      <p className="text-xs text-slate-400 mb-3">
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

      <ChipScroller className="mb-1">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              pos === p ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {p}
          </button>
        ))}
      </ChipScroller>

      <div className="flex gap-2 mb-3 text-xs overflow-x-auto lg:hidden">
        {sortOptions.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSortBy(s.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-medium ${
              sortBy === s.key
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800/70 text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-3">{entityLabel(pos, filtered.length)}</p>

      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4">
          <p className="text-slate-300 font-medium">No matches</p>
          <p className="text-sm text-slate-500 mt-1">
            {query.trim()
              ? `Nothing matches “${query.trim()}”. Try a different search or filter.`
              : 'No players in this filter. Pick another position.'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide">
                <tr className="border-b border-slate-800">
                  <th className="text-right font-medium text-slate-400 px-3 py-2.5 w-10">#</th>
                  <th className="text-left font-medium text-slate-400 px-3 py-2.5">Player</th>
                  <th className="text-left font-medium text-slate-400 px-3 py-2.5">Matchup</th>
                  {sortOptions.map((s) => (
                    <th key={s.key} className="text-right font-medium px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSortBy(s.key)}
                        className={`whitespace-nowrap ${
                          sortBy === s.key
                            ? 'text-emerald-400'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {s.label}
                        {sortBy === s.key ? ' ▾' : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const matchup = matchupLabel(p)
                  return (
                    <tr
                      key={`${p.position}-${p.id}`}
                      className="border-b border-slate-800/80 hover:bg-slate-900/70"
                    >
                      <td className="text-right text-slate-500 tabular-nums px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link to={rowHref(p)} className="flex items-center gap-3 min-w-0">
                          <Avatar p={p} />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-100">
                              {p.name}
                              <InjuryBadge status={p.injuryStatus} />
                            </span>
                            <span className="block text-xs text-slate-400">
                              {roleLabel(p)}
                              {p.availability != null && p.availability < 0.95 && (
                                <span className="text-amber-500">
                                  {' '}
                                  · {Math.round(p.availability * 100)}% avail
                                </span>
                              )}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{matchup || '—'}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sortBy === 'value' ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                        {p.valueGrade.toFixed(0)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sortBy === 'pos' ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                        {p.posGrade.toFixed(0)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sortBy === 'rps' ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                        {p.rps.toFixed(0)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sortBy === 'proj' ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                        {p.projectedPts != null ? p.projectedPts.toFixed(1) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sortBy === 'avg' ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>
                        {p.avgPts != null ? p.avgPts.toFixed(1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-1 lg:hidden">
            {filtered.map((p, idx) => {
              const matchup = matchupLabel(p)
              const { value: primary, unit: primaryUnit } = primaryValue(p, sortBy)
              return (
                <li key={`${p.position}-${p.id}`}>
                  <Link
                    to={rowHref(p)}
                    className="flex items-center gap-3 py-3 px-2 rounded-lg active:bg-slate-900"
                  >
                    <span className="w-7 text-right text-sm text-slate-500 tabular-nums shrink-0">
                      {idx + 1}
                    </span>
                    <Avatar p={p} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium leading-snug text-slate-100">
                        <span className="break-words">{p.name}</span>
                        <InjuryBadge status={p.injuryStatus} />
                      </div>
                      <div className="text-xs text-slate-400">
                        {roleLabel(p)}
                        {matchup ? ` · ${matchup}` : ''}
                        {p.availability != null && p.availability < 0.95 && (
                          <span className="text-amber-500">
                            {' '}
                            · {Math.round(p.availability * 100)}% avail
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-emerald-400 font-semibold tabular-nums text-sm">
                        {primary}
                        <span className="text-[10px] text-slate-500 font-normal"> {primaryUnit}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 justify-items-end text-[10px] text-slate-400 tabular-nums">
                        {primaryUnit !== 'val' && <span>{p.valueGrade.toFixed(0)} val</span>}
                        {primaryUnit !== 'pos' && <span>{p.posGrade.toFixed(0)} pos</span>}
                        {primaryUnit !== 'rps' && <span>{p.rps.toFixed(0)} rps</span>}
                        {p.avgPts != null && <span>{p.avgPts.toFixed(1)} avg</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Player, Position } from '../lib/types'

const MAX = 5
const STORAGE_KEY = 'compare-ids'
const POSITIONS: (Position | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K']

function readInitialIds(searchParams: URLSearchParams): string[] {
  const fromUrl = (searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromUrl.length) return fromUrl.slice(0, MAX)
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed)) return parsed.slice(0, MAX)
    }
  } catch { /* ignore */ }
  return []
}

export default function Compare() {
  const { data, loading, error } = useDataLake()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readInitialIds(searchParams))
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<Position | 'ALL'>('ALL')

  useEffect(() => {
    if (selectedIds.length) {
      setSearchParams({ ids: selectedIds.join(',') }, { replace: true })
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds))
    } else {
      setSearchParams({}, { replace: true })
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [selectedIds, setSearchParams])

  const selected: Player[] = useMemo(() => {
    if (!data) return []
    return selectedIds
      .map((id) => data.players.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
  }, [data, selectedIds])

  const searchResults = useMemo(() => {
    if (!data || !query.trim()) return []
    const q = query.toLowerCase()
    return data.players
      .filter((p) => {
        if (pos !== 'ALL' && p.position !== pos) return false
        if (selectedIds.includes(p.id)) return false
        return (
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.grade - a.grade)
      .slice(0, 12)
  }, [data, query, pos, selectedIds])

  function addPlayer(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= MAX) return
    setSelectedIds((prev) => [...prev, id])
    setQuery('')
  }

  function removePlayer(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  function clearAll() {
    setSelectedIds([])
  }

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  if (error || !data) return <div className="p-6 text-rose-400">{error || 'No data'}</div>

  const week = data.meta.projectionWeek || data.meta.week

  const rows: { label: string; key: string; better?: 'high' | 'low'; format: (p: Player) => string }[] = [
    { label: 'Grade', key: 'grade', better: 'high', format: (p) => p.grade.toFixed(1) },
    { label: 'Label', key: 'label', format: (p) => p.gradeLabel },
    { label: 'Pos rank', key: 'rankPos', better: 'low', format: (p) => (p.rankPos != null ? `#${p.rankPos}` : '—') },
    { label: 'Avg PPG', key: 'avg', better: 'high', format: (p) => p.fantasy?.avgPts?.toFixed(1) ?? '—' },
    { label: `Wk ${week} proj`, key: 'proj', better: 'high', format: (p) => p.fantasy?.projectedPts?.toFixed(1) ?? '—' },
    { label: 'Season pts', key: 'season', better: 'high', format: (p) => p.fantasy?.seasonPts?.toFixed(1) ?? '—' },
    {
      label: 'Matchup',
      key: 'matchup',
      format: (p) => {
        const f = p.fantasy
        if (!f) return '—'
        if (f.homeAway === 'bye') return 'BYE'
        if (!f.opponent) return '—'
        return `${f.homeAway === 'home' ? 'vs' : '@'} ${f.opponent}`
      },
    },
    {
      label: 'Opp DST',
      key: 'oppDst',
      better: 'low',
      format: (p) =>
        p.fantasy?.oppDstGrade != null ? String(p.fantasy.oppDstGrade) : '—',
    },
    {
      label: 'Injury',
      key: 'injury',
      format: (p) => p.fantasy?.injuryStatus || 'Active',
    },
    {
      label: '% owned',
      key: 'owned',
      better: 'high',
      format: (p) =>
        p.fantasy?.percentOwned != null ? `${p.fantasy.percentOwned.toFixed(0)}%` : '—',
    },
    { label: 'Pass yds', key: 'passYds', better: 'high', format: (p) => fmt(p.stats.passYds) },
    { label: 'Pass TDs', key: 'passTDs', better: 'high', format: (p) => fmt(p.stats.passTDs) },
    { label: 'Rush yds', key: 'rushYds', better: 'high', format: (p) => fmt(p.stats.rushYds) },
    { label: 'Rush TDs', key: 'rushTDs', better: 'high', format: (p) => fmt(p.stats.rushTDs) },
    { label: 'Receptions', key: 'rec', better: 'high', format: (p) => fmt(p.stats.receptions) },
    { label: 'Rec yds', key: 'recYds', better: 'high', format: (p) => fmt(p.stats.recYds) },
    { label: 'Rec TDs', key: 'recTDs', better: 'high', format: (p) => fmt(p.stats.recTDs) },
    { label: 'Targets', key: 'tgt', better: 'high', format: (p) => fmt(p.stats.targets) },
  ]

  function bestIndex(row: (typeof rows)[0]): number | null {
    if (!row.better || selected.length < 2) return null
    const nums = selected.map((p) => {
      const raw = row.format(p).replace(/[^0-9.-]/g, '')
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    })
    const valid = nums.filter((n): n is number => n != null)
    if (!valid.length) return null
    const target = row.better === 'high' ? Math.max(...valid) : Math.min(...valid)
    const idx = nums.findIndex((n) => n === target)
    return idx >= 0 ? idx : null
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Compare</h1>
        {selectedIds.length > 0 && (
          <button onClick={clearAll} className="text-xs text-slate-400 hover:text-rose-400">
            Clear all
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Select up to {MAX} players · Full-PPR · Week {week}
      </p>

      <div className="flex flex-wrap gap-2 mb-4 min-h-[2rem]">
        {selected.map((p) => (
          <button
            key={p.id}
            onClick={() => removePlayer(p.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-sm text-emerald-200"
          >
            <span className="font-medium truncate max-w-[8rem]">{p.name}</span>
            <span className="text-emerald-500 text-xs">{p.position}</span>
            <span className="text-slate-500">×</span>
          </button>
        ))}
        {selected.length === 0 && (
          <span className="text-sm text-slate-500">No players selected yet</span>
        )}
      </div>

      {selectedIds.length < MAX && (
        <div className="mb-6">
          <input
            type="search"
            placeholder="Search players to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full mb-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  pos === p ? 'bg-slate-700 text-white' : 'text-slate-500'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {query.trim() && (
            <ul className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800 max-h-56 overflow-y-auto">
              {searchResults.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
              )}
              {searchResults.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => addPlayer(p.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-900 active:bg-slate-800"
                  >
                    <span className="w-8 text-center text-xs font-bold text-slate-500">{p.position}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{p.name}</span>
                      <span className="text-xs text-slate-500">{p.team}</span>
                    </span>
                    <span className="text-emerald-400 text-sm tabular-nums">{p.grade.toFixed(0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!query.trim() && (
            <p className="text-xs text-slate-600">
              {MAX - selectedIds.length} slot{MAX - selectedIds.length !== 1 ? 's' : ''} left
            </p>
          )}
        </div>
      )}

      {selected.length >= 1 && (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm border-collapse min-w-[320px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-950 text-left text-xs text-slate-500 font-medium py-2 pr-2 min-w-[5.5rem]">
                  Metric
                </th>
                {selected.map((p) => (
                  <th key={p.id} className="text-center px-2 py-2 min-w-[4.5rem] align-bottom">
                    <Link
                      to={`/player/${p.id}`}
                      className="block text-emerald-400 font-semibold leading-tight hover:underline"
                    >
                      {p.name.split(' ').slice(-1)[0]}
                    </Link>
                    <span className="block text-[10px] text-slate-500 font-normal">
                      {p.team} {p.position}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = selected.map((p) => row.format(p))
                if (values.every((v) => v === '—' || v === '0')) return null
                const best = bestIndex(row)
                return (
                  <tr key={row.key} className="border-t border-slate-800/80">
                    <td className="sticky left-0 z-10 bg-slate-950 text-xs text-slate-400 py-2.5 pr-2">
                      {row.label}
                    </td>
                    {selected.map((p, i) => (
                      <td
                        key={p.id}
                        className={`text-center px-2 py-2.5 tabular-nums ${
                          best === i ? 'text-emerald-400 font-semibold' : 'text-slate-200'
                        }`}
                      >
                        {row.format(p)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected.length === 0 && (
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p className="mb-2">Search above to add players</p>
          <p className="text-xs">Tip: open a player and tap “+ Compare”</p>
        </div>
      )}
    </div>
  )
}

function fmt(v?: number) {
  if (v == null || v === 0) return '—'
  return v.toLocaleString()
}

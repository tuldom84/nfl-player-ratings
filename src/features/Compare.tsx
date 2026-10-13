import { useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Player, Position } from '../lib/types'

const MAX = 5
const STORAGE_KEY = 'compare-ids'
const POSITIONS: (Position | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K']

type AdviceMode = null | 'startSit' | 'trade'
type TeamSide = 'A' | 'B' | 'none'

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

function letterFromScore(score: number): { letter: string; label: string } {
  // score is relative advantage in points / value units
  if (score >= 12) return { letter: 'A+', label: 'Steal' }
  if (score >= 8) return { letter: 'A', label: 'Excellent' }
  if (score >= 5) return { letter: 'B+', label: 'Strong' }
  if (score >= 2.5) return { letter: 'B', label: 'Good' }
  if (score >= 1) return { letter: 'C+', label: 'Slight edge' }
  if (score >= -1) return { letter: 'C', label: 'Even' }
  if (score >= -2.5) return { letter: 'C-', label: 'Slight loss' }
  if (score >= -5) return { letter: 'D', label: 'Poor' }
  if (score >= -8) return { letter: 'D-', label: 'Bad' }
  return { letter: 'F', label: 'Avoid' }
}

function playerValue(p: Player): number {
  // Season-long trade value proxy: avg PPG weighted by value grade availability
  const avg = p.fantasy?.avgPts ?? 0
  const vg = (p.valueGrade ?? p.grade) / 100
  return avg * (0.6 + 0.4 * vg)
}

export default function Compare() {
  const { data, loading, error } = useDataLake()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readInitialIds(searchParams))
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<Position | 'ALL'>('ALL')
  const [advice, setAdvice] = useState<AdviceMode>(null)
  const [tradeSide, setTradeSide] = useState<Record<string, TeamSide>>({})

  useEffect(() => {
    if (selectedIds.length) {
      setSearchParams({ ids: selectedIds.join(',') }, { replace: true })
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds))
    } else {
      setSearchParams({}, { replace: true })
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [selectedIds, setSearchParams])

  // Reset trade sides when selection changes
  useEffect(() => {
    setTradeSide((prev) => {
      const next: Record<string, TeamSide> = {}
      for (const id of selectedIds) next[id] = prev[id] || 'none'
      return next
    })
  }, [selectedIds])

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
    setAdvice(null)
  }

  const startSitResult = useMemo(() => {
    if (selected.length < 2) return null
    const ranked = [...selected].sort(
      (a, b) => (b.fantasy?.projectedPts ?? -1) - (a.fantasy?.projectedPts ?? -1)
    )
    const winner = ranked[0]
    const runner = ranked[1]
    const wProj = winner.fantasy?.projectedPts ?? 0
    const rProj = runner.fantasy?.projectedPts ?? 0
    const margin = Math.round((wProj - rProj) * 10) / 10
    const notes: string[] = []
    for (const p of ranked) {
      const f = p.fantasy
      if (!f) continue
      if (f.homeAway === 'bye') notes.push(`${p.name}: BYE — do not start`)
      else if (f.injuryStatus && f.injuryStatus !== 'Active')
        notes.push(`${p.name}: ${f.injuryStatus}${f.injuryDetail ? ` — ${f.injuryDetail}` : ''}`)
      else if (f.matchupNote && /Tough|Favorable/.test(f.matchupNote))
        notes.push(`${p.name}: ${f.matchupNote}`)
    }
    return { ranked, winner, margin, notes, wProj, rProj }
  }, [selected])

  const tradeResult = useMemo(() => {
    const teamA = selected.filter((p) => tradeSide[p.id] === 'A')
    const teamB = selected.filter((p) => tradeSide[p.id] === 'B')
    if (!teamA.length || !teamB.length) return null

    const valA = teamA.reduce((s, p) => s + playerValue(p), 0)
    const valB = teamB.reduce((s, p) => s + playerValue(p), 0)
    const avgA = teamA.reduce((s, p) => s + (p.fantasy?.avgPts ?? 0), 0)
    const avgB = teamB.reduce((s, p) => s + (p.fantasy?.avgPts ?? 0), 0)
    const projA = teamA.reduce((s, p) => s + (p.fantasy?.projectedPts ?? 0), 0)
    const projB = teamB.reduce((s, p) => s + (p.fantasy?.projectedPts ?? 0), 0)

    // From each team's perspective: what they receive minus what they give
    // Team A gives teamA, receives teamB
    const edgeA = valB - valA
    const edgeB = valA - valB
    const gradeA = letterFromScore(edgeA)
    const gradeB = letterFromScore(edgeB)

    return {
      teamA,
      teamB,
      valA: Math.round(valA * 10) / 10,
      valB: Math.round(valB * 10) / 10,
      avgA: Math.round(avgA * 10) / 10,
      avgB: Math.round(avgB * 10) / 10,
      projA: Math.round(projA * 10) / 10,
      projB: Math.round(projB * 10) / 10,
      gradeA,
      gradeB,
      edgeA: Math.round(edgeA * 10) / 10,
      edgeB: Math.round(edgeB * 10) / 10,
    }
  }, [selected, tradeSide])

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  if (error || !data) return <div className="p-6 text-rose-400">{error || 'No data'}</div>

  const week = data.meta.projectionWeek || data.meta.week

  const rows: { label: string; key: string; better?: 'high' | 'low'; format: (p: Player) => string }[] = [
    { label: 'Value', key: 'value', better: 'high', format: (p) => (p.valueGrade ?? p.grade).toFixed(1) },
    { label: 'Pos grade', key: 'grade', better: 'high', format: (p) => p.grade.toFixed(1) },
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
        <div className="overflow-x-auto -mx-4 px-4 mb-6">
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

      {/* Advice buttons */}
      {selected.length >= 2 && (
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setAdvice(advice === 'startSit' ? null : 'startSit')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
              advice === 'startSit'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-900 border-slate-700 text-emerald-400 active:bg-slate-800'
            }`}
          >
            Start / Sit
          </button>
          <button
            onClick={() => setAdvice(advice === 'trade' ? null : 'trade')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
              advice === 'trade'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-900 border-slate-700 text-sky-400 active:bg-slate-800'
            }`}
          >
            Trade advice
          </button>
        </div>
      )}

      {/* Start/Sit panel */}
      {advice === 'startSit' && startSitResult && (
        <div className="rounded-xl border border-emerald-800/50 bg-slate-900/80 p-4 mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
            Week {week} Start / Sit
          </h2>
          <div className="text-center py-2">
            <p className="text-xs text-slate-500 mb-1">Start</p>
            <p className="text-xl font-bold text-emerald-400">{startSitResult.winner.name}</p>
            <p className="text-sm text-slate-300 tabular-nums">
              {startSitResult.wProj.toFixed(1)} proj
              {startSitResult.margin > 0 && (
                <span className="text-slate-500"> · +{startSitResult.margin.toFixed(1)} vs next</span>
              )}
            </p>
          </div>
          <ol className="space-y-2">
            {startSitResult.ranked.map((p, i) => {
              const proj = p.fantasy?.projectedPts ?? 0
              const isBye = p.fantasy?.homeAway === 'bye'
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    i === 0 ? 'bg-emerald-950/50 border border-emerald-800/40' : 'bg-slate-950/50'
                  }`}
                >
                  <span className="w-6 text-center text-xs text-slate-500">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.position} · {p.team}
                      {isBye
                        ? ' · BYE'
                        : p.fantasy?.opponent
                          ? ` · ${p.fantasy.homeAway === 'home' ? 'vs' : '@'} ${p.fantasy.opponent}`
                          : ''}
                    </div>
                  </div>
                  <span
                    className={`tabular-nums font-semibold ${
                      isBye ? 'text-rose-400' : i === 0 ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {isBye ? '0.0' : proj.toFixed(1)}
                  </span>
                </li>
              )
            })}
          </ol>
          {startSitResult.notes.length > 0 && (
            <ul className="text-xs text-slate-400 space-y-1 pt-1 border-t border-slate-800">
              {startSitResult.notes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-600">
            Ranked by week {week} projected full-PPR points (matchup + injury adjusted).
          </p>
        </div>
      )}

      {/* Trade panel */}
      {advice === 'trade' && (
        <div className="rounded-xl border border-sky-800/50 bg-slate-900/80 p-4 mb-4 space-y-4">
          <h2 className="text-sm font-semibold text-sky-400 uppercase tracking-wide">
            Trade evaluator
          </h2>
          <p className="text-xs text-slate-400">
            Assign each player to <span className="text-emerald-400 font-medium">Team A</span> or{' '}
            <span className="text-sky-400 font-medium">Team B</span> (who is giving them away).
          </p>

          <ul className="space-y-2">
            {selected.map((p) => {
              const side = tradeSide[p.id] || 'none'
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-950/60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{p.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {p.position} · {(p.fantasy?.avgPts ?? 0).toFixed(1)} avg ·{' '}
                      {(p.valueGrade ?? p.grade).toFixed(0)} val
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(['A', 'B'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() =>
                          setTradeSide((prev) => ({
                            ...prev,
                            [p.id]: prev[p.id] === s ? 'none' : s,
                          }))
                        }
                        className={`w-9 h-9 rounded-lg text-sm font-bold border ${
                          side === s
                            ? s === 'A'
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-sky-600 border-sky-500 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>

          {tradeResult ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <TradeGradeCard
                title="Team A"
                color="emerald"
                letter={tradeResult.gradeA.letter}
                label={tradeResult.gradeA.label}
                gives={tradeResult.teamA.map((p) => p.name.split(' ').slice(-1)[0]).join(', ')}
                gets={tradeResult.teamB.map((p) => p.name.split(' ').slice(-1)[0]).join(', ')}
                valueDelta={tradeResult.edgeA}
                avgDelta={Math.round((tradeResult.avgB - tradeResult.avgA) * 10) / 10}
              />
              <TradeGradeCard
                title="Team B"
                color="sky"
                letter={tradeResult.gradeB.letter}
                label={tradeResult.gradeB.label}
                gives={tradeResult.teamB.map((p) => p.name.split(' ').slice(-1)[0]).join(', ')}
                gets={tradeResult.teamA.map((p) => p.name.split(' ').slice(-1)[0]).join(', ')}
                valueDelta={tradeResult.edgeB}
                avgDelta={Math.round((tradeResult.avgA - tradeResult.avgB) * 10) / 10}
              />
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-2">
              Assign at least one player to each side
            </p>
          )}

          <p className="text-[10px] text-slate-600">
            Grades use avg PPG × value grade. A+ = big win · C = even · F = major loss for that team.
          </p>
        </div>
      )}

      {selected.length === 0 && (
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p className="mb-2">Search above to add players</p>
          <p className="text-xs">Tip: open a player and tap “+ Compare”</p>
        </div>
      )}

      {selected.length === 1 && (
        <p className="text-xs text-slate-500 text-center mt-4">
          Add at least one more player for Start/Sit or Trade advice
        </p>
      )}
    </div>
  )
}

function TradeGradeCard({
  title,
  color,
  letter,
  label,
  gives,
  gets,
  valueDelta,
  avgDelta,
}: {
  title: string
  color: 'emerald' | 'sky'
  letter: string
  label: string
  gives: string
  gets: string
  valueDelta: number
  avgDelta: number
}) {
  const border = color === 'emerald' ? 'border-emerald-800/50' : 'border-sky-800/50'
  const text = color === 'emerald' ? 'text-emerald-400' : 'text-sky-400'
  return (
    <div className={`rounded-xl border ${border} bg-slate-950/60 p-3 text-center`}>
      <div className={`text-xs font-medium ${text} mb-1`}>{title}</div>
      <div className={`text-3xl font-black ${text}`}>{letter}</div>
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <div className="text-[10px] text-slate-500 text-left space-y-0.5">
        <div>
          <span className="text-slate-600">Gives:</span> {gives || '—'}
        </div>
        <div>
          <span className="text-slate-600">Gets:</span> {gets || '—'}
        </div>
        <div className="pt-1 tabular-nums">
          Value {valueDelta >= 0 ? '+' : ''}
          {valueDelta} · PPG {avgDelta >= 0 ? '+' : ''}
          {avgDelta}
        </div>
      </div>
    </div>
  )
}

function fmt(v?: number) {
  if (v == null || v === 0) return '—'
  return v.toLocaleString()
}

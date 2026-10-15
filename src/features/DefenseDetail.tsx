import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'

function pg(total: number | undefined, games: number): number | undefined {
  if (total == null) return undefined
  return Math.round((total / Math.max(games, 1)) * 10) / 10
}

type Row = { label: string; season: number | string; perGame?: number | string }

export default function DefenseDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  const defense = data?.defenses?.find((d) => d.id === id)

  if (!defense) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Defense not found</p>
        <Link to="/rankings" className="text-emerald-400 underline">
          ← Rankings
        </Link>
      </div>
    )
  }

  const s = (defense.stats || {}) as Record<string, number | undefined>
  const f = defense.fantasy
  const games = Math.max(1, s.gamesPlayed || f?.gamesPlayed || f?.games || 1)
  const week = data?.meta.projectionWeek || data?.meta.week

  const rows: Row[] = []
  const add = (label: string, season: number | undefined, showZero = true) => {
    if (season == null) return
    if (!showZero && season === 0) return
    rows.push({
      label,
      season: Number.isInteger(season) ? season : Math.round(season * 10) / 10,
      perGame: pg(season, games),
    })
  }

  rows.push({ label: 'Games played', season: games })
  add('Sacks', s.sacks, true)
  add('Interceptions', s.ints, true)
  add('Fumbles recovered', s.fumblesRec, true)
  add('Fumbles forced', s.fumblesForced, true)
  add('Defensive TDs', s.defTDs, true)
  add('Safeties', s.safeties, true)
  add('Kicks blocked', s.kicksBlocked, true)
  add('Points allowed', s.ptsAllowed, true)
  add('Yards allowed', s.yardsAllowed, true)

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <Link to="/rankings" className="text-sm text-emerald-400">
          ← Rankings
        </Link>
        <Link to={`/team/${defense.id}`} className="text-sm text-violet-400">
          Full team →
        </Link>
      </div>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
          DST
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{defense.name}</h1>
          <p className="text-slate-400">{defense.abbreviation} · Team Defense</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900 rounded-xl p-3 border border-violet-800/40">
          <div className="text-[10px] uppercase tracking-wide text-violet-400/90">RPS</div>
          <div className="text-2xl font-bold text-violet-300 tabular-nums">
            {(defense.rps ?? defense.grade).toFixed(1)}
          </div>
          <div className="text-xs text-slate-400">{defense.rpsLabel ?? defense.gradeLabel}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Pos grade</div>
          <div className="text-2xl font-bold text-sky-400 tabular-nums">
            {defense.grade.toFixed(1)}
          </div>
          <div className="text-xs text-slate-400">{defense.gradeLabel}</div>
          <div className="text-[10px] text-slate-500 mt-1">DST rank #{defense.rank}</div>
        </div>
      </div>

      {f && (
        <section className="mb-6 grid grid-cols-3 gap-2">
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg PPG</div>
            <div className="text-xl font-bold text-sky-400 tabular-nums">{f.avgPts.toFixed(1)}</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 border border-emerald-800/50 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Wk {week} Proj</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">
              {f.projectedPts.toFixed(1)}
            </div>
            <div className="text-[10px] text-slate-500">
              {f.homeAway === 'bye'
                ? 'BYE'
                : f.opponent
                  ? `${f.homeAway === 'home' ? 'vs' : '@'} ${f.opponent}`
                  : '—'}
            </div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Season</div>
            <div className="text-xl font-bold text-slate-200 tabular-nums">
              {f.seasonPts.toFixed(1)}
            </div>
          </div>
        </section>
      )}

      {f?.matchupNote && (
        <div className="mb-6 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-sm text-slate-300">
          <span className="text-slate-500">Matchup: </span>
          {f.matchupNote}
          {f.matchupMultiplier != null && f.homeAway !== 'bye' && (
            <span className="text-slate-500"> · ×{f.matchupMultiplier.toFixed(2)}</span>
          )}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-2">Season stats</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Season totals and per-game averages (÷ {games} games)
      </p>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
        <div className="grid grid-cols-3 gap-0 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span>Stat</span>
          <span className="text-right">Season</span>
          <span className="text-right">Per game</span>
        </div>
        <ul>
          {rows.map((row) => (
            <li
              key={row.label}
              className="grid grid-cols-3 gap-0 px-3 py-2.5 border-b border-slate-800/80 last:border-0 text-sm"
            >
              <span className="text-slate-400">{row.label}</span>
              <span className="text-right tabular-nums font-medium text-slate-100">
                {typeof row.season === 'number' ? row.season.toLocaleString() : row.season}
              </span>
              <span className="text-right tabular-nums text-slate-300">
                {row.perGame != null
                  ? typeof row.perGame === 'number'
                    ? row.perGame.toLocaleString()
                    : row.perGame
                  : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
        DST grades use league scoring (sacks, turnovers, TDs, PA/YA brackets). Weekly projection
        adjusts for opponent <strong className="text-slate-400">offense RPS</strong>.
      </p>
    </div>
  )
}

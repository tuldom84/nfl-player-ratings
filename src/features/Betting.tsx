import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { projectWeekGames } from '../lib/scoreProjection'

/** Nearest half-point (e.g. 5.9 → 6, 5.2 → 5, 5.25 → 5.5). */
function nearestHalf(n: number): number {
  return Math.round(n * 2) / 2
}

/**
 * Traditional betting line: favorite listed with a minus (points they give),
 * rounded to nearest half. Actual model margin in parentheses.
 * e.g. WSH -6(+5.9)
 */
function formatSpread(home: string, away: string, homeScore: number, awayScore: number): string {
  const margin = homeScore - awayScore
  if (Math.abs(margin) < 0.05) return 'PICK'
  const fav = margin > 0 ? home : away
  const actual = Math.abs(margin)
  const line = nearestHalf(actual)
  // Avoid -0
  const lineStr = line === 0 ? 'PICK' : `-${line % 1 === 0 ? line.toFixed(0) : line.toFixed(1)}`
  if (lineStr === 'PICK') return 'PICK'
  return `${fav} ${lineStr}(+${actual.toFixed(1)})`
}

export default function Betting() {
  const { data, loading, error } = useDataLake()

  const games = useMemo(() => (data ? projectWeekGames(data) : []), [data])
  const week = data?.meta.projectionWeek || data?.meta.week

  if (loading) {
    return <div className="p-6 text-slate-400">Loading projections…</div>
  }
  if (error) {
    return <div className="p-6 text-rose-400">{error}</div>
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold mb-1">Betting</h1>
      <p className="text-xs text-slate-500 mb-4">
        Week {week} projected scores · tap a game for full breakdown
      </p>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 mb-4 text-[11px] text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Model:</strong> team score = matchup-adjusted
        offensive TDs × 6 + FG × 3 + XP × 1 + DST safeties × 2, then{' '}
        <strong className="text-slate-300">+2.5 home-field</strong>, plus a small{' '}
        <strong className="text-slate-300">QB quality boost</strong>{' '}
        of (RPS/100) × (pass TD/g − INT/g), then{' '}
        <strong className="text-slate-300">net TO differential</strong>:{' '}
        (team TOD/g − opponent TOD/g) × 3.5 is added to that team and subtracted from the
        opponent. TOD/g = takeaways/g − giveaways/g. Injuries: Out/IR = 0, Questionable = 50%,
        Doubtful/day-to-day = 25%. Pass/rec TDs counted once (no double-count of QB pass TDs).
        Spreads shown as traditional favorite line (nearest ½) with model margin in parentheses.
      </div>

      {!games.length && (
        <p className="text-sm text-slate-500 text-center py-8">No games found for this week</p>
      )}

      <ul className="space-y-3">
        {games.map((g) => {
          const homeWin = g.winner === g.home
          const awayWin = g.winner === g.away
          const pick = g.winner === 'TIE' ? 'TIE' : g.winner
          const spreadLabel = formatSpread(g.home, g.away, g.homeScore, g.awayScore)
          return (
            <li key={`${g.away}@${g.home}`}>
              <Link
                to={`/betting/${g.away}/${g.home}`}
                className="block rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden active:border-emerald-700/50"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-950/40">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {g.away} @ {g.home}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      g.winner === 'TIE'
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-emerald-900/50 text-emerald-300'
                    }`}
                  >
                    Pick {pick}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3">
                  <div className="text-left">
                    <div
                      className={`text-sm font-semibold ${
                        awayWin ? 'text-emerald-300' : 'text-slate-200'
                      }`}
                    >
                      {g.away}
                    </div>
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      {g.awayTds.toFixed(1)} TD · {g.awayFg.toFixed(1)} FG · {g.awayXp.toFixed(1)}{' '}
                      XP · {g.awaySafeties.toFixed(2)} S
                    </div>
                  </div>

                  <div className="text-center min-w-[5.5rem]">
                    <div className="text-xl font-bold tabular-nums text-slate-100">
                      <span className={awayWin ? 'text-emerald-300' : ''}>
                        {g.awayScore.toFixed(1)}
                      </span>
                      <span className="text-slate-600 mx-1">–</span>
                      <span className={homeWin ? 'text-emerald-300' : ''}>
                        {g.homeScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      O/U {g.total.toFixed(1)}
                      {' · '}
                      <span className="text-slate-400">{spreadLabel}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-sm font-semibold ${
                        homeWin ? 'text-emerald-300' : 'text-slate-200'
                      }`}
                    >
                      {g.home}
                    </div>
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      {g.homeTds.toFixed(1)} TD · {g.homeFg.toFixed(1)} FG · {g.homeXp.toFixed(1)}{' '}
                      XP · {g.homeSafeties.toFixed(2)} S
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

import { useMemo } from 'react'
import { useDataLake } from '../hooks/useDataLake'
import { projectWeekGames } from '../lib/scoreProjection'

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
        Week {week} projected scores · winner pick from model
      </p>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 mb-4 text-[11px] text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Model:</strong> team score = matchup-adjusted
        offensive TDs × 6 + FG made × 3 + XP made × 1 + DST safeties × 2. TD rates scale
        with opponent DST points allowed vs league average. Pass/rec TDs counted once
        (QB pass + all rush). XP from kicker rate (capped near projected TDs).
      </div>

      {!games.length && (
        <p className="text-sm text-slate-500 text-center py-8">No games found for this week</p>
      )}

      <ul className="space-y-3">
        {games.map((g) => {
          const homeWin = g.winner === g.home
          const awayWin = g.winner === g.away
          const pick = g.winner === 'TIE' ? 'TIE' : g.winner
          return (
            <li
              key={`${g.away}@${g.home}`}
              className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden"
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
                    {g.spread !== 0 && (
                      <>
                        {' · '}
                        {g.home} {g.spread > 0 ? '+' : ''}
                        {g.spread.toFixed(1)}
                      </>
                    )}
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}

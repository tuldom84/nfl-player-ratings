import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { projectWeekGames } from '../lib/scoreProjection'
import type { GamePrediction } from '../lib/types'

/** Nearest half-point (e.g. 5.9 → 6, 5.2 → 5, 5.25 → 5.5). */
function nearestHalf(n: number): number {
  return Math.round(n * 2) / 2
}

type PickGrade = 'W' | 'L' | 'P'

interface TrackedPick {
  pick: string
  actual: string
  grade: PickGrade | null
}

function sideFromMargin(margin: number, home: string, away: string): string {
  if (Math.abs(margin) < 0.0001) return 'PUSH'
  return margin > 0 ? home : away
}

function gradePick(pick: string, actual: string): PickGrade | null {
  if (pick === 'PASS') return null
  if (pick === 'PUSH' || actual === 'PUSH') return 'P'
  return pick === actual ? 'W' : 'L'
}

function getAtsPick(game: GamePrediction): TrackedPick | null {
  if (
    game.marketHomeSpread == null ||
    game.actualHomeScore == null ||
    game.actualAwayScore == null
  ) {
    return null
  }
  const predictedMargin =
    game.predictedHomeScore - game.predictedAwayScore + game.marketHomeSpread
  const actualMargin = game.actualHomeScore - game.actualAwayScore + game.marketHomeSpread
  const pick = sideFromMargin(predictedMargin, game.home, game.away)
  const actual = sideFromMargin(actualMargin, game.home, game.away)
  return {
    pick: pick === 'PUSH' ? 'PASS' : pick,
    actual,
    grade: gradePick(pick === 'PUSH' ? 'PASS' : pick, actual),
  }
}

function getTotalPick(game: GamePrediction): TrackedPick | null {
  if (
    game.marketTotal == null ||
    game.actualHomeScore == null ||
    game.actualAwayScore == null
  ) {
    return null
  }
  const predictedTotal = game.predictedHomeScore + game.predictedAwayScore
  const actualTotal = game.actualHomeScore + game.actualAwayScore
  const pick =
    Math.abs(predictedTotal - game.marketTotal) < 0.0001
      ? 'PUSH'
      : predictedTotal > game.marketTotal
        ? 'OVER'
        : 'UNDER'
  const actual =
    Math.abs(actualTotal - game.marketTotal) < 0.0001
      ? 'PUSH'
      : actualTotal > game.marketTotal
        ? 'OVER'
        : 'UNDER'
  return {
    pick: pick === 'PUSH' ? 'PASS' : pick,
    actual,
    grade: gradePick(pick === 'PUSH' ? 'PASS' : pick, actual),
  }
}

function formatRecord(picks: TrackedPick[]): string {
  const graded = picks.filter((pick) => pick.grade != null)
  const wins = graded.filter((pick) => pick.grade === 'W').length
  const losses = graded.filter((pick) => pick.grade === 'L').length
  const pushes = graded.filter((pick) => pick.grade === 'P').length
  return `${wins}-${losses}-${pushes}`
}

function gradeColor(grade: PickGrade | null): string {
  if (grade === 'W') return 'text-emerald-300'
  if (grade === 'L') return 'text-rose-300'
  if (grade === 'P') return 'text-slate-400'
  return 'text-slate-500'
}

function formatMarketSpread(game: GamePrediction): string {
  const line = game.marketHomeSpread ?? 0
  if (Math.abs(line) < 0.0001) return 'PK'
  const favorite = line < 0 ? game.home : game.away
  const points = Math.abs(line)
  return `${favorite} -${points % 1 === 0 ? points.toFixed(0) : points.toFixed(1)}`
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
  const trackedGames = useMemo(
    () =>
      (data?.gamePredictions || [])
        .filter((game) => game.actualHomeScore != null && game.actualAwayScore != null)
        .sort(
          (a, b) =>
            b.season - a.season ||
            b.week - a.week ||
            b.predictedAt.localeCompare(a.predictedAt)
        ),
    [data]
  )
  const atsPicks = trackedGames.map(getAtsPick).filter((pick): pick is TrackedPick => pick != null)
  const totalPicks = trackedGames
    .map(getTotalPick)
    .filter((pick): pick is TrackedPick => pick != null)
  const averageScoreError =
    trackedGames.length > 0
      ? trackedGames.reduce(
          (sum, game) =>
            sum +
            (Math.abs(game.predictedHomeScore - game.actualHomeScore!) +
              Math.abs(game.predictedAwayScore - game.actualAwayScore!)) /
              2,
          0
        ) / trackedGames.length
      : null

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

      <details className="rounded-xl border border-slate-800 bg-slate-900/50 mb-4 text-[11px] text-slate-400 leading-relaxed">
        <summary className="cursor-pointer px-3 py-2.5 text-slate-300">
          <strong>Model:</strong> TD/FG/XP scoring with matchup, QB, and turnover adjustments
        </summary>
        <p className="border-t border-slate-800 px-3 py-2.5">
        Team score = matchup-adjusted
        offensive TDs × 6 + FG × 3 + XP × 1 + DST safeties × 2, then{' '}
        <strong className="text-slate-300">+2.5 home-field</strong>, plus a small{' '}
        <strong className="text-slate-300">QB quality boost</strong>{' '}
        of (RPS/100) × (pass TD/g − INT/g), then{' '}
        <strong className="text-slate-300">net TO differential</strong>:{' '}
        (team TOD/g − opponent TOD/g) × 1.75 is added to that team and subtracted from the
        opponent. TOD/g = takeaways/g − giveaways/g. Injury on TD/FG rates only:
        Questionable or day-to-day −10%, Doubtful −30%. Out, IR, and suspension are not
        penalized. RB/WR/TE TDs/g are multiplied by availability (games played / team
        games). The QB is not — only the 10% (questionable or day-to-day) or 30% (doubtful)
        injury cut. Pass/rec TDs counted once (no double-count of QB pass TDs).
        Spreads shown as traditional favorite line (nearest ½) with model margin in parentheses.
        </p>
      </details>

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

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <h2 className="text-lg font-semibold">Model tracking</h2>
        <p className="text-[11px] text-slate-500 mt-1 mb-3">
          Tuesday forecasts compared with final scores and ESPN market lines
        </p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-950/60 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Avg score error
            </div>
            <div className="text-sm font-semibold tabular-nums text-slate-200">
              {averageScoreError == null ? '—' : `${averageScoreError.toFixed(1)} pts`}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/60 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">ATS W-L-P</div>
            <div className="text-sm font-semibold tabular-nums text-slate-200">
              {formatRecord(atsPicks)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/60 p-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">O/U W-L-P</div>
            <div className="text-sm font-semibold tabular-nums text-slate-200">
              {formatRecord(totalPicks)}
            </div>
          </div>
        </div>

        {trackedGames.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-5">
            No completed forecasts yet. Tuesday syncs will add results after games finish.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800">
            {trackedGames.slice(0, 12).map((game) => {
              const ats = getAtsPick(game)
              const total = getTotalPick(game)
              const scoreError =
                (Math.abs(game.predictedHomeScore - game.actualHomeScore!) +
                  Math.abs(game.predictedAwayScore - game.actualAwayScore!)) /
                2
              return (
                <li key={`${game.season}-${game.eventId}`} className="py-3 first:pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      {game.away} @ {game.home}
                    </span>
                    <span className="text-slate-500">
                      {game.season} · Week {game.week}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] tabular-nums text-slate-400">
                    Pred {game.predictedAwayScore.toFixed(1)}–{game.predictedHomeScore.toFixed(1)}
                    {' · '}Final {game.actualAwayScore!.toFixed(0)}–{game.actualHomeScore!.toFixed(0)}
                    {' · '}Avg error {scoreError.toFixed(1)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                    {ats && (
                      <span>
                        ATS {formatMarketSpread(game)} · {ats.pick} / {ats.actual}
                        {' · '}
                        <strong className={gradeColor(ats.grade)}>{ats.grade || '—'}</strong>
                      </span>
                    )}
                    {total && (
                      <span>
                        O/U {game.marketTotal} · {total.pick} / {total.actual} (
                        {game.actualHomeScore! + game.actualAwayScore!} pts)
                        {' · '}
                        <strong className={gradeColor(total.grade)}>{total.grade || '—'}</strong>
                      </span>
                    )}
                    {!ats && !total && (
                      <span className="text-slate-500">No market lines were available</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

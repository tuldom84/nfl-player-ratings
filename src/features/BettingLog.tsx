import { useMemo, useState } from 'react'
import type { GamePrediction } from '../lib/types'
import {
  buildBettingLog,
  formatMarketSpread,
  formatModelSpread,
  formatRecord,
  formatWinPct,
  getAtsPick,
  getStraightUpPick,
  getTotalPick,
  isFinal,
  roundedPrediction,
  scoreError,
  type BettingSummary,
  type PickGrade,
  type SeasonLog,
} from '../lib/bettingLog'

function gradeColor(grade: PickGrade | null): string {
  if (grade === 'W') return 'text-emerald-300'
  if (grade === 'L') return 'text-rose-300'
  if (grade === 'P') return 'text-slate-400'
  return 'text-slate-500'
}

function SummaryGrid({ summary }: { summary: BettingSummary }) {
  const cells = [
    { label: 'ATS', line: summary.ats },
    { label: 'O/U', line: summary.totals },
    { label: 'Straight up', line: summary.straightUp },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg bg-slate-950/60 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{cell.label}</div>
          <div className="text-sm font-semibold tabular-nums text-slate-100">
            {formatRecord(cell.line)}
          </div>
          <div className="text-[10px] tabular-nums text-slate-500">{formatWinPct(cell.line)} win</div>
        </div>
      ))}
      <div className="rounded-lg bg-slate-950/60 px-2 py-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg score error</div>
        <div className="text-sm font-semibold tabular-nums text-slate-100">
          {summary.avgScoreError == null ? '—' : `${summary.avgScoreError.toFixed(1)} pts`}
        </div>
        <div className="text-[10px] tabular-nums text-slate-500">
          {summary.finals} final · {summary.pending} pending
        </div>
      </div>
    </div>
  )
}

function GameRow({ game }: { game: GamePrediction }) {
  const ats = getAtsPick(game)
  const total = getTotalPick(game)
  const straight = getStraightUpPick(game)
  const final = isFinal(game)
  const error = scoreError(game)
  const predicted = roundedPrediction(game)
  const rows = [
    ats && {
      label: `ATS ${formatMarketSpread(game)} · model ${formatModelSpread(game)}`,
      pick: ats.pick,
      actual: final ? ats.actual : null,
      grade: ats.grade,
    },
    total && {
      label: `O/U ${game.marketTotal}`,
      pick: total.pick,
      actual: final ? `${total.actual} (${game.actualHomeScore! + game.actualAwayScore!})` : null,
      grade: total.grade,
    },
    {
      label: 'Straight up',
      pick: straight.pick,
      actual: final ? straight.actual : null,
      grade: straight.grade,
    },
  ].filter((row): row is NonNullable<typeof row> => Boolean(row))

  return (
    <li className="py-3 first:pt-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          {game.away} @ {game.home}
        </span>
        <span className="text-slate-500 shrink-0">{final ? 'Final' : 'Pending'}</span>
      </div>
      <div className="mt-1 text-[11px] tabular-nums text-slate-400">
        Pred {predicted.away}–{predicted.home}
        <span className="text-slate-500">
          {' '}
          ({game.predictedAwayScore.toFixed(1)}–{game.predictedHomeScore.toFixed(1)})
        </span>
        {final ? (
          <>
            {' · '}Final {game.actualAwayScore!.toFixed(0)}–{game.actualHomeScore!.toFixed(0)}
            {' · '}Error {error!.toFixed(1)}
          </>
        ) : (
          <> · Final not in yet</>
        )}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[10px]">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-2">
            <span className="text-slate-400">
              {row.label} · {row.pick}
              {row.actual ? ` / ${row.actual}` : ''}
            </span>
            <strong className={gradeColor(row.grade)}>{row.grade || '—'}</strong>
          </li>
        ))}
      </ul>
    </li>
  )
}

export default function BettingLog({ predictions }: { predictions: GamePrediction[] }) {
  const log = useMemo(() => buildBettingLog(predictions), [predictions])
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)

  const activeSeason: SeasonLog | undefined =
    log.seasons.find((item) => item.season === season) || log.seasons[0]
  const activeWeek =
    activeSeason?.weeks.find((item) => item.week === week) || activeSeason?.weeks[0]

  return (
    <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <h2 className="text-lg font-semibold">Betting log</h2>
      <p className="text-[11px] text-slate-500 mt-1 mb-3">
        Every Tuesday forecast, by week. Spread, total, and straight-up picks use each predicted
        score rounded to the nearest point (20.5–23.2 plays as 21–23). A push we called counts
        as a win. Any other push is a draw.
      </p>

      <h3 className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">All-time</h3>
      <SummaryGrid summary={log.allTime} />

      <h3 className="text-[11px] uppercase tracking-wide text-slate-400 mt-4 mb-2">By season</h3>
      {log.seasons.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">
          No forecasts saved yet. The Tuesday sync stores each week, then fills finals the next week.
        </p>
      ) : (
        <ul className="space-y-2">
          {log.seasons.map((item) => (
            <li key={item.season} className="rounded-lg border border-slate-800 px-2 py-2">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-100">{item.season}</span>
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {item.weeks.length} week{item.weeks.length === 1 ? '' : 's'} · {item.summary.finals}{' '}
                  final
                </span>
              </div>
              <SummaryGrid summary={item.summary} />
            </li>
          ))}
        </ul>
      )}

      {activeSeason && activeWeek && (
        <div className="mt-4">
          <h3 className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Week results</h3>
          {log.seasons.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {log.seasons.map((item) => {
                const on = item.season === activeSeason.season
                return (
                  <button
                    key={item.season}
                    type="button"
                    onClick={() => {
                      setSeason(item.season)
                      setWeek(null)
                    }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                      on ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.season}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {[...activeSeason.weeks].reverse().map((item) => {
              const on = item.week === activeWeek.week
              return (
                <button
                  key={item.week}
                  type="button"
                  onClick={() => {
                    setSeason(activeSeason.season)
                    setWeek(item.week)
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums ${
                    on ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  W{item.week}
                  {item.summary.pending > 0 ? ' · open' : ''}
                </button>
              )
            })}
          </div>

          <div className="mb-2 text-xs text-slate-400">
            {activeSeason.season} week {activeWeek.week} · ATS {formatRecord(activeWeek.summary.ats)}{' '}
            · O/U {formatRecord(activeWeek.summary.totals)} · SU{' '}
            {formatRecord(activeWeek.summary.straightUp)}
          </div>
          <ul className="divide-y divide-slate-800">
            {activeWeek.games.map((game) => (
              <GameRow key={`${game.season}-${game.eventId}`} game={game} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

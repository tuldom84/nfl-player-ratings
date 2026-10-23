import { useEffect, useMemo, useState } from 'react'
import type { Position } from '../lib/types'
import {
  fetchPlayerGameLog,
  fetchDstGameLog,
  fetchGameBoxScore,
  type GameBoxScore,
  type GameLogRow,
} from '../lib/gameLog'
import { loadScoringSettings } from '../lib/scoringSettings'

/** Season-only DST counting not available on ESPN team boxscore weeks. */
export type DstSeasonExtras = {
  fumblesForced?: number
  kicksBlocked?: number
  onePtSafeties?: number
  twoPtReturns?: number
}

type BoxScorePanelProps = {
  boxScore?: GameBoxScore
  loading: boolean
  error?: string
}

function BoxScorePanel({ boxScore, loading, error }: BoxScorePanelProps) {
  if (loading) {
    return <p className="px-3 py-4 text-sm text-slate-400 text-center">Loading box score…</p>
  }
  if (error) {
    return <p className="px-3 py-4 text-sm text-rose-400 text-center">{error}</p>
  }
  if (!boxScore) return null

  return (
    <div className="col-span-3 border-t border-slate-800 bg-slate-950/50 px-3 py-3">
      {boxScore.teams.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {boxScore.teams.map((team, idx) => (
            <section key={`${team.name}-${idx}`} className="min-w-0">
              <h4 className="mb-2 text-xs font-semibold text-slate-200">{team.name}</h4>
              <dl className="space-y-1">
                {team.statistics.map((stat, statIdx) => (
                  <div
                    key={`${stat.name}-${statIdx}`}
                    className="flex justify-between gap-2 text-[11px]"
                  >
                    <dt className="text-slate-500">{stat.name}</dt>
                    <dd className="text-right tabular-nums text-slate-300">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
      {boxScore.playerGroups.map((group, groupIdx) => (
        <section key={`${group.teamName}-${groupIdx}`} className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-slate-200">{group.teamName}</h4>
          {group.sections.map((section, sectionIdx) => (
            <div key={`${section.name}-${sectionIdx}`} className="mb-3 last:mb-0">
              <h5 className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                {section.name}
              </h5>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-[11px]">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pr-3 text-left font-normal">Player</th>
                      {section.headers.map((header, idx) => (
                        <th key={`${header}-${idx}`} className="px-1 text-right font-normal">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.players.map((player, playerIdx) => (
                      <tr key={`${player.name}-${playerIdx}`} className="text-slate-300">
                        <td className="pr-3 py-0.5">{player.name}</td>
                        {player.stats.map((stat, idx) => (
                          <td key={idx} className="px-1 py-0.5 text-right tabular-nums">
                            {stat}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
      {boxScore.teams.length === 0 && boxScore.playerGroups.length === 0 && (
        <p className="text-center text-sm text-slate-500">No box score details available</p>
      )}
    </div>
  )
}

type Props =
  | { kind: 'player'; athleteId: string; position: Position }
  | { kind: 'dst'; teamId: string; seasonExtras?: DstSeasonExtras }

function scoreDstExtras(extras: DstSeasonExtras | undefined): number {
  if (!extras) return 0
  const d = loadScoringSettings().dst
  let pts = 0
  pts += (extras.fumblesForced || 0) * d.fumForced
  pts += (extras.kicksBlocked || 0) * d.blockedKick
  pts += (extras.onePtSafeties || 0) * d.onePtSafety
  pts += (extras.twoPtReturns || 0) * d.twoPtReturn
  return Math.round(pts * 10) / 10
}

export function GameLogSection(props: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<GameLogRow[] | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [boxScores, setBoxScores] = useState<Record<string, GameBoxScore>>({})
  const [loadingBoxScoreId, setLoadingBoxScoreId] = useState<string | null>(null)
  const [boxScoreErrors, setBoxScoreErrors] = useState<Record<string, string>>({})

  const extrasPts = useMemo(
    () => (props.kind === 'dst' ? scoreDstExtras(props.seasonExtras) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.kind === 'dst' ? JSON.stringify(props.seasonExtras) : '']
  )

  useEffect(() => {
    if (!open) return
    if (rows != null) return
    if (loading) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const run =
      props.kind === 'player'
        ? fetchPlayerGameLog(props.athleteId, props.position)
        : fetchDstGameLog(props.teamId)

    run
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load game log')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    setRows(null)
    setError(null)
    setSelectedEventId(null)
    setBoxScores({})
    setBoxScoreErrors({})
  }, [props.kind === 'player' ? props.athleteId : props.teamId])

  useEffect(() => {
    if (!selectedEventId || boxScores[selectedEventId]) return

    let cancelled = false
    setLoadingBoxScoreId(selectedEventId)
    setBoxScoreErrors((current) => {
      const next = { ...current }
      delete next[selectedEventId]
      return next
    })

    fetchGameBoxScore(selectedEventId)
      .then((boxScore) => {
        if (!cancelled) {
          setBoxScores((current) => ({ ...current, [selectedEventId]: boxScore }))
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setBoxScoreErrors((current) => ({
            ...current,
            [selectedEventId]: e instanceof Error ? e.message : 'Failed to load box score',
          }))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBoxScoreId(null)
      })

    return () => {
      cancelled = true
    }
  }, [selectedEventId, boxScores])

  const weeklyTotal =
    rows?.reduce((sum, r) => sum + (Number.isFinite(r.fantasyPts) ? r.fantasyPts : 0), 0) ?? 0
  const total = Math.round((weeklyTotal + extrasPts) * 10) / 10

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-left active:bg-slate-800"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-emerald-400">
          {open ? 'Hide game log' : 'Game log'}
        </span>
        <span className="text-[11px] text-slate-500">
          {open ? '▲' : '▼'} week · opponent · fantasy pts
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-800 overflow-hidden">
          {loading && !rows && (
            <p className="px-3 py-4 text-sm text-slate-400 text-center">Loading game log…</p>
          )}
          {error && !loading && !rows && (
            <p className="px-3 py-4 text-sm text-rose-400 text-center">{error}</p>
          )}
          {!loading && !error && rows && rows.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-500 text-center">No games played yet</p>
          )}
          {rows && rows.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-0 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
                <span>Week</span>
                <span className="text-center">Opponent</span>
                <span className="text-right">Fantasy pts</span>
              </div>
              <ul>
                {rows.map((r, idx) => (
                  <li
                    key={`${r.week}-${r.opponent}-${idx}`}
                    className="border-b border-slate-800/80 last:border-0"
                  >
                    <div className="grid grid-cols-3 gap-0 px-3 py-2.5 text-sm">
                      <span className="text-slate-400 tabular-nums">W{r.week}</span>
                      <span className="text-center">
                        {r.eventId ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedEventId((selected) =>
                                selected === r.eventId ? null : (r.eventId ?? null)
                              )
                            }
                            className="text-slate-200 underline decoration-slate-600 underline-offset-2 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                            aria-expanded={selectedEventId === r.eventId}
                          >
                            {r.homeAway === 'away' ? '@' : r.homeAway === 'home' ? 'vs' : ''}
                            {r.homeAway !== 'neutral' ? ' ' : ''}
                            {r.opponent}
                            {r.result ? (
                              <span className="text-slate-500 text-xs ml-1">{r.result}</span>
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-slate-200">
                            {r.homeAway === 'away' ? '@' : r.homeAway === 'home' ? 'vs' : ''}
                            {r.homeAway !== 'neutral' ? ' ' : ''}
                            {r.opponent}
                            {r.result ? (
                              <span className="text-slate-500 text-xs ml-1">{r.result}</span>
                            ) : null}
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-right tabular-nums font-medium ${
                          r.fantasyPts >= 20
                            ? 'text-emerald-400'
                            : r.fantasyPts >= 12
                              ? 'text-sky-300'
                              : r.fantasyPts < 5
                                ? 'text-rose-400/90'
                                : 'text-slate-100'
                        }`}
                      >
                        {r.fantasyPts.toFixed(1)}
                      </span>
                    </div>
                    {selectedEventId === r.eventId && (
                      <BoxScorePanel
                        boxScore={boxScores[r.eventId]}
                        loading={loadingBoxScoreId === r.eventId}
                        error={boxScoreErrors[r.eventId]}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {extrasPts !== 0 && (
                <div className="grid grid-cols-3 gap-0 px-3 py-2 border-t border-slate-800/80 text-sm">
                  <span className="text-slate-500 col-span-2">
                    FF / blocks / returns
                    <span className="block text-[10px] text-slate-600">
                      Season stats not on weekly ESPN team box score
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-slate-300">
                    {extrasPts.toFixed(1)}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-0 px-3 py-2.5 bg-slate-900/60 border-t border-slate-800 text-sm">
                <span className="text-slate-500">Total</span>
                <span />
                <span className="text-right tabular-nums font-semibold text-slate-100">
                  {total.toFixed(1)}
                </span>
              </div>
              <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800/80">
                Points use your current scoring settings
                {props.kind === 'dst'
                  ? '. Weekly lines = live box score (PA/YA, sacks, INT, FR, TD). Total adds season FF/blocks so it matches season points.'
                  : '. Loaded on demand from ESPN.'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

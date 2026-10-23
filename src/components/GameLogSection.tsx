import { useEffect, useMemo, useState } from 'react'
import type { Position } from '../lib/types'
import {
  fetchPlayerGameLog,
  fetchDstGameLog,
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

type Props =
  | { kind: 'player'; athleteId: string; position: Position }
  | { kind: 'dst'; teamId: string; seasonExtras?: DstSeasonExtras }

function scoreDstExtras(extras: DstSeasonExtras | undefined): number {
  if (!extras) return 0
  const d = loadScoringSettings().dst
  let pts = 0
  pts += (extras.fumblesForced || 0) * d.fumForced
  pts += (extras.kicksBlocked || 0) * d.blockedKick
  pts += (extras.onePtSafeties || 0) * (d.onePtSafety ?? 2)
  pts += (extras.twoPtReturns || 0) * (d.twoPtReturn ?? 2)
  return Math.round(pts * 10) / 10
}

export function GameLogSection(props: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<GameLogRow[] | null>(null)

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
  }, [props.kind === 'player' ? props.athleteId : props.teamId])

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
                    className="grid grid-cols-3 gap-0 px-3 py-2.5 border-b border-slate-800/80 last:border-0 text-sm"
                  >
                    <span className="text-slate-400 tabular-nums">W{r.week}</span>
                    <span className="text-center text-slate-200">
                      {r.homeAway === 'away' ? '@' : r.homeAway === 'home' ? 'vs' : ''}
                      {r.homeAway !== 'neutral' ? ' ' : ''}
                      {r.opponent}
                      {r.result ? (
                        <span className="text-slate-500 text-xs ml-1">{r.result}</span>
                      ) : null}
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

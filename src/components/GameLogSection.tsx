import { useEffect, useState } from 'react'
import type { Position } from '../lib/types'
import {
  fetchPlayerGameLog,
  fetchDstGameLog,
  type GameLogRow,
} from '../lib/gameLog'

type Props =
  | { kind: 'player'; athleteId: string; position: Position }
  | { kind: 'dst'; teamId: string }

export function GameLogSection(props: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<GameLogRow[] | null>(null)

  useEffect(() => {
    if (!open) return
    // Already loaded for this open session
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

  // Reset cache when switching player/team so reopen fetches correct log
  useEffect(() => {
    setRows(null)
    setError(null)
  }, [props.kind === 'player' ? props.athleteId : props.teamId])

  const total =
    rows?.reduce((sum, r) => sum + (Number.isFinite(r.fantasyPts) ? r.fantasyPts : 0), 0) ?? 0

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
                  ? ' (PA/YA brackets + sacks/INT/FR/TD applied per game from live ESPN box scores).'
                  : '. Loaded on demand from ESPN.'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

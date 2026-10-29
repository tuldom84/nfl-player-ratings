import { Link } from 'react-router-dom'
import type { DataLake } from '../lib/types'

export type NextMatchupInfo = {
  opponent: string
  homeAway: 'home' | 'away' | 'bye'
  /** ESPN team id for opponent (for /team/:id) */
  opponentTeamId?: string
  /** Path to betting matchup, e.g. /betting/BAL/CLE */
  bettingPath?: string
  label: string
}

/** Resolve next-week matchup for a team abbreviation from the data lake. */
export function resolveNextMatchup(
  data: DataLake | null | undefined,
  teamAbbr: string | undefined
): NextMatchupInfo | null {
  if (!data || !teamAbbr) return null

  // Prefer DST fantasy (always present for active teams), fall back to any rostered player
  const dst = data.defenses?.find((d) => d.abbreviation === teamAbbr)
  const fromDst = dst?.fantasy
  const fromPlayer = data.players.find(
    (p) => p.team === teamAbbr && p.fantasy?.opponent && p.fantasy.homeAway !== 'bye'
  )?.fantasy

  const f = fromDst?.opponent ? fromDst : fromPlayer
  if (!f) return null

  if (f.homeAway === 'bye' || !f.opponent || f.opponent === 'BYE') {
    return {
      opponent: 'BYE',
      homeAway: 'bye',
      label: 'BYE week',
    }
  }

  const homeAway = f.homeAway === 'home' ? 'home' : 'away'
  const opponent = f.opponent
  const oppOff = data.teamOffenses?.find((o) => o.abbreviation === opponent)
  const oppDef = data.defenses?.find((d) => d.abbreviation === opponent)
  const opponentTeamId = oppOff?.id || oppDef?.id

  const bettingPath =
    homeAway === 'home'
      ? `/betting/${opponent}/${teamAbbr}`
      : `/betting/${teamAbbr}/${opponent}`

  const label = homeAway === 'home' ? `vs ${opponent}` : `@ ${opponent}`

  return {
    opponent,
    homeAway,
    opponentTeamId,
    bettingPath,
    label,
  }
}

/** Compact next-matchup card used on player / team / offense / DST detail pages. */
export function NextMatchupCard({
  matchup,
  week,
  showBetting = true,
}: {
  matchup: NextMatchupInfo | null
  week?: number
  /** Team / offense / DST pages link to betting; player page can too */
  showBetting?: boolean
}) {
  if (!matchup) return null

  return (
    <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
            {week != null ? `Week ${week} matchup` : 'Next matchup'}
          </div>
          {matchup.homeAway === 'bye' ? (
            <div className="text-sm font-medium text-slate-300">BYE</div>
          ) : matchup.opponentTeamId ? (
            <Link
              to={`/team/${matchup.opponentTeamId}`}
              className="text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              {matchup.label}
              <span className="text-slate-500 font-normal"> · power profile →</span>
            </Link>
          ) : (
            <div className="text-sm font-medium text-slate-300">{matchup.label}</div>
          )}
        </div>
        {showBetting && matchup.bettingPath && matchup.homeAway !== 'bye' && (
          <Link
            to={matchup.bettingPath}
            className="shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-amber-300/90 hover:text-amber-200"
          >
            Betting →
          </Link>
        )}
      </div>
    </div>
  )
}

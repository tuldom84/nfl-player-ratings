/**
 * NFL game score projections for the Betting tab.
 *
 * Team score =
 *   (sum of matchup-adjusted offensive TDs) × 6
 *   + (projected kicker FG made) × 3
 *
 * TD counting avoids double-counting pass/rec TDs:
 *   QB: pass TDs + rush TDs
 *   RB/WR/TE: rush TDs only (receiving TDs = QB pass TDs)
 *
 * TD rates are adjusted by opponent DST points-allowed vs league average
 * (same idea as fantasy matchup projections).
 */

import type { DataLake, Player, TeamDefense } from './types'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
const pg = (total: number, games: number) => total / Math.max(games, 1)

function injuryFactor(status?: string): number {
  if (!status || status === 'Active' || status === 'Unknown') return 1
  if (status === 'Questionable') return 0.85
  if (status === 'Doubtful') return 0.4
  if (status === 'Out' || status === 'Injured Reserve' || status === 'Suspension') return 0
  return 1
}

function leaguePaPg(defenses: TeamDefense[]): number {
  let sum = 0
  let n = 0
  for (const d of defenses) {
    const s = d.stats || {}
    const g = Math.max(1, s.gamesPlayed || s.gameLogs?.length || 1)
    const p = safe(s.ptsAllowed)
    if (p <= 0) continue
    sum += p / g
    n++
  }
  return n ? sum / n : 22
}

function oppPaFactor(opp: TeamDefense | undefined, leaguePa: number): number {
  if (!opp?.stats) return 1
  const g = Math.max(1, opp.stats.gamesPlayed || opp.stats.gameLogs?.length || 1)
  const pa = safe(opp.stats.ptsAllowed) / g
  return clamp(pa / Math.max(leaguePa, 1), 0.7, 1.35)
}

/** Matchup-adjusted TDs that count toward team score (no pass/rec double count). */
function playerTeamTds(
  p: Player,
  tdFactor: number
): number {
  const f = p.fantasy
  const inj = injuryFactor(f?.injuryStatus)
  if (inj === 0) return 0
  if (f?.homeAway === 'bye') return 0

  const st = p.stats || {}
  const g = Math.max(1, st.gamesPlayed || f?.gamesPlayed || f?.games || 1)
  const pos = p.position

  if (pos === 'QB') {
    const pass = pg(safe(st.passTDs), g) * tdFactor
    const rush = pg(safe(st.rushTDs), g) * tdFactor
    return (pass + rush) * inj
  }
  if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    // Rush only — receiving TDs are already in QB pass TDs for team score
    return pg(safe(st.rushTDs), g) * tdFactor * inj
  }
  return 0
}

/** Projected field goals made this week for a kicker. */
function playerProjectedFg(p: Player, yaFactor: number): number {
  if (p.position !== 'K') return 0
  const f = p.fantasy
  const inj = injuryFactor(f?.injuryStatus)
  if (inj === 0) return 0
  if (f?.homeAway === 'bye') return 0

  const st = p.stats || {}
  const g = Math.max(1, st.gamesPlayed || f?.gamesPlayed || f?.games || 1)
  const fg =
    safe(st.fgMade1_19) +
      safe(st.fgMade20_29) +
      safe(st.fgMade30_39) +
      safe(st.fgMade40_49) +
      safe(st.fgMade50_59) +
      safe(st.fgMade60) || safe(st.fgMade)
  return pg(fg, g) * clamp(yaFactor, 0.85, 1.15) * inj
}

function leagueYaPg(defenses: TeamDefense[]): number {
  let sum = 0
  let n = 0
  for (const d of defenses) {
    const s = d.stats || {}
    const g = Math.max(1, s.gamesPlayed || s.gameLogs?.length || 1)
    const y = safe(s.yardsAllowed)
    if (y <= 0) continue
    sum += y / g
    n++
  }
  return n ? sum / n : 340
}

function oppYaFactor(opp: TeamDefense | undefined, leagueYa: number): number {
  if (!opp?.stats) return 1
  const g = Math.max(1, opp.stats.gamesPlayed || opp.stats.gameLogs?.length || 1)
  const ya = safe(opp.stats.yardsAllowed) / g
  return clamp(ya / Math.max(leagueYa, 1), 0.85, 1.15)
}

export type ProjectedGame = {
  home: string
  away: string
  homeScore: number
  awayScore: number
  homeTds: number
  awayTds: number
  homeFg: number
  awayFg: number
  winner: string
  spread: number // home - away (negative = home favorite)
  total: number
}

function teamScoreFromPlayers(
  teamAbbr: string,
  players: Player[],
  dstByAbbr: Map<string, TeamDefense>,
  leaguePa: number,
  leagueYa: number
): { score: number; tds: number; fg: number } {
  const roster = players.filter(
    (p) => p.team === teamAbbr && p.fantasy?.homeAway !== 'bye'
  )
  if (!roster.length) return { score: 0, tds: 0, fg: 0 }

  const oppAbbr = roster.find((p) => p.fantasy?.opponent)?.fantasy?.opponent
  const oppDst = oppAbbr && oppAbbr !== 'BYE' ? dstByAbbr.get(oppAbbr) : undefined
  const tdF = oppPaFactor(oppDst, leaguePa)
  const yaF = oppYaFactor(oppDst, leagueYa)

  let tds = 0
  for (const p of roster) {
    if (p.position === 'K' || p.position === 'DST') continue
    tds += playerTeamTds(p, tdF)
  }

  // Best active kicker by season FG total
  const kickers = roster.filter((p) => p.position === 'K')
  let bestFg = 0
  let bestMade = -1
  for (const k of kickers) {
    const st = k.stats || {}
    const made =
      safe(st.fgMade1_19) +
        safe(st.fgMade20_29) +
        safe(st.fgMade30_39) +
        safe(st.fgMade40_49) +
        safe(st.fgMade50_59) +
        safe(st.fgMade60) || safe(st.fgMade)
    if (made >= bestMade) {
      bestMade = made
      bestFg = playerProjectedFg(k, yaF)
    }
  }

  const score = Math.round((tds * 6 + bestFg * 3) * 10) / 10
  return {
    score,
    tds: Math.round(tds * 100) / 100,
    fg: Math.round(bestFg * 100) / 100,
  }
}

/**
 * Build projected scores for every game implied by current week matchups.
 * Runs client-side when the data lake is loaded (no extra API).
 */
export function projectWeekGames(lake: DataLake): ProjectedGame[] {
  const players = lake.players || []
  const defenses = lake.defenses || []
  const dstByAbbr = new Map(defenses.map((d) => [d.abbreviation, d]))
  const leaguePa = leaguePaPg(defenses)
  const leagueYa = leagueYaPg(defenses)

  // Unique home/away pairs from player fantasy matchups
  const games = new Map<string, { home: string; away: string }>()
  for (const p of players) {
    const f = p.fantasy
    if (!f?.opponent || f.homeAway === 'bye' || f.opponent === 'BYE') continue
    if (f.homeAway !== 'home' && f.homeAway !== 'away') continue
    const home = f.homeAway === 'home' ? p.team : f.opponent
    const away = f.homeAway === 'home' ? f.opponent : p.team
    const key = `${away}@${home}`
    if (!games.has(key)) games.set(key, { home, away })
  }

  const out: ProjectedGame[] = []
  for (const { home, away } of games.values()) {
    const h = teamScoreFromPlayers(home, players, dstByAbbr, leaguePa, leagueYa)
    const a = teamScoreFromPlayers(away, players, dstByAbbr, leaguePa, leagueYa)
    const homeScore = h.score
    const awayScore = a.score
    const winner =
      homeScore > awayScore ? home : awayScore > homeScore ? away : 'TIE'
    const spread = Math.round((homeScore - awayScore) * 10) / 10
    const total = Math.round((homeScore + awayScore) * 10) / 10
    out.push({
      home,
      away,
      homeScore,
      awayScore,
      homeTds: h.tds,
      awayTds: a.tds,
      homeFg: h.fg,
      awayFg: a.fg,
      winner,
      spread,
      total,
    })
  }

  // Sort by total (high scoring first), then spread magnitude
  out.sort((x, y) => y.total - x.total || Math.abs(y.spread) - Math.abs(x.spread))
  return out
}

/**
 * NFL game score projections for the Betting tab.
 *
 * Team score =
 *   (matchup-adjusted offensive TDs) × 6
 *   + (projected kicker FG made) × 3
 *   + (projected XP made) × 1
 *   + (projected DST safeties) × 2
 *   + home-field advantage (+2.5 for home team)
 *
 * Injury weights (betting):
 *   Out / IR / Suspension → 0
 *   Questionable → 50%
 *   Doubtful / day-to-day → 25%
 *   Active → 100%
 */

import type { DataLake, Player, TeamDefense } from './types'

export const HOME_FIELD_ADVANTAGE = 2.5

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
const pg = (total: number, games: number) => total / Math.max(games, 1)
const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10

function injuryFactor(status?: string, detail?: string): number {
  const d = (detail || '').toLowerCase()
  const dayToDay =
    /\bday[-\s]?to[-\s]?day\b/.test(d) ||
    /\bd2d\b/.test(d) ||
    /\bdtd\b/.test(d)

  if (status === 'Out' || status === 'Injured Reserve' || status === 'Suspension') return 0
  if (status === 'Doubtful' || dayToDay) return 0.25
  if (status === 'Questionable') return 0.5
  if (!status || status === 'Active' || status === 'Unknown') return 1
  return 1
}

function playerInj(p: Player): number {
  return injuryFactor(p.fantasy?.injuryStatus, p.fantasy?.injuryDetail)
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

function oppPaFactor(opp: TeamDefense | undefined, leaguePa: number): number {
  if (!opp?.stats) return 1
  const g = Math.max(1, opp.stats.gamesPlayed || opp.stats.gameLogs?.length || 1)
  const pa = safe(opp.stats.ptsAllowed) / g
  return clamp(pa / Math.max(leaguePa, 1), 0.7, 1.35)
}

function oppYaFactor(opp: TeamDefense | undefined, leagueYa: number): number {
  if (!opp?.stats) return 1
  const g = Math.max(1, opp.stats.gamesPlayed || opp.stats.gameLogs?.length || 1)
  const ya = safe(opp.stats.yardsAllowed) / g
  return clamp(ya / Math.max(leagueYa, 1), 0.85, 1.15)
}

export type TdContributor = {
  id: string
  name: string
  position: string
  tds: number
  injuryWeight: number
  injuryStatus?: string
}

export type TeamScoreBreakdown = {
  abbr: string
  tds: number
  tdPts: number
  fg: number
  fgPts: number
  xp: number
  xpPts: number
  safeties: number
  safetyPts: number
  baseScore: number
  homeField: number
  finalScore: number
  tdFactor: number
  yaFactor: number
  oppAbbr?: string
  contributors: TdContributor[]
  kickerName?: string
}

function teamBreakdown(
  teamAbbr: string,
  isHome: boolean,
  players: Player[],
  dstByAbbr: Map<string, TeamDefense>,
  leaguePa: number,
  leagueYa: number
): TeamScoreBreakdown {
  const empty: TeamScoreBreakdown = {
    abbr: teamAbbr,
    tds: 0,
    tdPts: 0,
    fg: 0,
    fgPts: 0,
    xp: 0,
    xpPts: 0,
    safeties: 0,
    safetyPts: 0,
    baseScore: 0,
    homeField: isHome ? HOME_FIELD_ADVANTAGE : 0,
    finalScore: isHome ? HOME_FIELD_ADVANTAGE : 0,
    tdFactor: 1,
    yaFactor: 1,
    contributors: [],
  }

  const roster = players.filter(
    (p) => p.team === teamAbbr && p.fantasy?.homeAway !== 'bye'
  )
  if (!roster.length) return empty

  const oppAbbr = roster.find((p) => p.fantasy?.opponent)?.fantasy?.opponent
  const oppDst = oppAbbr && oppAbbr !== 'BYE' ? dstByAbbr.get(oppAbbr) : undefined
  const tdF = oppPaFactor(oppDst, leaguePa)
  const yaF = oppYaFactor(oppDst, leagueYa)

  const contributors: TdContributor[] = []
  let tds = 0
  for (const p of roster) {
    if (p.position === 'K' || p.position === 'DST') continue
    const f = p.fantasy
    const inj = playerInj(p)
    if (inj === 0 || f?.homeAway === 'bye') continue

    const st = p.stats || {}
    const g = Math.max(1, st.gamesPlayed || f?.gamesPlayed || f?.games || 1)
    let playerTds = 0
    if (p.position === 'QB') {
      playerTds = (pg(safe(st.passTDs), g) + pg(safe(st.rushTDs), g)) * tdF * inj
    } else if (p.position === 'RB' || p.position === 'WR' || p.position === 'TE') {
      playerTds = pg(safe(st.rushTDs), g) * tdF * inj
    }
    if (playerTds <= 0.001) continue
    tds += playerTds
    contributors.push({
      id: p.id,
      name: p.name,
      position: p.position,
      tds: r2(playerTds),
      injuryWeight: inj,
      injuryStatus: f?.injuryStatus,
    })
  }
  contributors.sort((a, b) => b.tds - a.tds)

  const kickers = roster.filter((p) => p.position === 'K')
  let bestFg = 0
  let bestXp = 0
  let bestMade = -1
  let kickerName: string | undefined
  for (const k of kickers) {
    const st = k.stats || {}
    const made =
      safe(st.fgMade1_19) +
        safe(st.fgMade20_29) +
        safe(st.fgMade30_39) +
        safe(st.fgMade40_49) +
        safe(st.fgMade50_59) +
        safe(st.fgMade60) || safe(st.fgMade)
    if (made < bestMade) continue
    bestMade = made
    const inj = playerInj(k)
    if (inj === 0 || k.fantasy?.homeAway === 'bye') {
      bestFg = 0
      bestXp = 0
      kickerName = k.name
      continue
    }
    const g = Math.max(1, st.gamesPlayed || k.fantasy?.gamesPlayed || k.fantasy?.games || 1)
    const fg =
      safe(st.fgMade1_19) +
        safe(st.fgMade20_29) +
        safe(st.fgMade30_39) +
        safe(st.fgMade40_49) +
        safe(st.fgMade50_59) +
        safe(st.fgMade60) || safe(st.fgMade)
    bestFg = pg(fg, g) * clamp(yaF, 0.85, 1.15) * inj
    const xpRate = pg(safe(st.xpMade), g) * inj
    bestXp = tds > 0 ? Math.min(xpRate, tds * 1.05) : xpRate
    kickerName = k.name
  }
  if (bestXp <= 0 && tds > 0) bestXp = tds * 0.95

  const d = dstByAbbr.get(teamAbbr)
  const dg = Math.max(1, d?.stats?.gamesPlayed || d?.stats?.gameLogs?.length || 1)
  const safetyCount =
    pg(safe(d?.stats?.safeties), dg) + pg(safe(d?.stats?.onePtSafeties), dg) * 0.5
  const safetyPts =
    pg(safe(d?.stats?.safeties), dg) * 2 + pg(safe(d?.stats?.onePtSafeties), dg) * 1

  const tdPts = tds * 6
  const fgPts = bestFg * 3
  const xpPts = bestXp * 1
  const baseScore = r1(tdPts + fgPts + xpPts + safetyPts)
  const homeField = isHome ? HOME_FIELD_ADVANTAGE : 0
  const finalScore = r1(baseScore + homeField)

  return {
    abbr: teamAbbr,
    tds: r2(tds),
    tdPts: r1(tdPts),
    fg: r2(bestFg),
    fgPts: r1(fgPts),
    xp: r2(bestXp),
    xpPts: r1(xpPts),
    safeties: r2(safetyCount),
    safetyPts: r1(safetyPts),
    baseScore,
    homeField,
    finalScore,
    tdFactor: r2(tdF),
    yaFactor: r2(yaF),
    oppAbbr: oppAbbr && oppAbbr !== 'BYE' ? oppAbbr : undefined,
    contributors,
    kickerName,
  }
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
  homeXp: number
  awayXp: number
  homeSafeties: number
  awaySafeties: number
  homeFieldApplied: boolean
  winner: string
  spread: number
  total: number
}

export type GameDetail = ProjectedGame & {
  homeBreakdown: TeamScoreBreakdown
  awayBreakdown: TeamScoreBreakdown
}

export function projectWeekGames(lake: DataLake): ProjectedGame[] {
  const players = lake.players || []
  const defenses = lake.defenses || []
  const dstByAbbr = new Map(defenses.map((d) => [d.abbreviation, d]))
  const leaguePa = leaguePaPg(defenses)
  const leagueYa = leagueYaPg(defenses)

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
    const h = teamBreakdown(home, true, players, dstByAbbr, leaguePa, leagueYa)
    const a = teamBreakdown(away, false, players, dstByAbbr, leaguePa, leagueYa)
    const homeScore = h.finalScore
    const awayScore = a.finalScore
    const winner =
      homeScore > awayScore ? home : awayScore > homeScore ? away : 'TIE'
    out.push({
      home,
      away,
      homeScore,
      awayScore,
      homeTds: h.tds,
      awayTds: a.tds,
      homeFg: h.fg,
      awayFg: a.fg,
      homeXp: h.xp,
      awayXp: a.xp,
      homeSafeties: h.safeties,
      awaySafeties: a.safeties,
      homeFieldApplied: true,
      winner,
      spread: r1(homeScore - awayScore),
      total: r1(homeScore + awayScore),
    })
  }

  out.sort((x, y) => y.total - x.total || Math.abs(y.spread) - Math.abs(x.spread))
  return out
}

/** Full breakdown for a single matchup (away @ home). */
export function getGameDetail(
  lake: DataLake,
  away: string,
  home: string
): GameDetail | null {
  const players = lake.players || []
  const defenses = lake.defenses || []
  const dstByAbbr = new Map(defenses.map((d) => [d.abbreviation, d]))
  const leaguePa = leaguePaPg(defenses)
  const leagueYa = leagueYaPg(defenses)

  const h = teamBreakdown(home, true, players, dstByAbbr, leaguePa, leagueYa)
  const a = teamBreakdown(away, false, players, dstByAbbr, leaguePa, leagueYa)
  const homeScore = h.finalScore
  const awayScore = a.finalScore
  const winner =
    homeScore > awayScore ? home : awayScore > homeScore ? away : 'TIE'

  return {
    home,
    away,
    homeScore,
    awayScore,
    homeTds: h.tds,
    awayTds: a.tds,
    homeFg: h.fg,
    awayFg: a.fg,
    homeXp: h.xp,
    awayXp: a.xp,
    homeSafeties: h.safeties,
    awaySafeties: a.safeties,
    homeFieldApplied: true,
    winner,
    spread: r1(homeScore - awayScore),
    total: r1(homeScore + awayScore),
    homeBreakdown: h,
    awayBreakdown: a,
  }
}

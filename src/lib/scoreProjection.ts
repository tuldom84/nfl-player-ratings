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
 * TD contributors (fixed roster construction):
 *   Best 1 QB + 2 RB + 3 WR + 2 TE per team, sorted by production
 *   (relevant TDs/g then yards/g).
 *
 * Important: do NOT add QB pass TDs into the team total.
 * A pass TD is the same scoring play as the receiver's rec TD —
 * counting both double-counts. Team TDs = rush TDs (any) +
 * receiving TDs (RB/WR/TE only).
 *
 * If a required slot is missing / Out / IR / Suspension:
 *   placeholder TD = league-average TD/game for that position × 0.75
 *   (still multiplied by matchup TD factor; same scales/weights).
 *   QB placeholder uses rush-TD average only.
 *
 * Injury weights (betting):
 *   Out / IR / Suspension → 0 (slot becomes placeholder)
 *   Questionable → 50%
 *   Doubtful / day-to-day → 25%
 *   Active → 100%
 */

import type { DataLake, Player, TeamDefense } from './types'

export const HOME_FIELD_ADVANTAGE = 2.5

const SLOT_COUNTS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 2,
}

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

/**
 * League-average TDs that actually count toward team score, by position.
 * QB → rush TDs only (pass TDs are not added to team total).
 * RB/WR/TE → rush + receiving TDs.
 */
function leagueTdPerGameByPos(players: Player[]): Record<string, number> {
  const acc: Record<string, { sum: number; n: number }> = {
    QB: { sum: 0, n: 0 },
    RB: { sum: 0, n: 0 },
    WR: { sum: 0, n: 0 },
    TE: { sum: 0, n: 0 },
  }
  for (const p of players) {
    if (!acc[p.position]) continue
    const st = p.stats || {}
    const g = Math.max(1, st.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1)
    let tds = 0
    if (p.position === 'QB') {
      tds = pg(safe(st.rushTDs), g) // pass TDs excluded from team total
    } else {
      tds = pg(safe(st.rushTDs), g) + pg(safe(st.recTDs), g)
    }
    if (tds <= 0) continue
    acc[p.position].sum += tds
    acc[p.position].n++
  }
  const out: Record<string, number> = {}
  for (const pos of Object.keys(acc)) {
    // QB rush TD average is low; use a small fallback
    out[pos] = acc[pos].n ? acc[pos].sum / acc[pos].n : pos === 'QB' ? 0.25 : 0.45
  }
  return out
}

/** Production key for sorting (selection quality). QBs still ranked on pass+rush. */
function productionKey(p: Player): { tdPg: number; ydsPg: number } {
  const st = p.stats || {}
  const g = Math.max(1, st.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1)
  if (p.position === 'QB') {
    return {
      tdPg: pg(safe(st.passTDs), g) + pg(safe(st.rushTDs), g),
      ydsPg: pg(safe(st.passYds), g) + pg(safe(st.rushYds), g),
    }
  }
  return {
    tdPg: pg(safe(st.rushTDs), g) + pg(safe(st.recTDs), g),
    ydsPg: pg(safe(st.rushYds), g) + pg(safe(st.recYds), g),
  }
}

export type TdContributor = {
  id: string
  name: string
  position: string
  tds: number
  injuryWeight: number
  injuryStatus?: string
  isPlaceholder?: boolean
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
  leagueYa: number,
  leagueTdByPos: Record<string, number>
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

  // Group skill players by position
  const byPos: Record<string, Player[]> = { QB: [], RB: [], WR: [], TE: [] }
  for (const p of roster) {
    if (byPos[p.position]) byPos[p.position].push(p)
  }

  const contributors: TdContributor[] = []
  let tds = 0

  for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
    const need = SLOT_COUNTS[pos]
    const candidates = byPos[pos]
      .map((p) => {
        const key = productionKey(p)
        const inj = playerInj(p)
        return { p, key, inj }
      })
      // Sort highest production first (TDs then yards)
      .sort((a, b) => b.key.tdPg - a.key.tdPg || b.key.ydsPg - a.key.ydsPg)

    let filled = 0
    for (const { p, inj } of candidates) {
      if (filled >= need) break
      // Fully out → treat as missing slot (placeholder later)
      if (inj === 0 || p.fantasy?.homeAway === 'bye') continue

      const st = p.stats || {}
      const g = Math.max(1, st.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1)
      let playerTds = 0
      if (pos === 'QB') {
        // Only rush TDs count toward team score (pass TDs already in receivers)
        playerTds = pg(safe(st.rushTDs), g) * tdF * inj
      } else {
        // RB / WR / TE: rush + receiving TDs
        playerTds = (pg(safe(st.rushTDs), g) + pg(safe(st.recTDs), g)) * tdF * inj
      }

      tds += playerTds
      contributors.push({
        id: p.id,
        name: p.name,
        position: pos,
        tds: r2(playerTds),
        injuryWeight: inj,
        injuryStatus: p.fantasy?.injuryStatus,
      })
      filled++
    }

    // Fill remaining slots with 75% of league-average (countable) TD/game for the position
    while (filled < need) {
      const placeholderTd = (leagueTdByPos[pos] || 0.4) * 0.75 * tdF
      tds += placeholderTd
      contributors.push({
        id: `${teamAbbr}-${pos}-placeholder-${filled}`,
        name: `${pos} placeholder`,
        position: pos,
        tds: r2(placeholderTd),
        injuryWeight: 0.75,
        injuryStatus: 'Placeholder',
        isPlaceholder: true,
      })
      filled++
    }
  }

  contributors.sort((a, b) => b.tds - a.tds)

  // Kicker (unchanged logic)
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
  const leagueTdByPos = leagueTdPerGameByPos(players)

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
    const h = teamBreakdown(home, true, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
    const a = teamBreakdown(away, false, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
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
  const leagueTdByPos = leagueTdPerGameByPos(players)

  const h = teamBreakdown(home, true, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
  const a = teamBreakdown(away, false, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
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

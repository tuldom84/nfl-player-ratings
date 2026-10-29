/**
 * NFL game score projections for the Betting tab.
 *
 * Team score =
 *   (matchup-adjusted offensive TDs) × 6
 *   + (projected kicker FG made × TD factor) × 3
 *   + (projected XP made) × 1
 *   + (projected DST safeties) × 2
 *   + home-field advantage (+2.5 for home team)
 *   + QB quality boost: (RPS/100) × max(0, passTD/g − INT/g)
 *     (not injury-weighted)
 *   + net turnover differential:
 *       (own TOD/g − opponent TOD/g) × 1.75
 *     TOD/g = takeaways/g − giveaways/g
 *       takeaways = defensive INT + fumbles recovered
 *       giveaways = offensive INT + fumbles lost
 *     The same amount is added to one team and subtracted from the other
 *     (game total unchanged). Example: A +1.0, B −0.5 →
 *     (1 − (−0.5)) × 1.75 = +2.625 to A and −2.625 to B.
 *
 * TD contributors (fixed roster construction):
 *   Best 1 QB + 2 RB + 4 WR + 2 TE per team, sorted by production
 *   (relevant TDs/g then yards/g).
 *
 * Important: do NOT add QB pass TDs into the team total.
 * A pass TD is the same scoring play as the receiver's rec TD —
 * counting both double-counts. Team TDs = rush TDs (any) +
 * receiving TDs (RB/WR/TE only).
 * The small QB boost uses net pass TD rate (pass TD − INT) as a quality
 * signal, not as additional touchdowns on the scoreboard.
 *
 * Matchup TD factor (opp points-allowed vs league average) is applied to:
 *   rawTds → tds = rawTds * tdFactor → tdPts = tds * 6
 *   projected FG made → fg * tdFactor (defense quality affects FG chances)
 *
 * If a required slot is missing or on bye:
 *   WR → 0 (no contribution)
 *   QB / RB / TE → league-average TD/game for that position × 0.75
 *   (matchup factor applied later at team level).
 *   QB placeholder uses rush-TD average only (no RPS boost).
 *
 * Injury weights on TD (and kicker) rates — betting only:
 *   Questionable or day-to-day → 90% (10% penalty)
 *   Doubtful → 70% (30% penalty)
 *   Out / IR / Suspension / everyone else → 100% (no penalty)
 *   (Does not apply to the QB quality boost.)
 *
 * Availability (existing lake value, games played / team games):
 *   RB / WR / TE TD/g is multiplied by availability so a 1–2 game spike
 *   is not treated as a full-season rate. Those slots are chosen the same way.
 *   The one QB is not reduced by availability. Injury still applies:
 *   Questionable or day-to-day −10%, Doubtful −30%.
 */

import type { DataLake, Player, TeamDefense, TeamOffense } from './types'

export const HOME_FIELD_ADVANTAGE = 2.5
/** Points per turnover-differential-per-game edge vs the opponent. */
export const TO_DIFF_POINT_VALUE = 1.75

const SLOT_COUNTS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 4,
  TE: 2,
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
const pg = (total: number, games: number) => total / Math.max(games, 1)
const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10

/** Betting TD/FG weight. Only Q/day-to-day (10% off) and Doubtful (30% off). */
function injuryFactor(status?: string, detail?: string): number {
  const s = (status || '').toLowerCase().trim()
  const d = (detail || '').toLowerCase()
  const dayToDay =
    s === 'day-to-day' ||
    s === 'day to day' ||
    s === 'dtd' ||
    s === 'd2d' ||
    /\bday[-\s]?to[-\s]?day\b/.test(d) ||
    /\bd2d\b/.test(d) ||
    /\bdtd\b/.test(d)
  const doubtful = s === 'doubtful' || /\bdoubtful\b/.test(d)
  const questionable = s === 'questionable' || /\bquestionable\b/.test(d)

  if (doubtful) return 0.7
  if (questionable || dayToDay) return 0.9
  return 1
}

function playerInj(p: Player): number {
  return injuryFactor(p.fantasy?.injuryStatus, p.fantasy?.injuryDetail)
}

/**
 * Share of team games the player has actually played.
 * Prefer the lake's `availability` (games played / team games). Fall back to
 * the same ratio from stats when the scored lake has not been applied yet.
 */
function playerAvailability(p: Player): number {
  const stored = p.availability
  if (typeof stored === 'number' && !Number.isNaN(stored)) return clamp(stored, 0, 1)
  const st = p.stats || {}
  const gp = st.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 0
  const tg = st.teamGamesPlayed || p.fantasy?.teamGamesPlayed || 0
  if (gp <= 0 || tg <= 0) return 1
  return clamp(gp / tg, 0, 1)
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

/**
 * Small quality bump for better QBs — not double-counted TDs.
 * (RPS/100) × max(0, passTD/g − INT/g)
 * Injury weight is intentionally NOT applied.
 * e.g. Lamar RPS 81.1, 1.5 pass TD/g, 0.3 INT/g → 0.811 × 1.2 ≈ 0.97
 */
function qbQualityBoost(p: Player): number {
  const st = p.stats || {}
  const g = Math.max(1, st.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1)
  const passTdPg = pg(safe(st.passTDs), g)
  const intPg = pg(safe(st.interceptions), g)
  const netTdPg = Math.max(0, passTdPg - intPg)
  const rps = typeof p.rps === 'number' && !Number.isNaN(p.rps) ? p.rps : 50
  return (rps / 100) * netTdPg
}

export type TdContributor = {
  id: string
  name: string
  position: string
  tds: number
  injuryWeight: number
  /** games played / team games. 1 = played every team game. */
  availability: number
  injuryStatus?: string
  isPlaceholder?: boolean
}

export type TeamScoreBreakdown = {
  abbr: string
  /** Unadjusted sum of player/placeholder TDs (before matchup factor) */
  rawTds: number
  /** rawTds * tdFactor */
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
  /** QB quality: (RPS/100)×max(0, passTD/g−INT/g) — not injury-weighted */
  qbBoost: number
  qbName?: string
  /** Net turnover differential per game (takeaways − giveaways). Positive is good. */
  todPerGame: number
  /** Points from (own TOD/g − opp TOD/g) × 1.75. Zero-sum vs the opponent. */
  toAdj: number
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
    rawTds: 0,
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
    qbBoost: 0,
    todPerGame: 0,
    toAdj: 0,
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
  let rawTds = 0
  let qbBoost = 0
  let qbName: string | undefined

  for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
    const need = SLOT_COUNTS[pos]
    const candidates = byPos[pos]
      .map((p) => {
        const key = productionKey(p)
        const inj = playerInj(p)
        const avail = pos === 'QB' ? 1 : playerAvailability(p)
        return { p, key, inj, avail }
      })
      // RB/WR/TE: expected TDs per team game. QB: raw rate (only one plays).
      .sort(
        (a, b) =>
          b.key.tdPg * b.avail - a.key.tdPg * a.avail ||
          b.key.ydsPg * b.avail - a.key.ydsPg * a.avail
      )

    let filled = 0
    for (const { p, inj, avail } of candidates) {
      if (filled >= need) break
      // Bye does not play. Out / IR / Suspension stay in at full rate.
      if (p.fantasy?.homeAway === 'bye') continue

      const st = p.stats || {}
      const g = Math.max(1, st.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1)
      let playerTds = 0
      if (pos === 'QB') {
        // One QB: full rush TD/g. Injury only (Q/DTD −10%, Doubtful −30%).
        playerTds = pg(safe(st.rushTDs), g) * inj
        // QB quality boost is not injury-weighted
        qbBoost = qbQualityBoost(p)
        qbName = p.name
      } else {
        // RB / WR / TE: rush + receiving TDs, scaled by availability
        playerTds = (pg(safe(st.rushTDs), g) + pg(safe(st.recTDs), g)) * inj * avail
      }

      rawTds += playerTds
      contributors.push({
        id: p.id,
        name: p.name,
        position: pos,
        tds: r2(playerTds),
        injuryWeight: inj,
        availability: r2(avail),
        injuryStatus: p.fantasy?.injuryStatus,
      })
      filled++
    }

    // Fill remaining slots:
    // WR → 0 (no contribution if not found)
    // QB / RB / TE → 75% of league-average countable TD/game
    while (filled < need) {
      if (pos === 'WR') {
        contributors.push({
          id: `${teamAbbr}-WR-empty-${filled}`,
          name: 'WR (none)',
          position: 'WR',
          tds: 0,
          injuryWeight: 0,
          availability: 1,
          injuryStatus: 'Empty',
          isPlaceholder: true,
        })
      } else {
        const placeholderTd = (leagueTdByPos[pos] || 0.4) * 0.75
        rawTds += placeholderTd
        contributors.push({
          id: `${teamAbbr}-${pos}-placeholder-${filled}`,
          name: `${pos} placeholder`,
          position: pos,
          tds: r2(placeholderTd),
          injuryWeight: 0.75,
          availability: 1,
          injuryStatus: 'Placeholder',
          isPlaceholder: true,
        })
        // Placeholder QB gets no RPS quality boost
      }
      filled++
    }
  }

  contributors.sort((a, b) => b.tds - a.tds)

  // Apply matchup TD factor ONCE at team level
  const tds = rawTds * tdF

  // Kicker — FG also scaled by TD factor (defense quality / scoring environment)
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
    if (k.fantasy?.homeAway === 'bye') {
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
    // TD factor (opp PA) scales FG opportunities with defense quality
    bestFg = pg(fg, g) * tdF * inj
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
  const qbBoostR = r2(qbBoost)
  const baseScore = r1(tdPts + fgPts + xpPts + safetyPts)
  const homeField = isHome ? HOME_FIELD_ADVANTAGE : 0
  const finalScore = r1(baseScore + homeField + qbBoostR)

  return {
    abbr: teamAbbr,
    rawTds: r2(rawTds),
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
    qbBoost: qbBoostR,
    qbName,
    todPerGame: 0,
    toAdj: 0,
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

/**
 * Net turnover differential per game.
 * Takeaways (def INT + fumbles recovered) minus giveaways (off INT + fumbles lost).
 * Positive means the team wins the turnover battle.
 */
export function turnoverDiffPerGame(
  offense: TeamOffense | undefined,
  defense: TeamDefense | undefined
): number {
  const o = offense?.stats
  if (!o) return 0
  const d = defense?.stats
  const offG = Math.max(1, o.gamesPlayed || d?.gamesPlayed || 1)
  const defG = Math.max(1, d?.gamesPlayed || d?.gameLogs?.length || o.gamesPlayed || 1)
  const givePg = (safe(o.interceptions) + safe(o.fumblesLost)) / offG
  const takePg = (safe(d?.ints) + safe(d?.fumblesRec)) / defG
  return takePg - givePg
}

/**
 * (own TOD/g − opp TOD/g) × 1.75 added to each final score.
 * Symmetric: one team's gain is the other's loss, so the total does not move.
 */
function applyTurnoverDifferential(
  home: TeamScoreBreakdown,
  away: TeamScoreBreakdown,
  offenses: TeamOffense[] | undefined,
  defenses: TeamDefense[]
): { home: TeamScoreBreakdown; away: TeamScoreBreakdown } {
  const offBy = new Map((offenses || []).map((o) => [o.abbreviation, o]))
  const defBy = new Map(defenses.map((d) => [d.abbreviation, d]))
  const homeTod = r2(turnoverDiffPerGame(offBy.get(home.abbr), defBy.get(home.abbr)))
  const awayTod = r2(turnoverDiffPerGame(offBy.get(away.abbr), defBy.get(away.abbr)))
  // Use the rounded rates so (shown TOD/g − opp) × 1.75 matches the points row.
  // Opponent gets the exact negation so the two adjustments always sum to 0.
  const homePts = r2((homeTod - awayTod) * TO_DIFF_POINT_VALUE)
  const awayPts = r2(-homePts)
  return {
    home: {
      ...home,
      todPerGame: homeTod,
      toAdj: homePts,
      finalScore: r1(home.finalScore + homePts),
    },
    away: {
      ...away,
      todPerGame: awayTod,
      toAdj: awayPts,
      finalScore: r1(away.finalScore + awayPts),
    },
  }
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
    const rawH = teamBreakdown(home, true, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
    const rawA = teamBreakdown(away, false, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
    const { home: h, away: a } = applyTurnoverDifferential(
      rawH,
      rawA,
      lake.teamOffenses,
      defenses
    )
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

  const rawH = teamBreakdown(home, true, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
  const rawA = teamBreakdown(away, false, players, dstByAbbr, leaguePa, leagueYa, leagueTdByPos)
  const { home: h, away: a } = applyTurnoverDifferential(
    rawH,
    rawA,
    lake.teamOffenses,
    defenses
  )
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

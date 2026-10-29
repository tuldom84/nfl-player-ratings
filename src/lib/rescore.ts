/** Client-side re-score of the data lake using user scoring settings. */

import type { DataLake, Player, TeamDefense, Position, DstGameLog } from './types'
import type { ScoringSettings, BracketRow } from './scoringSettings'
import { applyValueGrades } from './valueGrade'
import { applyRps } from './rps'
import { applyOffenseRps } from './offenseRps'
import { applyMatchupProjections } from './matchupProjection'

const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

function bracketPts(table: BracketRow[], value: number): number {
  for (const row of table) {
    if (value <= row.max) return row.pts
  }
  return 0
}

/** All rates come from settings (normalized via loadScoringSettings). */
function scorePlayer(stats: Player['stats'], pos: Position, s: ScoringSettings): number {
  const o = s.offense
  let pts = 0
  if (pos === 'QB') {
    pts +=
      safe(stats.passYds) * o.passYd +
      safe(stats.passTDs) * o.passTD +
      safe(stats.interceptions) * o.int +
      safe(stats.rushYds) * o.rushYd +
      safe(stats.rushTDs) * o.rushTD +
      safe(stats.fumblesLost) * o.fumLost
  } else if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    pts +=
      safe(stats.rushYds) * o.rushYd +
      safe(stats.rushTDs) * o.rushTD +
      safe(stats.receptions) * o.rec +
      safe(stats.recYds) * o.recYd +
      safe(stats.recTDs) * o.recTD +
      safe(stats.fumblesLost) * o.fumLost
  } else if (pos === 'K') {
    const k = s.kicker
    const st = stats as Record<string, number | undefined>
    const fg0 =
      safe(st.fgMade1_19) + safe(st.fgMade20_29) + safe(st.fgMade30_39)
    const fg40 = safe(st.fgMade40_49)
    const fg50 = safe(st.fgMade50_59)
    const fg60 = safe(st.fgMade60)
    const madeBuckets = fg0 + fg40 + fg50 + fg60
    if (madeBuckets > 0) {
      let miss = safe(st.fgMissed)
      if (!miss && safe(stats.fgAtt) > 0) miss = Math.max(0, safe(stats.fgAtt) - madeBuckets)
      pts +=
        safe(stats.xpMade) * k.xpMade +
        miss * k.fgMiss +
        fg0 * k.fg0_39 +
        fg40 * k.fg40_49 +
        fg50 * k.fg50_59 +
        fg60 * k.fg60
    } else {
      const made = safe(stats.fgMade)
      let miss = 0
      if (safe(stats.fgAtt) > 0) miss = Math.max(0, safe(stats.fgAtt) - made)
      pts += safe(stats.xpMade) * k.xpMade + miss * k.fgMiss + made * k.fg0_39
    }
  }
  return Math.round(pts * 10) / 10
}

/**
 * DST fantasy points — single formula for season totals:
 *   season counting stats (sacks, INT, FR, FF, TD, safety, blocks, …)
 * + PA bracket per completed game (from gameLogs when present)
 * + YA bracket per game only when yardsAllowed is a real value (> 0)
 *
 * All multipliers / brackets come from settings.dst.
 */
function scoreDst(stats: TeamDefense['stats'], s: ScoringSettings): number {
  const d = s.dst
  const st = stats as Record<string, number | undefined>
  const logs = (stats.gameLogs || []) as DstGameLog[]

  let pts = 0
  pts += safe(stats.sacks) * d.sack
  pts += safe(stats.ints) * d.int
  pts += safe(stats.fumblesRec) * d.fumRec
  pts += safe(st.fumblesForced) * d.fumForced
  pts += safe(st.safeties) * d.safety
  pts += safe(st.onePtSafeties) * d.onePtSafety
  pts += safe(st.twoPtReturns) * d.twoPtReturn
  pts += safe(stats.defTDs) * d.defTD
  pts += safe(st.kicksBlocked) * d.blockedKick

  if (logs.length > 0) {
    for (const g of logs) {
      if (g.ptsAllowed != null) pts += bracketPts(d.pa, safe(g.ptsAllowed))
      const ya = g.yardsAllowed
      if (ya != null && ya > 0) pts += bracketPts(d.ya, ya)
    }
  } else {
    const gp = Math.max(1, safe(stats.gamesPlayed) || 1)
    const totalYA = safe(stats.yardsAllowed)
    const totalPA = safe(stats.ptsAllowed)
    if (totalPA > 0 || logs.length === 0) {
      pts += bracketPts(d.pa, totalPA / gp) * gp
    }
    if (totalYA > 0) {
      pts += bracketPts(d.ya, totalYA / gp) * gp
    }
  }
  return Math.round(pts * 10) / 10
}

function gradeLabel(score: number): string {
  if (score >= 80) return 'Elite'
  if (score >= 65) return 'Great'
  if (score >= 50) return 'Solid'
  if (score >= 30) return 'Average'
  return 'Below'
}

function valueNormalize(values: number[]): number[] {
  if (!values.length) return []
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  return values.map((v) => Math.round(((v - mn) / range) * 1000) / 10)
}

function gradeByPosition<T extends { position: Position; avgPts: number }>(
  items: T[]
): (T & { grade: number; gradeLabel: string })[] {
  const byPos = new Map<Position, T[]>()
  for (const it of items) {
    const list = byPos.get(it.position) || []
    list.push(it)
    byPos.set(it.position, list)
  }
  const out: (T & { grade: number; gradeLabel: string })[] = []
  for (const [, group] of byPos) {
    const norms = valueNormalize(group.map((g) => g.avgPts))
    group.forEach((g, i) => {
      const grade = norms[i]
      out.push({ ...g, grade, gradeLabel: gradeLabel(grade) })
    })
  }
  return out
}

function applyAvailabilityPenalty(
  grade: number,
  gamesPlayed: number,
  teamGamesPlayed: number
): number {
  const tgp = Math.max(teamGamesPlayed, 1)
  const gp = Math.max(0, gamesPlayed)
  const availability = gp / tgp
  if (availability >= 0.5) return grade
  const gamesMissed = Math.max(1, tgp - gp)
  return Math.round((grade / gamesMissed) * 10) / 10
}

function resolveTeamGames(p: Player): number {
  return Math.max(
    1,
    p.stats.teamGamesPlayed ||
      p.fantasy?.teamGamesPlayed ||
      p.stats.gamesPlayed ||
      p.fantasy?.gamesPlayed ||
      p.fantasy?.games ||
      1
  )
}

/** Recompute fantasy points, grades, RPS, offense RPS, value grades, and matchup projections. */
export function applyScoringSettings(lake: DataLake, settings: ScoringSettings): DataLake {
  const players: Player[] = lake.players.map((p) => {
    const seasonPts = scorePlayer(p.stats, p.position, settings)
    const games = Math.max(
      1,
      p.stats.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1
    )
    const avgPts = Math.round((seasonPts / games) * 10) / 10
    // Placeholder proj — replaced by applyMatchupProjections
    let projectedPts = avgPts
    if (p.fantasy?.homeAway === 'bye') projectedPts = 0

    return {
      ...p,
      stats: { ...p.stats, fantasyPts: seasonPts, gamesPlayed: games },
      fantasy: p.fantasy
        ? {
            ...p.fantasy,
            seasonPts,
            avgPts,
            games,
            gamesPlayed: games,
            projectedPts,
          }
        : {
            seasonPts,
            avgPts,
            games,
            gamesPlayed: games,
            projectedPts,
          },
    }
  })

  const defenses: TeamDefense[] = lake.defenses.map((d) => {
    const seasonPts = scoreDst(d.stats, settings)
    const games = Math.max(
      1,
      d.stats.gameLogs?.length || d.stats.gamesPlayed || d.fantasy?.games || 1
    )
    const avgPts = Math.round((seasonPts / games) * 10) / 10
    let projectedPts = avgPts
    if (d.fantasy?.homeAway === 'bye') projectedPts = 0
    return {
      ...d,
      fantasy: d.fantasy
        ? {
            ...d.fantasy,
            seasonPts,
            avgPts,
            games,
            gamesPlayed: games,
            projectedPts: Math.round(projectedPts * 10) / 10,
          }
        : {
            seasonPts,
            avgPts,
            games,
            gamesPlayed: games,
            projectedPts: Math.round(projectedPts * 10) / 10,
          },
    }
  })

  const gradedPlayers = gradeByPosition(
    players.map((p) => ({
      id: p.id,
      position: p.position,
      avgPts: p.fantasy?.avgPts ?? 0,
    }))
  )
  const gradeMap = new Map(gradedPlayers.map((g) => [g.id, g]))
  const playersWithGrade = players.map((p) => {
    const g = gradeMap.get(p.id)
    if (!g) return p
    const gamesPlayed =
      p.stats.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1
    const teamGames = resolveTeamGames(p)
    const grade = applyAvailabilityPenalty(g.grade, gamesPlayed, teamGames)
    return { ...p, grade, gradeLabel: gradeLabel(grade) }
  })

  const dstAvgs = defenses.map((d) => ({
    id: d.id,
    position: 'DST' as Position,
    avgPts: d.fantasy?.avgPts ?? 0,
  }))
  const gradedDst = gradeByPosition(dstAvgs)
  const dstGradeMap = new Map(gradedDst.map((g) => [g.id, g]))
  let defensesWithGrade = defenses.map((d) => {
    const g = dstGradeMap.get(d.id)
    return g ? { ...d, grade: g.grade, gradeLabel: g.gradeLabel } : d
  })
  defensesWithGrade = [...defensesWithGrade]
    .sort((a, b) => b.grade - a.grade)
    .map((d, i) => ({ ...d, rank: i + 1 }))

  const byPos = new Map<Position, Player[]>()
  for (const p of playersWithGrade) {
    const list = byPos.get(p.position) || []
    list.push(p)
    byPos.set(p.position, list)
  }
  const rankedPlayers: Player[] = []
  for (const [, list] of byPos) {
    list.sort((a, b) => b.grade - a.grade)
    list.forEach((p, i) => {
      rankedPlayers.push({ ...p, rankPos: i + 1 })
    })
  }

  const withValue = applyValueGrades({
    ...lake,
    players: rankedPlayers,
    defenses: defensesWithGrade,
  })
  const withPlayerRps = applyRps(withValue)
  const withOffenseRps = applyOffenseRps(withPlayerRps)
  // Final step: rebuild weekly projections from opp DST YA/PA (players) and opp offense (DST)
  return applyMatchupProjections(withOffenseRps, settings)
}

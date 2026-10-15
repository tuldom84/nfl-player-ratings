/** Client-side re-score of the data lake using user scoring settings. */

import type { DataLake, Player, TeamDefense, Position } from './types'
import type { ScoringSettings, BracketRow } from './scoringSettings'
import { applyValueGrades } from './valueGrade'
import { applyRps } from './rps'

const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

function bracketPts(table: BracketRow[], value: number): number {
  for (const row of table) {
    if (value <= row.max) return row.pts
  }
  return 0
}

function scorePlayer(stats: Player['stats'], pos: Position, s: ScoringSettings): number {
  const o = s.offense
  let pts = 0
  if (pos === 'QB') {
    pts +=
      safe(stats.passYds) * o.passYd +
      safe(stats.passTDs) * o.passTD +
      safe(stats.interceptions) * o.int +
      safe(stats.rushYds) * o.rushYd +
      safe(stats.rushTDs) * o.rushTD
  } else if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    pts +=
      safe(stats.rushYds) * o.rushYd +
      safe(stats.rushTDs) * o.rushTD +
      safe(stats.receptions) * o.rec +
      safe(stats.recYds) * o.recYd +
      safe(stats.recTDs) * o.recTD
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

function scoreDst(stats: TeamDefense['stats'], s: ScoringSettings): number {
  const d = s.dst
  let pts = 0
  pts += safe(stats.sacks) * d.sack
  pts += safe(stats.ints) * d.int
  pts += safe(stats.fumblesRec) * d.fumRec
  pts += safe((stats as Record<string, number>).fumblesForced) * d.fumForced
  pts += safe((stats as Record<string, number>).safeties) * d.safety
  pts += safe(stats.defTDs) * d.defTD
  pts += safe((stats as Record<string, number>).kicksBlocked) * d.blockedKick

  const gp = Math.max(1, safe(stats.gamesPlayed) || 1)
  const avgPA = safe(stats.ptsAllowed) / gp
  const avgYA = safe(stats.yardsAllowed) / gp
  pts += bracketPts(d.pa, avgPA) * gp
  pts += bracketPts(d.ya, avgYA) * gp
  return Math.round(pts * 10) / 10
}

function gradeLabel(score: number): string {
  if (score >= 90) return 'Elite'
  if (score >= 75) return 'Great'
  if (score >= 55) return 'Solid'
  if (score >= 35) return 'Average'
  return 'Below'
}

function normalize(values: number[]): number[] {
  if (!values.length) return []
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  return values.map((v) => ((v - mn) / range) * 100)
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
    const norms = normalize(group.map((g) => g.avgPts))
    group.forEach((g, i) => {
      const grade = Math.round(norms[i] * 10) / 10
      out.push({ ...g, grade, gradeLabel: gradeLabel(grade) })
    })
  }
  return out
}

/**
 * Fantasy pos-grade penalty: if availability < 50%, divide by games missed.
 */
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

/** Recompute fantasy points, grades, RPS, and value grades from raw stats + settings. */
export function applyScoringSettings(lake: DataLake, settings: ScoringSettings): DataLake {
  const players: Player[] = lake.players.map((p) => {
    const seasonPts = scorePlayer(p.stats, p.position, settings)
    const games = Math.max(
      1,
      p.stats.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1
    )
    const avgPts = Math.round((seasonPts / games) * 10) / 10
    const mult = p.fantasy?.matchupMultiplier ?? 1
    const homeAway = p.fantasy?.homeAway
    let projectedPts = Math.round(avgPts * mult * 10) / 10
    if (homeAway === 'bye') projectedPts = 0
    const inj = p.fantasy?.injuryStatus
    if (inj === 'Out' || inj === 'Injured Reserve' || inj === 'Suspension') projectedPts = 0
    else if (inj === 'Doubtful') projectedPts = Math.round(projectedPts * 0.4 * 10) / 10
    else if (inj === 'Questionable') projectedPts = Math.round(projectedPts * 0.85 * 10) / 10

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
    const games = Math.max(1, d.stats.gamesPlayed || d.fantasy?.games || 1)
    const avgPts = Math.round((seasonPts / games) * 10) / 10
    const homeAway = d.fantasy?.homeAway
    let projectedPts = avgPts
    if (homeAway === 'bye') projectedPts = 0
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

  // Fantasy value grades, then real-football RPS (independent of scoring settings)
  const withValue = applyValueGrades({
    ...lake,
    players: rankedPlayers,
    defenses: defensesWithGrade,
  })
  return applyRps(withValue)
}

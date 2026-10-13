/**
 * Cross-position fantasy value rating for full-PPR leagues.
 *
 * Combines:
 *  1. Scoring output — season average PPR points per game
 *  2. Availability — games played / team games (missed time penalty)
 *  3. Positional value — PPR scarcity / start-value weights by position
 *
 * Result is normalized 0–100 across the entire pool (players + optional DST).
 * Position-relative `grade` remains separate for within-position ranking.
 */

import type { Player, TeamDefense, Position, DataLake } from './types'

/** Relative start-value weights in typical full-PPR (1QB) leagues */
export const PPR_POSITION_VALUE: Record<Position, number> = {
  RB: 1.2, // scarcest high-upside starters
  WR: 1.15,
  TE: 1.08, // premium at the top, thinner overall
  QB: 0.88, // high raw PPG but more replaceable in 1QB
  DST: 0.72,
  K: 0.45,
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
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values.map((v) => ((v - min) / range) * 100)
}

/** Infer team season games from meta week or max GP in pool */
function teamGamesPlayed(lake: DataLake, playerGames: number): number {
  const week = lake.meta.week || 0
  // Through week N, most teams have played N or N-1 (bye)
  const fromWeek = week > 0 ? week : 0
  const maxGp = Math.max(
    playerGames,
    ...lake.players.map((p) => p.fantasy?.games || p.stats.gamesPlayed || 0),
    fromWeek
  )
  return Math.max(maxGp, 1)
}

export function computeValueRaw(
  avgPts: number,
  gamesPlayed: number,
  teamGames: number,
  position: Position
): { valueRaw: number; availability: number } {
  const availability = Math.min(1, Math.max(0, gamesPlayed / Math.max(teamGames, 1)))
  const posW = PPR_POSITION_VALUE[position] ?? 1
  // Effective production accounting for missed games, then position scarcity
  const valueRaw = avgPts * availability * posW
  return { valueRaw, availability }
}

/**
 * Enrich lake with cross-position valueGrade / valueLabel / rankValue / availability.
 * Safe to call on every load; overwrites prior value fields.
 */
export function applyValueGrades(lake: DataLake): DataLake {
  type Row = {
    kind: 'player' | 'dst'
    index: number
    position: Position
    avgPts: number
    games: number
    valueRaw: number
    availability: number
  }

  const rows: Row[] = []

  lake.players.forEach((p, index) => {
    const games = p.fantasy?.games || p.stats.gamesPlayed || 1
    const avgPts = p.fantasy?.avgPts ?? 0
    const teamGames = teamGamesPlayed(lake, games)
    const { valueRaw, availability } = computeValueRaw(avgPts, games, teamGames, p.position)
    rows.push({ kind: 'player', index, position: p.position, avgPts, games, valueRaw, availability })
  })

  lake.defenses.forEach((d, index) => {
    const games = d.fantasy?.games || 4
    const avgPts = d.fantasy?.avgPts ?? 0
    const teamGames = teamGamesPlayed(lake, games)
    const { valueRaw, availability } = computeValueRaw(avgPts, games, teamGames, 'DST')
    rows.push({ kind: 'dst', index, position: 'DST', avgPts, games, valueRaw, availability })
  })

  const norms = normalize(rows.map((r) => r.valueRaw))

  const players = lake.players.map((p) => ({ ...p }))
  const defenses = lake.defenses.map((d) => ({ ...d }))

  rows.forEach((r, i) => {
    const valueGrade = Math.round(norms[i] * 10) / 10
    const valueLabel = gradeLabel(valueGrade)
    if (r.kind === 'player') {
      players[r.index] = {
        ...players[r.index],
        valueGrade,
        valueLabel,
        availability: Math.round(r.availability * 1000) / 1000,
      }
    } else {
      defenses[r.index] = {
        ...defenses[r.index],
        valueGrade,
        valueLabel,
        availability: Math.round(r.availability * 1000) / 1000,
      }
    }
  })

  // Rank all by value grade (players + DST combined for rankValue on players;
  // defenses get rank among themselves + overall context via valueGrade)
  const rankedPlayers = [...players].sort(
    (a, b) => (b.valueGrade ?? 0) - (a.valueGrade ?? 0)
  )
  rankedPlayers.forEach((p, i) => {
    const target = players.find((x) => x.id === p.id)
    if (target) target.rankValue = i + 1
  })

  const rankedDef = [...defenses].sort(
    (a, b) => (b.valueGrade ?? 0) - (a.valueGrade ?? 0)
  )
  rankedDef.forEach((d, i) => {
    const target = defenses.find((x) => x.id === d.id)
    if (target) target.rankValue = i + 1
  })

  // Overall rank among every entity (player + DST) for ALL tab
  const allEntities: { id: string; kind: 'player' | 'dst'; valueGrade: number }[] = [
    ...players.map((p) => ({ id: p.id, kind: 'player' as const, valueGrade: p.valueGrade ?? 0 })),
    ...defenses.map((d) => ({ id: d.id, kind: 'dst' as const, valueGrade: d.valueGrade ?? 0 })),
  ].sort((a, b) => b.valueGrade - a.valueGrade)

  allEntities.forEach((e, i) => {
    if (e.kind === 'player') {
      const p = players.find((x) => x.id === e.id)
      if (p) p.rankOverall = i + 1
    } else {
      const d = defenses.find((x) => x.id === e.id)
      if (d) d.rank = i + 1
    }
  })

  return { ...lake, players, defenses }
}

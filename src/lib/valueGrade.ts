/**
 * Cross-position fantasy value rating for full-PPR leagues.
 *
 * Combines:
 *  1. Scoring output — season average PPR points per game (using games played)
 *  2. Availability — gamesPlayed / teamGamesPlayed (not games started)
 *  3. Positional value — PPR scarcity weights by position
 */

import type { Position, DataLake } from './types'

export const PPR_POSITION_VALUE: Record<Position, number> = {
  RB: 1.2,
  WR: 1.15,
  TE: 1.08,
  QB: 0.88,
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

/** Prefer explicit teamGamesPlayed; else max GP / week */
function resolveTeamGames(lake: DataLake, player: {
  fantasy?: { games?: number; teamGamesPlayed?: number; gamesPlayed?: number }
  stats: { gamesPlayed?: number; teamGamesPlayed?: number }
}): number {
  const explicit =
    player.fantasy?.teamGamesPlayed ||
    player.stats.teamGamesPlayed ||
    0
  if (explicit > 0) return explicit

  const week = lake.meta.week || 0
  const gp =
    player.fantasy?.gamesPlayed ||
    player.fantasy?.games ||
    player.stats.gamesPlayed ||
    0
  const maxGp = Math.max(
    gp,
    ...lake.players.map(
      (p) => p.fantasy?.gamesPlayed || p.fantasy?.games || p.stats.gamesPlayed || 0
    ),
    week
  )
  return Math.max(maxGp, 1)
}

function resolveGamesPlayed(player: {
  fantasy?: { games?: number; gamesPlayed?: number }
  stats: { gamesPlayed?: number }
}): number {
  // Never use gamesStarted
  return (
    player.stats.gamesPlayed ||
    player.fantasy?.gamesPlayed ||
    player.fantasy?.games ||
    1
  )
}

export function computeValueRaw(
  avgPts: number,
  gamesPlayed: number,
  teamGames: number,
  position: Position
): { valueRaw: number; availability: number } {
  const availability = Math.min(1, Math.max(0, gamesPlayed / Math.max(teamGames, 1)))
  const posW = PPR_POSITION_VALUE[position] ?? 1
  const valueRaw = avgPts * availability * posW
  return { valueRaw, availability }
}

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
    const games = resolveGamesPlayed(p)
    const avgPts = p.fantasy?.avgPts ?? 0
    const teamGames = resolveTeamGames(lake, p)
    const { valueRaw, availability } = computeValueRaw(avgPts, games, teamGames, p.position)
    rows.push({ kind: 'player', index, position: p.position, avgPts, games, valueRaw, availability })
  })

  lake.defenses.forEach((d, index) => {
    const games = resolveGamesPlayed({
      fantasy: d.fantasy,
      stats: d.stats,
    })
    const avgPts = d.fantasy?.avgPts ?? 0
    const teamGames = resolveTeamGames(lake, { fantasy: d.fantasy, stats: d.stats })
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

  const rankedPlayers = [...players].sort((a, b) => (b.valueGrade ?? 0) - (a.valueGrade ?? 0))
  rankedPlayers.forEach((p, i) => {
    const target = players.find((x) => x.id === p.id)
    if (target) target.rankValue = i + 1
  })

  const rankedDef = [...defenses].sort((a, b) => (b.valueGrade ?? 0) - (a.valueGrade ?? 0))
  rankedDef.forEach((d, i) => {
    const target = defenses.find((x) => x.id === d.id)
    if (target) target.rankValue = i + 1
  })

  const allEntities = [
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

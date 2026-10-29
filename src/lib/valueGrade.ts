/**
 * Cross-position fantasy value rating for full-PPR leagues.
 *
 * Combines:
 *  1. Scoring output — season average PPR points per game (using games played)
 *  2. Availability — gamesPlayed / teamGamesPlayed (not games started, not week #)
 *  3. Positional value — PPR scarcity weights by position
 *
 * Never overwrites position-relative `grade` / `gradeLabel` / DST `rank`.
 *
 * Grades use within-pool min-max on valueRaw (same idea as RPS), not rank
 * against a fixed 1600-player pool — that collapsed top players to ~100.
 *
 * Label bands (shared with pos grade + RPS):
 *   80–100 Elite · 65–79 Great · 50–64 Solid · 30–49 Average · <30 Below
 */

import type { Position, DataLake } from './types'
import { gradeLabel } from './grading'

export const PPR_POSITION_VALUE: Record<Position, number> = {
  RB: 1.2,
  WR: 1.15,
  TE: 1.08,
  QB: 0.88,
  DST: 0.72,
  K: 0.45,
}

/**
 * Min-max to 0–100 on the actual metric values in this pool.
 * Preserves gaps (e.g. 31 vs 27 PPG) instead of rank steps of ~0.5.
 */
function valueNormalize(values: number[]): number[] {
  if (!values.length) return []
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  return values.map((v) => Math.round(((v - mn) / range) * 1000) / 10)
}

/** League-wide estimate of how many team games have been played so far. */
function leagueTeamGamesPlayed(lake: DataLake): number {
  const fromPlayers = lake.players
    .map((p) => p.stats.teamGamesPlayed || p.fantasy?.teamGamesPlayed || 0)
    .filter((n) => n > 0)
  const fromDst = lake.defenses
    .map((d) => d.stats.gamesPlayed || d.fantasy?.gamesPlayed || d.fantasy?.games || 0)
    .filter((n) => n > 0)
  const all = [...fromPlayers, ...fromDst]
  if (!all.length) return 1
  return Math.max(...all, 1)
}

function resolveTeamGames(
  lake: DataLake,
  player: {
    position?: Position
    fantasy?: { games?: number; teamGamesPlayed?: number; gamesPlayed?: number }
    stats: { gamesPlayed?: number; teamGamesPlayed?: number }
  },
  leagueTgp: number
): number {
  const explicit =
    player.fantasy?.teamGamesPlayed ||
    player.stats.teamGamesPlayed ||
    0
  if (explicit > 0) return explicit

  if (player.position === 'DST') {
    const gp =
      player.stats.gamesPlayed ||
      player.fantasy?.gamesPlayed ||
      player.fantasy?.games ||
      0
    return Math.max(gp, leagueTgp, 1)
  }

  const gp =
    player.stats.gamesPlayed ||
    player.fantasy?.gamesPlayed ||
    player.fantasy?.games ||
    0
  return Math.max(gp, leagueTgp, 1)
}

function resolveGamesPlayed(player: {
  position?: Position
  fantasy?: { games?: number; gamesPlayed?: number }
  stats: { gamesPlayed?: number }
}): number {
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
  if (position === 'DST') {
    const posW = PPR_POSITION_VALUE.DST
    return { valueRaw: avgPts * posW, availability: 1 }
  }
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

  const leagueTgp = leagueTeamGamesPlayed(lake)
  const rows: Row[] = []

  lake.players.forEach((p, index) => {
    const games = resolveGamesPlayed(p)
    const avgPts = p.fantasy?.avgPts ?? 0
    const teamGames = resolveTeamGames(lake, p, leagueTgp)
    const { valueRaw, availability } = computeValueRaw(
      avgPts,
      games,
      teamGames,
      p.position
    )
    rows.push({
      kind: 'player',
      index,
      position: p.position,
      avgPts,
      games,
      valueRaw,
      availability,
    })
  })

  lake.defenses.forEach((d, index) => {
    const games = resolveGamesPlayed({ fantasy: d.fantasy, stats: d.stats, position: 'DST' })
    const avgPts = d.fantasy?.avgPts ?? 0
    const teamGames = resolveTeamGames(
      lake,
      { fantasy: d.fantasy, stats: d.stats, position: 'DST' },
      leagueTgp
    )
    const { valueRaw, availability } = computeValueRaw(avgPts, games, teamGames, 'DST')
    rows.push({
      kind: 'dst',
      index,
      position: 'DST',
      avgPts,
      games,
      valueRaw,
      availability,
    })
  })

  const norms = valueNormalize(rows.map((r) => r.valueRaw))
  const players = lake.players.map((p) => ({ ...p }))
  const defenses = lake.defenses.map((d) => ({ ...d }))

  rows.forEach((r, i) => {
    const valueGrade = norms[i]
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
    if (target) {
      target.rankValue = i + 1
      target.rankOverall = i + 1
    }
  })

  const rankedDefByPos = [...defenses].sort((a, b) => b.grade - a.grade)
  rankedDefByPos.forEach((d, i) => {
    const target = defenses.find((x) => x.id === d.id)
    if (target) {
      target.rankValue = i + 1
      target.rank = i + 1
    }
  })

  return { ...lake, players, defenses }
}

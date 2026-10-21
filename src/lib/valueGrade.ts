/**
 * Cross-position fantasy value rating for full-PPR leagues.
 *
 * Combines:
 *  1. Scoring output — season average PPR points per game (using games played)
 *  2. Availability — gamesPlayed / teamGamesPlayed (not games started, not week #)
 *  3. Positional value — PPR scarcity weights by position
 *
 * Never overwrites position-relative `grade` / `gradeLabel` / DST `rank`.
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

/** Active-player pool for cross-position value ranks. */
const LEAGUE_POOL = 1600

/**
 * Rank vs full-league pool so a truncated sample (top scorers only)
 * does not force the worst in-sample player to ~0.
 */
function rankNormalize(values: number[], populationSize: number): number[] {
  if (!values.length) return []
  const denom = Math.max(populationSize, 1)
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
  const out = new Array(values.length)
  order.forEach((item, rank0) => {
    const score = 100 * (1 - rank0 / denom)
    out[item.i] = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10
  })
  return out
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

  const norms = rankNormalize(
    rows.map((r) => r.valueRaw),
    LEAGUE_POOL
  )
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

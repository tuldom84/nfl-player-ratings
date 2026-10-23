/**
 * Weighted normalized grading for PPR fantasy football.
 *
 * Methodology:
 * 1. Compute raw fantasy points contribution from key stats using standard PPR scoring.
 * 2. Per-position, collect the distribution of that raw value across the player pool.
 * 3. Min-max normalize to 0-100 (with small epsilon to avoid division by zero).
 * 4. Apply position-specific weights that emphasize volume + efficiency metrics
 *    that historically drive PPR scoring.
 *
 * Weights are tuned for half/full-PPR value (receptions highly rewarded).
 */

import type { PlayerStats, Position } from './types'

/** Standard PPR scoring coefficients (full PPR) */
const PPR = {
  passYd: 0.04,
  passTD: 4,
  int: -2,
  rushYd: 0.1,
  rushTD: 6,
  rec: 1,
  recYd: 0.1,
  recTD: 6,
  // DST
  sack: 1,
  defInt: 2,
  fumRec: 2,
  defTD: 6,
  // rough points-allowed tiers approximated later
} as const

/** Position-specific relative weights for the composite grade (sum ≈ 1) */
const POSITION_WEIGHTS: Record<Position, Record<string, number>> = {
  QB: {
    passYds: 0.35,
    passTDs: 0.30,
    interceptions: 0.15, // inverted
    rushYds: 0.12,
    rushTDs: 0.08,
  },
  RB: {
    rushYds: 0.30,
    rushTDs: 0.22,
    receptions: 0.20,
    recYds: 0.18,
    recTDs: 0.10,
  },
  WR: {
    receptions: 0.28,
    recYds: 0.30,
    recTDs: 0.22,
    targets: 0.12,
    rushYds: 0.08, // gadget plays
  },
  TE: {
    receptions: 0.30,
    recYds: 0.28,
    recTDs: 0.25,
    targets: 0.17,
  },
  K: {
    fgMade: 0.55,
    xpMade: 0.30,
    fgAtt: 0.15, // volume of opportunities
  },
  DST: {
    sacks: 0.25,
    ints: 0.22,
    fumblesRec: 0.18,
    defTDs: 0.20,
    ptsAllowed: 0.15, // inverted
  },
}

function safe(val: number | undefined): number {
  return typeof val === 'number' && !Number.isNaN(val) ? val : 0
}

/** Raw fantasy-point contribution used as the primary signal */
export function computeRawPprContribution(stats: PlayerStats, pos: Position): number {
  const s = stats
  let pts = 0

  if (pos === 'QB') {
    pts += safe(s.passYds) * PPR.passYd
    pts += safe(s.passTDs) * PPR.passTD
    pts += safe(s.interceptions) * PPR.int
    pts += safe(s.rushYds) * PPR.rushYd
    pts += safe(s.rushTDs) * PPR.rushTD
  } else if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    pts += safe(s.rushYds) * PPR.rushYd
    pts += safe(s.rushTDs) * PPR.rushTD
    pts += safe(s.receptions) * PPR.rec
    pts += safe(s.recYds) * PPR.recYd
    pts += safe(s.recTDs) * PPR.recTD
  } else if (pos === 'K') {
    // Approximate: 3 pts per FG + 1 per XP (simplified)
    pts += safe(s.fgMade) * 3
    pts += safe(s.xpMade) * 1
  } else if (pos === 'DST') {
    pts += safe(s.sacks) * PPR.sack
    pts += safe(s.ints) * PPR.defInt
    pts += safe(s.fumblesRec) * PPR.fumRec
    pts += safe(s.defTDs) * PPR.defTD
    // Crude points-allowed adjustment (lower is better)
    const pa = safe(s.ptsAllowed)
    if (pa > 0) {
      if (pa < 14) pts += 6
      else if (pa < 18) pts += 4
      else if (pa < 22) pts += 2
      else if (pa < 26) pts += 0
      else if (pa <= 29.99) pts += -2
      else if (pa >= 30) pts -= 4
    }
  }

  // Prefer per-game when gamesPlayed is available
  const gp = safe(s.gamesPlayed) || 1
  return pts / Math.max(gp, 1)
}

/** Min-max normalize an array of values to 0-100 */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values.map((v) => ((v - min) / range) * 100)
}

export function gradeLabel(score: number): string {
  if (score >= 80) return 'Elite'
  if (score >= 65) return 'Great'
  if (score >= 50) return 'Solid'
  if (score >= 30) return 'Average'
  return 'Below'
}

/**
 * Compute position-relative grades for a list of players of the same position.
 * Returns new array with grade + gradeLabel populated.
 */
export function gradePlayersByPosition<T extends { stats: PlayerStats; position: Position }>(
  players: T[]
): (T & { grade: number; gradeLabel: string })[] {
  if (players.length === 0) return []

  const pos = players[0].position
  const rawScores = players.map((p) => computeRawPprContribution(p.stats, pos))
  const normalized = normalize(rawScores)

  return players.map((p, i) => ({
    ...p,
    grade: Math.round(normalized[i] * 10) / 10,
    gradeLabel: gradeLabel(normalized[i]),
  }))
}

/**
 * Convenience: grade a mixed pool by grouping on position first.
 */
export function gradeAllPlayers<T extends { stats: PlayerStats; position: Position }>(
  players: T[]
): (T & { grade: number; gradeLabel: string })[] {
  const byPos = new Map<Position, T[]>()
  for (const p of players) {
    const list = byPos.get(p.position) || []
    list.push(p)
    byPos.set(p.position, list)
  }

  const result: (T & { grade: number; gradeLabel: string })[] = []
  for (const [, group] of byPos) {
    result.push(...gradePlayersByPosition(group))
  }
  return result
}

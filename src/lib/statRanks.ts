import type { Player, TeamDefense, TeamOffense, Position, PlayerStats, OffenseStats } from './types'

/** Lower is better for these stats when ranking. */
const LOWER_IS_BETTER = new Set([
  'interceptions',
  'fumblesLost',
  'sacks', // sacks taken (QB)
  'fgMissed',
  'ptsAllowed',
  'yardsAllowed',
  'sacksAllowed',
])

/**
 * Rank these as rates (total / gamesPlayed), not season totals.
 * Critical for PA/YA mid-season when teams have played different numbers of games.
 */
const RANK_AS_PER_GAME = new Set(['ptsAllowed', 'yardsAllowed', 'sacksAllowed'])

export type StatKey =
  | keyof PlayerStats
  | keyof OffenseStats
  | 'passerRating'
  | 'compPct'
  | 'ypa'
  | 'ypc'
  | 'catchRate'
  | 'ypr'
  | 'fgPct'
  | 'fg0_39'
  | 'fgMadeTotal'

export type StatRowDef = {
  label: string
  /** Season total (or rate) — for per-game rank keys this should be the season total. */
  value: number | undefined
  /** Field key among peers for ranking. */
  key?: StatKey
  season: number | string
  perGame?: number | string
  /** If true, rank is not shown (e.g. games played). */
  noRank?: boolean
  /** Games played for this subject — required when key is ranked per-game. */
  gamesPlayed?: number
}

function num(v: unknown): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

function gamesPlayedFrom(stats: Record<string, number | undefined>): number {
  const gp = num(stats.gamesPlayed)
  return gp > 0 ? gp : 1
}

export function ranksAsPerGame(key?: string): boolean {
  return key ? RANK_AS_PER_GAME.has(key) : false
}

/**
 * Rank of `value` among `values` (1 = best).
 * Uses strict comparison only — never exact float equality (avoids
 * rounded display values ranking a team worse than its own peer rate).
 * Ties: equal values share the same rank (competition ranking).
 */
export function rankAmong(values: number[], value: number, lowerIsBetter = false): number {
  if (!values.length) return 1
  let better = 0
  for (const v of values) {
    if (lowerIsBetter ? v < value : v > value) better++
  }
  return better + 1
}

export function isLowerBetter(key?: string): boolean {
  return key ? LOWER_IS_BETTER.has(key) : false
}

/** Extract comparable numeric for a peer given a StatKey (raw, not rate-adjusted). */
export function peerStatValue(
  stats: Record<string, number | undefined>,
  key: StatKey,
  pos?: Position
): number | undefined {
  if (key === 'passerRating') {
    const v = stats['passerRating']
    return typeof v === 'number' && !Number.isNaN(v) ? v : undefined
  }
  if (key === 'compPct') {
    const att = num(stats.passAtt)
    if (att <= 0) return undefined
    return ((num(stats.completions) / att) * 1000) / 10
  }
  if (key === 'ypa') {
    const att = num(stats.passAtt)
    if (att <= 0) return undefined
    return Math.round((num(stats.passYds) / att) * 100) / 100
  }
  if (key === 'ypc') {
    const car = num(stats.carries)
    if (car <= 0) return undefined
    return Math.round((num(stats.rushYds) / car) * 100) / 100
  }
  if (key === 'catchRate') {
    const t = num(stats.targets)
    if (t <= 0) return undefined
    return Math.round((num(stats.receptions) / t) * 1000) / 10
  }
  if (key === 'ypr') {
    const r = num(stats.receptions)
    if (r <= 0) return undefined
    return Math.round((num(stats.recYds) / r) * 100) / 100
  }
  if (key === 'fgPct') {
    const made =
      num(stats.fgMade1_19) +
      num(stats.fgMade20_29) +
      num(stats.fgMade30_39) +
      num(stats.fgMade40_49) +
      num(stats.fgMade50_59) +
      num(stats.fgMade60) || num(stats.fgMade)
    const att = num(stats.fgAtt) || made
    if (att <= 0) return undefined
    return Math.round((made / att) * 1000) / 10
  }
  if (key === 'fg0_39') {
    return num(stats.fgMade1_19) + num(stats.fgMade20_29) + num(stats.fgMade30_39)
  }
  if (key === 'fgMadeTotal') {
    return (
      num(stats.fgMade1_19) +
        num(stats.fgMade20_29) +
        num(stats.fgMade30_39) +
        num(stats.fgMade40_49) +
        num(stats.fgMade50_59) +
        num(stats.fgMade60) || num(stats.fgMade)
    )
  }
  const v = stats[key as string]
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined
}

/** Value used for ranking: unrounded per-game rate for PA/YA/etc., otherwise raw. */
export function peerComparableValue(
  stats: Record<string, number | undefined>,
  key: StatKey
): number | undefined {
  const v = peerStatValue(stats, key)
  if (v == null) return undefined
  if (RANK_AS_PER_GAME.has(key)) {
    return v / gamesPlayedFrom(stats)
  }
  return v
}

/**
 * Subject ranking metric for a row.
 * For per-game keys: always seasonTotal / gamesPlayed (never the rounded display perGame).
 */
function subjectComparableValue(row: StatRowDef): number | undefined {
  if (row.value == null || typeof row.value !== 'number') return undefined
  if (!row.key || !ranksAsPerGame(row.key)) return row.value

  const gp =
    row.gamesPlayed && row.gamesPlayed > 0
      ? row.gamesPlayed
      : typeof row.season === 'number' && row.value !== 0 && typeof row.perGame === 'number' && row.perGame !== 0
        ? // recover games if only rate was stored as value
          Math.round(row.season / row.perGame)
        : 0

  // Prefer season total from `season` field when value was set to rounded per-game
  const seasonTotal =
    typeof row.season === 'number' ? row.season : row.value

  if (gp > 0) return seasonTotal / gp

  // Last resort: if value is already a rate and no gp, use it
  return row.value
}

/**
 * Attach position rank for each row among `peers` (same position pool).
 * PA / YA / sacksAllowed are ranked on an unrounded per-game basis.
 */
export function withStatRanks(
  rows: StatRowDef[],
  peers: Array<{ stats: Record<string, number | undefined> }>,
  peerCount?: number
): (StatRowDef & { rank?: number; of?: number })[] {
  const n = peerCount ?? peers.length
  return rows.map((row) => {
    if (row.noRank || row.key == null || row.value == null || typeof row.value !== 'number') {
      return { ...row }
    }
    const lower = isLowerBetter(row.key)
    const vals: number[] = []
    for (const p of peers) {
      const v = peerComparableValue(p.stats, row.key)
      if (v != null) vals.push(v)
    }
    if (!vals.length) return { ...row }

    const subject = subjectComparableValue(row)
    if (subject == null) return { ...row }

    const rank = rankAmong(vals, subject, lower)
    return { ...row, rank, of: Math.max(n, vals.length) }
  })
}

export function rankByField<T>(
  items: T[],
  get: (t: T) => number | undefined,
  lowerIsBetter = false
): Map<T, number> {
  const scored = items
    .map((t) => ({ t, v: get(t) }))
    .filter((x): x is { t: T; v: number } => x.v != null)
  scored.sort((a, b) => (lowerIsBetter ? a.v - b.v : b.v - a.v))
  const map = new Map<T, number>()
  scored.forEach((x, i) => map.set(x.t, i + 1))
  return map
}

export function formatRank(rank?: number, of?: number): string {
  if (rank == null) return '—'
  if (of != null) return `#${rank}`
  return `#${rank}`
}

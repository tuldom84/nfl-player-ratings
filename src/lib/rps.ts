/**
 * Real Position Score (RPS) — real football value at position (not fantasy).
 * Uses per-game averages. Separate weights per position.
 * Availability penalty only if player missed more than 80% of team games.
 *
 * Efficiency rates (catch %, YPR, YPC, passer rating, FG%) are volume-weighted
 * so a 1-catch 29-yard TE cannot outscore every starter on rate luck.
 * Full efficiency weight at position-specific sample thresholds.
 *
 * Note: ESPN QBR is not in the public data lake; NFL passer rating is computed
 * from completions/attempts/yards/TDs/INTs and weighted as the primary efficiency metric.
 *
 * Label bands (shared with pos grade + value):
 *   80–100 Elite · 65–79 Great · 50–64 Solid · 30–49 Average · <30 Below
 */

import type { DataLake, Position, PlayerStats } from './types'
import { gradeLabel } from './grading'

const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

function pg(total: number, games: number): number {
  return total / Math.max(games, 1)
}

/**
 * Reliability weight for rate stats. 0 with no sample → 1 at `fullAt` opportunities.
 * e.g. 1 target with fullAt=15 → ~0.067 (almost no efficiency credit).
 */
function volWeight(sample: number, fullAt: number): number {
  if (fullAt <= 0) return 1
  return Math.min(1, Math.max(0, sample / fullAt))
}

/** Official NFL passer rating (0–158.3). */
export function nflPasserRating(
  completions: number,
  attempts: number,
  yards: number,
  tds: number,
  ints: number
): number {
  if (attempts <= 0) return 0
  const clamp = (x: number) => Math.min(2.375, Math.max(0, x))
  const a = clamp(((completions / attempts) - 0.3) * 5)
  const b = clamp(((yards / attempts) - 3) * 0.25)
  const c = clamp((tds / attempts) * 20)
  const d = clamp(2.375 - (ints / attempts) * 25)
  return Math.round(((a + b + c + d) / 6) * 1000) / 10
}

function normalize(values: number[]): number[] {
  if (!values.length) return []
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  return values.map((v) => ((v - mn) / range) * 100)
}

/** Raw RPS before position-relative normalization (higher = better). */
export function rawRps(position: Position, stats: PlayerStats, games: number): number {
  const g = Math.max(games, 1)
  const st = stats as Record<string, number | undefined>
  const fumPg = pg(safe(st.fumblesLost), g)

  if (position === 'QB') {
    const att = safe(stats.passAtt)
    const cmp = safe(stats.completions)
    const pYds = safe(stats.passYds)
    const pTD = safe(stats.passTDs)
    const ints = safe(stats.interceptions)
    const rating = nflPasserRating(cmp, att, pYds, pTD, ints)
    const compPct = att > 0 ? (cmp / att) * 100 : 0
    const ypa = att > 0 ? pYds / att : 0
    // Full efficiency weight at ~50 pass attempts (~3–4 full games)
    const effW = volWeight(att, 50)
    const passYpg = pg(pYds, g)
    const passTDpg = pg(pTD, g)
    const rushYpg = pg(safe(stats.rushYds), g)
    const rushTDpg = pg(safe(stats.rushTDs), g)
    const intPg = pg(ints, g)
    const sackPg = pg(safe(stats.sacks), g)
    const tdProduction = passTDpg * 3 + rushTDpg * 1

    return (
      rating * 0.4 * effW +
      compPct * 0.12 * effW +
      ypa * 8 * 0.1 * effW +
      passYpg * 0.08 +
      tdProduction * 12 +
      rushYpg * 0.06 +
      intPg * -25 +
      fumPg * -15 +
      sackPg * -3
    )
  }

  if (position === 'RB') {
    const carries = safe(stats.carries)
    const rushYds = safe(stats.rushYds)
    const rushTD = safe(stats.rushTDs)
    const rec = safe(stats.receptions)
    const recYds = safe(stats.recYds)
    const recTD = safe(stats.recTDs)
    const ypc = carries > 0 ? rushYds / carries : 0
    // Full YPC weight at ~40 carries
    const ypcW = volWeight(carries, 40)
    const rushYpg = pg(rushYds, g)
    const rushTDpg = pg(rushTD, g)
    const recYpg = pg(recYds, g)
    const recPg = pg(rec, g)
    const recTDpg = pg(recTD, g)
    return (
      rushYpg * 0.35 +
      ypc * 8 * ypcW +
      rushTDpg * 18 +
      recYpg * 0.2 +
      recPg * 4 +
      recTDpg * 14 +
      fumPg * -15
    )
  }

  if (position === 'WR') {
    const targets = safe(stats.targets)
    const rec = safe(stats.receptions)
    const recYds = safe(stats.recYds)
    const recTD = safe(stats.recTDs)
    const catchRate = targets > 0 ? rec / targets : 0
    const ypr = rec > 0 ? recYds / rec : 0
    // Full efficiency weight at ~15 targets
    const effW = volWeight(targets, 15)
    const recYpg = pg(recYds, g)
    const recPg = pg(rec, g)
    const tgtPg = pg(targets, g)
    const tdPg = pg(recTD, g)
    const rushYpg = pg(safe(stats.rushYds), g)
    const rushTDpg = pg(safe(stats.rushTDs), g)

    return (
      recYpg * 0.4 +
      ypr * 3 * effW +
      catchRate * 40 * effW +
      tdPg * 22 +
      recPg * 3 +
      tgtPg * 1.5 +
      rushYpg * 0.15 +
      rushTDpg * 10 +
      fumPg * -15
    )
  }

  if (position === 'TE') {
    const targets = safe(stats.targets)
    const rec = safe(stats.receptions)
    const recYds = safe(stats.recYds)
    const recTD = safe(stats.recTDs)
    const catchRate = targets > 0 ? rec / targets : 0
    const ypr = rec > 0 ? recYds / rec : 0
    // Full efficiency weight at ~12 targets (TEs get fewer looks)
    const effW = volWeight(Math.max(targets, rec), 12)
    const recYpg = pg(recYds, g)
    const recPg = pg(rec, g)
    const tdPg = pg(recTD, g)

    return (
      recYpg * 0.45 +
      ypr * 3.5 * effW +
      catchRate * 45 * effW +
      tdPg * 24 +
      recPg * 4 +
      fumPg * -15
    )
  }

  if (position === 'K') {
    const madeBuckets =
      safe(st.fgMade1_19) +
      safe(st.fgMade20_29) +
      safe(st.fgMade30_39) +
      safe(st.fgMade40_49) +
      safe(st.fgMade50_59) +
      safe(st.fgMade60)
    const made = madeBuckets > 0 ? madeBuckets : safe(stats.fgMade)
    const att = safe(stats.fgAtt) || made
    const fgPct = att > 0 ? made / att : 0
    // Full FG% weight at ~8 attempts
    const pctW = volWeight(att, 8)
    const longMade = safe(st.fgMade50_59) + safe(st.fgMade60)
    const fgPg = pg(made, g)
    const longPg = pg(longMade, g)
    const xpPg = pg(safe(stats.xpMade), g)
    const missPg = pg(Math.max(0, att - made), g)

    return fgPct * 50 * pctW + fgPg * 12 + longPg * 18 + xpPg * 4 + missPg * -15 + fumPg * -18
  }

  // DST
  if (position === 'DST') {
    const paPg = pg(safe(stats.ptsAllowed), g)
    const yaPg = pg(safe(stats.yardsAllowed), g)
    const sackPg = pg(safe(stats.sacks), g)
    const intPg = pg(safe(stats.ints), g)
    const frPg = pg(safe(stats.fumblesRec), g)
    const ffPg = pg(safe(st.fumblesForced), g)
    const tdPg = pg(safe(stats.defTDs), g)
    const safetyPg = pg(safe(st.safeties), g)
    return (
      (30 - paPg) * 2.5 +
      (400 - yaPg) * 0.08 +
      sackPg * 12 +
      (intPg + frPg) * 18 +
      ffPg * 6 +
      tdPg * 25 +
      safetyPg * 15
    )
  }

  return 0
}

/**
 * Only penalize if availability < 20% (missed more than 80% of team games).
 * Divide RPS by games missed in that case.
 */
function availabilityAdjust(
  score: number,
  gamesPlayed: number,
  teamGames: number
): number {
  const tgp = Math.max(teamGames, 1)
  const gp = Math.max(0, gamesPlayed)
  const availability = gp / tgp
  if (availability >= 0.2) return score
  const missed = Math.max(1, tgp - gp)
  return score / missed
}

export function applyRps(lake: DataLake): DataLake {
  type Row = { kind: 'player' | 'dst'; index: number; position: Position; raw: number }

  const rows: Row[] = []

  lake.players.forEach((p, index) => {
    const games = Math.max(
      1,
      p.stats.gamesPlayed || p.fantasy?.gamesPlayed || p.fantasy?.games || 1
    )
    const teamGames = Math.max(
      games,
      p.stats.teamGamesPlayed || p.fantasy?.teamGamesPlayed || games
    )
    let raw = rawRps(p.position, p.stats, games)
    raw = availabilityAdjust(raw, games, teamGames)
    rows.push({ kind: 'player', index, position: p.position, raw })
  })

  lake.defenses.forEach((d, index) => {
    const games = Math.max(1, d.stats.gamesPlayed || d.fantasy?.games || 1)
    const raw = rawRps('DST', d.stats, games)
    rows.push({ kind: 'dst', index, position: 'DST', raw })
  })

  // Normalize within each position
  const byPos = new Map<Position, Row[]>()
  for (const r of rows) {
    const list = byPos.get(r.position) || []
    list.push(r)
    byPos.set(r.position, list)
  }

  const players = lake.players.map((p) => ({ ...p }))
  const defenses = lake.defenses.map((d) => ({ ...d }))

  for (const [, group] of byPos) {
    const norms = normalize(group.map((r) => r.raw))
    group.forEach((r, i) => {
      const rps = Math.round(norms[i] * 10) / 10
      const rpsLabel = gradeLabel(rps)
      if (r.kind === 'player') {
        players[r.index] = { ...players[r.index], rps, rpsLabel }
      } else {
        defenses[r.index] = { ...defenses[r.index], rps, rpsLabel }
      }
    })
  }

  return { ...lake, players, defenses }
}

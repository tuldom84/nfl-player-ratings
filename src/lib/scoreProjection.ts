/**
 * NFL game score projections for the Betting tab.
 *
 * Team score =
 *   (matchup-adjusted offensive TDs) × 6
 *   + (projected kicker FG made × TD factor) × 3
 *   + (adjusted TDs) × 1   // 1 XP per adjusted TD
 *   + (projected DST safeties) × 2
 *   − 1.0 conversion friction (missed XP / failed 2PT / rare scoring leakage)
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
 *   XP = adjusted TDs (one extra point per TD)
 *
 * Before the matchup factor, raw TDs are the selected-player sum. If that
 * sum is under 85% of the team's total TDs/g, raw TDs
 * become the average of the player sum and the team rate.
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
/** Flat per-team deduction for missed XP, failed 2PT, and similar scoring leakage. */
export const CONVERSION_FRICTION = 1
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

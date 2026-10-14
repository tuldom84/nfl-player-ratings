/**
 * League scoring settings from ESPN fantasy league screenshots.
 * Imported / inlined by sync-data.mjs for K and DST projections & grades.
 */
export const OFF = { passYd: 0.04, passTD: 4, int: -2, rushYd: 0.1, rushTD: 6, rec: 1, recYd: 0.1, recTD: 6 }

/** Kicker: XP 1; FG miss -1; 0-39:3, 40-49:4, 50-59:5, 60+:6 */
export const K_SCORE = { xpMade: 1, fgMiss: -1, fg0_39: 3, fg40_49: 4, fg50_59: 5, fg60: 6 }

/** DST: PA/YA brackets per game + turnovers/returns + 1 pt/sack */
export const DST_SCORE = {
  pa: [
    { max: 0, pts: 5 },
    { max: 6, pts: 4 },
    { max: 13, pts: 3 },
    { max: 17, pts: 1 },
    { max: 27, pts: 0 },
    { max: 34, pts: -1 },
    { max: 45, pts: -3 },
    { max: Infinity, pts: -5 },
  ],
  ya: [
    { max: 99, pts: 5 },
    { max: 199, pts: 3 },
    { max: 299, pts: 2 },
    { max: 399, pts: 0 },
    { max: 449, pts: -2 },
    { max: 499, pts: -3 },
    { max: 549, pts: -4 },
    { max: Infinity, pts: -5 },
  ],
  sack: 1,
  int: 2,
  fumRec: 2,
  fumForced: 1,
  safety: 2,
  onePtSafety: 2,
  twoPtReturn: 2,
  defTD: 6,
  blockedKick: 2,
}

export function bracketPts(table, value) {
  for (const row of table) {
    if (value <= row.max) return row.pts
  }
  return 0
}

export function scoreKicker(stats, safe) {
  const s = safe || ((v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0))
  const fg0 = s(stats.fgMade1_19) + s(stats.fgMade20_29) + s(stats.fgMade30_39)
  const fg40 = s(stats.fgMade40_49)
  const fg50 = s(stats.fgMade50_59)
  const fg60 = s(stats.fgMade60)
  const made = fg0 + fg40 + fg50 + fg60
  let miss = s(stats.fgMissed)
  if (!miss && s(stats.fgAtt) > 0) miss = Math.max(0, s(stats.fgAtt) - made)
  return (
    Math.round(
      (s(stats.xpMade) * K_SCORE.xpMade +
        miss * K_SCORE.fgMiss +
        fg0 * K_SCORE.fg0_39 +
        fg40 * K_SCORE.fg40_49 +
        fg50 * K_SCORE.fg50_59 +
        fg60 * K_SCORE.fg60) *
        10
    ) / 10
  )
}

export function scoreDstSeason(stats, safe) {
  const s = safe || ((v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0))
  let pts = 0
  pts += s(stats.sacks) * DST_SCORE.sack
  pts += s(stats.ints) * DST_SCORE.int
  pts += s(stats.fumblesRec) * DST_SCORE.fumRec
  pts += s(stats.fumblesForced) * DST_SCORE.fumForced
  pts += s(stats.safeties) * DST_SCORE.safety
  pts += s(stats.onePtSafeties) * DST_SCORE.onePtSafety
  pts += s(stats.twoPtReturns) * DST_SCORE.twoPtReturn
  pts += s(stats.defTDs) * DST_SCORE.defTD
  pts += s(stats.kicksBlocked) * DST_SCORE.blockedKick
  const logs = stats.gameLogs || []
  for (const g of logs) {
    pts += bracketPts(DST_SCORE.pa, s(g.ptsAllowed))
    pts += bracketPts(DST_SCORE.ya, s(g.yardsAllowed))
  }
  if (!logs.length) {
    const gp = Math.max(1, s(stats.gamesPlayed) || 1)
    pts += bracketPts(DST_SCORE.pa, s(stats.ptsAllowed) / gp) * gp
    pts += bracketPts(DST_SCORE.ya, s(stats.yardsAllowed) / gp) * gp
  }
  return Math.round(pts * 10) / 10
}

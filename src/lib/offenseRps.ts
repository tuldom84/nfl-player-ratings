/** Team offense Real Position Score — real football value (not fantasy). */

import type { DataLake, OffenseStats, TeamOffense } from './types'

function gradeLabel(score: number): string {
  if (score >= 90) return 'Elite'
  if (score >= 75) return 'Great'
  if (score >= 55) return 'Solid'
  if (score >= 35) return 'Average'
  return 'Below'
}

export function rawOffenseRps(o: OffenseStats): number {
  const g = Math.max(1, o.gamesPlayed || 1)
  const ppg = o.pointsPerGame || (o.totalPoints ? o.totalPoints / g : 0)
  const ypg = o.yardsPerGame || 0
  const passYpg = o.passYardsPerGame || 0
  const rushYpg = o.rushYardsPerGame || 0
  const tdPg = ((o.totalTDs || 0) || (o.passTDs || 0) + (o.rushTDs || 0)) / g
  const toPg = ((o.interceptions || 0) + (o.fumblesLost || 0)) / g
  const rating = o.qbRating || 0
  const sackPg = (o.sacksAllowed || 0) / g
  return (
    ppg * 3.2 +
    ypg * 0.12 +
    passYpg * 0.05 +
    rushYpg * 0.08 +
    tdPg * 14 +
    rating * 0.15 +
    toPg * -18 +
    sackPg * -4
  )
}

/**
 * DST weekly projection multiplier from opponent offense RPS.
 * Elite offense (100) ≈ 0.82 · Weak offense (0) ≈ 1.18
 */
export function dstVsOffenseMultiplier(oppOffenseRps: number): number {
  return Math.round((1.18 - (oppOffenseRps / 100) * 0.36) * 1000) / 1000
}

export function applyOffenseRps(lake: DataLake): DataLake {
  const list = lake.teamOffenses || []
  if (!list.length) return lake

  const raws = list.map((o) => rawOffenseRps(o.stats || {}))
  const mn = Math.min(...raws)
  const mx = Math.max(...raws)
  const range = mx - mn || 1

  const teamOffenses: TeamOffense[] = list
    .map((o, i) => {
      const rps = Math.round(((raws[i] - mn) / range) * 1000) / 10
      return { ...o, rps, rpsLabel: gradeLabel(rps) }
    })
    .sort((a, b) => b.rps - a.rps)
    .map((o, i) => ({ ...o, rank: i + 1 }))

  const byAbbr = new Map(teamOffenses.map((o) => [o.abbreviation, o]))

  // Re-apply DST projections from opponent offense when present
  const defenses = (lake.defenses || []).map((d) => {
    const f = d.fantasy
    if (!f) return d
    if (f.homeAway === 'bye' || f.opponent === 'BYE') {
      return {
        ...d,
        fantasy: {
          ...f,
          projectedPts: 0,
          matchupMultiplier: 0,
          matchupNote: 'BYE week',
        },
      }
    }
    const opp = f.opponent ? byAbbr.get(f.opponent) : undefined
    if (!opp) return d
    const mult = dstVsOffenseMultiplier(opp.rps)
    const projectedPts = Math.round((f.avgPts || 0) * mult * 10) / 10
    const matchupNote =
      mult < 0.95
        ? `Tough vs ${f.opponent} OFF (${opp.rpsLabel}, RPS ${opp.rps})`
        : mult > 1.05
          ? `Favorable vs ${f.opponent} OFF (${opp.rpsLabel}, RPS ${opp.rps})`
          : `Neutral vs ${f.opponent} OFF (RPS ${opp.rps})`
    return {
      ...d,
      fantasy: {
        ...f,
        projectedPts,
        matchupMultiplier: mult,
        oppOffenseRps: opp.rps,
        matchupNote,
      },
    }
  })

  return { ...lake, teamOffenses, defenses }
}

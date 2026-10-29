/**
 * Weekly fantasy projections from matchup context.
 *
 * Offense (QB/RB/WR/TE):
 *   - Yards factor = opponent DST yards-allowed/g ÷ league avg YA/g
 *   - TD factor    = opponent DST points-allowed/g ÷ league avg PA/g
 *   Apply yards factor to rush+rec (and pass for QB) yards/game
 *   Apply TD factor to rush+rec (and pass for QB) TDs/game
 *   Score adjusted components with user scoring settings
 *
 * DST:
 *   - Inverse of opponent offense PPG and YPG vs league averages
 *   Harder offense → lower DST projection
 */

import type { DataLake, Player, TeamDefense, Position, PlayerStats } from './types'
import type { ScoringSettings } from './scoringSettings'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const safe = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
const pg = (total: number, games: number) => total / Math.max(games, 1)

function injuryFactor(status?: string): number {
  if (!status || status === 'Active' || status === 'Unknown') return 1
  if (status === 'Questionable') return 0.85
  if (status === 'Doubtful') return 0.4
  if (status === 'Out' || status === 'Injured Reserve' || status === 'Suspension') return 0
  return 1
}

function leagueDstAverages(defenses: TeamDefense[]): { yaPg: number; paPg: number } {
  let ya = 0
  let pa = 0
  let n = 0
  for (const d of defenses) {
    const s = d.stats || {}
    const g = Math.max(1, s.gamesPlayed || s.gameLogs?.length || 1)
    const y = safe(s.yardsAllowed)
    const p = safe(s.ptsAllowed)
    if (y <= 0 && p <= 0) continue
    ya += y / g
    pa += p / g
    n++
  }
  if (!n) return { yaPg: 340, paPg: 22 }
  return { yaPg: ya / n, paPg: pa / n }
}

function leagueOffenseAverages(
  offenses: Array<{ stats?: { pointsPerGame?: number; yardsPerGame?: number; totalPoints?: number; totalYards?: number; gamesPlayed?: number } }>
): { ppg: number; ypg: number } {
  let ppg = 0
  let ypg = 0
  let n = 0
  for (const o of offenses) {
    const s = o.stats || {}
    const g = Math.max(1, s.gamesPlayed || 1)
    const p = s.pointsPerGame ?? (s.totalPoints != null ? s.totalPoints / g : 0)
    const y = s.yardsPerGame ?? (s.totalYards != null ? s.totalYards / g : 0)
    if (!p && !y) continue
    ppg += p
    ypg += y
    n++
  }
  if (!n) return { ppg: 22, ypg: 340 }
  return { ppg: ppg / n, ypg: ypg / n }
}

function dstRates(d: TeamDefense | undefined): { yaPg: number; paPg: number } | null {
  if (!d?.stats) return null
  const s = d.stats
  const g = Math.max(1, s.gamesPlayed || s.gameLogs?.length || 1)
  return {
    yaPg: safe(s.yardsAllowed) / g,
    paPg: safe(s.ptsAllowed) / g,
  }
}

/** Score adjusted skill-position rates with league settings. */
function scoreSkillRates(
  rates: {
    rushYds: number
    rushTDs: number
    rec: number
    recYds: number
    recTDs: number
    passYds?: number
    passTDs?: number
    ints?: number
  },
  pos: Position,
  settings: ScoringSettings
): number {
  const o = settings.offense
  let pts = 0
  if (pos === 'QB') {
    pts +=
      (rates.passYds || 0) * o.passYd +
      (rates.passTDs || 0) * o.passTD +
      (rates.ints || 0) * o.int +
      rates.rushYds * o.rushYd +
      rates.rushTDs * o.rushTD
  } else if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    pts +=
      rates.rushYds * o.rushYd +
      rates.rushTDs * o.rushTD +
      rates.rec * o.rec +
      rates.recYds * o.recYd +
      rates.recTDs * o.recTD
  }
  return Math.round(pts * 10) / 10
}

function projectPlayer(
  p: Player,
  oppDst: TeamDefense | undefined,
  league: { yaPg: number; paPg: number },
  settings: ScoringSettings
): { projectedPts: number; mult: number; note?: string } {
  const f = p.fantasy
  if (!f) return { projectedPts: 0, mult: 1 }
  if (f.homeAway === 'bye' || f.opponent === 'BYE') {
    return { projectedPts: 0, mult: 0, note: 'BYE week' }
  }

  const inj = injuryFactor(f.injuryStatus)
  if (inj === 0) {
    return {
      projectedPts: 0,
      mult: 0,
      note: f.injuryStatus ? `${f.injuryStatus}` : 'Out',
    }
  }

  const pos = p.position
  // Kickers: keep season avg × mild YA factor if available, else avg
  if (pos === 'K') {
    const rates = dstRates(oppDst)
    const ydsF = rates ? clamp(rates.yaPg / league.yaPg, 0.85, 1.15) : 1
    const pts = Math.round((f.avgPts || 0) * ydsF * inj * 10) / 10
    const note = rates
      ? `K vs ${f.opponent} DST (YA ${Math.round(rates.yaPg)}/g, ${(ydsF >= 1 ? '+' : '')}${Math.round((ydsF - 1) * 100)}% yds env)`
      : undefined
    return { projectedPts: pts, mult: ydsF, note }
  }

  if (pos !== 'QB' && pos !== 'RB' && pos !== 'WR' && pos !== 'TE') {
    return { projectedPts: Math.round((f.avgPts || 0) * inj * 10) / 10, mult: 1 }
  }

  const st = p.stats || {}
  const g = Math.max(1, st.gamesPlayed || f.gamesPlayed || f.games || 1)

  const rates = dstRates(oppDst)
  const ydsFactor = rates ? clamp(rates.yaPg / Math.max(league.yaPg, 1), 0.7, 1.35) : 1
  const tdFactor = rates ? clamp(rates.paPg / Math.max(league.paPg, 1), 0.7, 1.35) : 1

  // Base per-game production
  const base = {
    passYds: pg(safe(st.passYds), g),
    passTDs: pg(safe(st.passTDs), g),
    ints: pg(safe(st.interceptions), g),
    rushYds: pg(safe(st.rushYds), g),
    rushTDs: pg(safe(st.rushTDs), g),
    rec: pg(safe(st.receptions), g),
    recYds: pg(safe(st.recYds), g),
    recTDs: pg(safe(st.recTDs), g),
  }

  // Apply matchup: yards × YA factor, TDs × PA factor (receptions unchanged)
  const adj = {
    passYds: base.passYds * ydsFactor,
    passTDs: base.passTDs * tdFactor,
    ints: base.ints, // turnovers not boosted by soft DST in this model
    rushYds: base.rushYds * ydsFactor,
    rushTDs: base.rushTDs * tdFactor,
    rec: base.rec,
    recYds: base.recYds * ydsFactor,
    recTDs: base.recTDs * tdFactor,
  }

  let pts = scoreSkillRates(adj, pos, settings) * inj
  pts = Math.round(pts * 10) / 10

  // Effective overall multiplier vs unadjusted avg for UI
  const baseline = scoreSkillRates(base, pos, settings) || f.avgPts || 1
  const mult = baseline > 0 ? Math.round((pts / (baseline * inj || baseline)) * 1000) / 1000 : 1

  let note: string | undefined
  if (rates && f.opponent) {
    const yPct = Math.round((ydsFactor - 1) * 100)
    const tPct = Math.round((tdFactor - 1) * 100)
    const ySign = yPct >= 0 ? '+' : ''
    const tSign = tPct >= 0 ? '+' : ''
    note = `vs ${f.opponent} DST: YA ${Math.round(rates.yaPg)}/g (${ySign}${yPct}% yds), PA ${Math.round(rates.paPg)}/g (${tSign}${tPct}% TDs)`
  }

  return { projectedPts: pts, mult, note }
}

function projectDst(
  d: TeamDefense,
  oppOffense: { ppg: number; ypg: number; abbr: string; label?: string } | null,
  league: { ppg: number; ypg: number }
): { projectedPts: number; mult: number; note?: string } {
  const f = d.fantasy
  if (!f) return { projectedPts: 0, mult: 1 }
  if (f.homeAway === 'bye' || f.opponent === 'BYE') {
    return { projectedPts: 0, mult: 0, note: 'BYE week' }
  }

  const avg = f.avgPts || 0
  if (!oppOffense) {
    return { projectedPts: Math.round(avg * 10) / 10, mult: 1 }
  }

  // Stronger offense → harder DST matchup → lower projection (inverse factors)
  const ptsF = clamp(league.ppg / Math.max(oppOffense.ppg, 1), 0.7, 1.35)
  const ydsF = clamp(league.ypg / Math.max(oppOffense.ypg, 1), 0.7, 1.35)
  const mult = Math.round(((ptsF + ydsF) / 2) * 1000) / 1000
  const projectedPts = Math.round(avg * mult * 10) / 10

  const pPct = Math.round((1 / ptsF - 1) * 100) // offense strength vs avg
  const yPct = Math.round((1 / ydsF - 1) * 100)
  const note = `vs ${oppOffense.abbr} OFF: ${oppOffense.ppg.toFixed(1)} PPG / ${Math.round(oppOffense.ypg)} YPG (league ${league.ppg.toFixed(1)}/${Math.round(league.ypg)}) · proj ×${mult.toFixed(2)}`

  return { projectedPts, mult, note }
}

/** Recompute projectedPts for all players and DST from matchup rates. */
export function applyMatchupProjections(lake: DataLake, settings: ScoringSettings): DataLake {
  const defenses = lake.defenses || []
  const offenses = lake.teamOffenses || []
  const dstLeague = leagueDstAverages(defenses)
  const offLeague = leagueOffenseAverages(offenses)

  const dstByAbbr = new Map(defenses.map((d) => [d.abbreviation, d]))
  const offByAbbr = new Map(
    offenses.map((o) => {
      const s = o.stats || {}
      const g = Math.max(1, s.gamesPlayed || 1)
      const ppg = s.pointsPerGame ?? (s.totalPoints != null ? s.totalPoints / g : 0)
      const ypg = s.yardsPerGame ?? (s.totalYards != null ? s.totalYards / g : 0)
      return [
        o.abbreviation,
        {
          ppg,
          ypg,
          abbr: o.abbreviation,
          label: o.rpsLabel,
        },
      ] as const
    })
  )

  const players: Player[] = (lake.players || []).map((p) => {
    const f = p.fantasy
    if (!f) return p
    const oppAbbr = f.opponent
    const oppDst = oppAbbr && oppAbbr !== 'BYE' ? dstByAbbr.get(oppAbbr) : undefined
    const { projectedPts, mult, note } = projectPlayer(p, oppDst, dstLeague, settings)
    return {
      ...p,
      fantasy: {
        ...f,
        projectedPts,
        matchupMultiplier: mult,
        matchupNote: note ?? f.matchupNote,
        oppDstGrade: oppDst?.grade ?? f.oppDstGrade,
      },
    }
  })

  const nextDefenses: TeamDefense[] = defenses.map((d) => {
    const f = d.fantasy
    if (!f) return d
    const oppAbbr = f.opponent
    const opp =
      oppAbbr && oppAbbr !== 'BYE' ? offByAbbr.get(oppAbbr) ?? null : null
    const { projectedPts, mult, note } = projectDst(d, opp, offLeague)
    return {
      ...d,
      fantasy: {
        ...f,
        projectedPts,
        matchupMultiplier: mult,
        matchupNote: note ?? f.matchupNote,
        oppOffenseRps: f.oppOffenseRps,
      },
    }
  })

  return { ...lake, players, defenses: nextDefenses }
}

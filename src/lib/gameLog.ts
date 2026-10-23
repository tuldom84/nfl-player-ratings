/**
 * On-demand ESPN game logs → week / opponent / fantasy points.
 * Fetched only when the user opens the Game Log section (not in weekly sync).
 */
import type { Position } from './types'
import {
  loadScoringSettings,
  type ScoringSettings,
  type BracketRow,
} from './scoringSettings'

export type GameLogRow = {
  week: number
  opponent: string
  homeAway: 'home' | 'away' | 'neutral'
  fantasyPts: number
  result?: string
}

const SEASON = 2026

function num(v: unknown): number {
  if (v == null || v === '-' || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim()
  // "2-3" made-attempt → take made
  if (s.includes('-') && !s.startsWith('-')) {
    const made = Number(s.split('-')[0])
    return Number.isFinite(made) ? made : 0
  }
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseMadeAtt(v: unknown): { made: number; att: number } {
  const s = String(v ?? '').trim()
  if (!s || s === '-') return { made: 0, att: 0 }
  if (s.includes('-')) {
    const [a, b] = s.split('-')
    return { made: num(a), att: num(b) }
  }
  const n = num(s)
  return { made: n, att: n }
}

function bracketPts(table: BracketRow[], value: number): number {
  for (const row of table) {
    if (value <= row.max) return row.pts
  }
  return 0
}

function mapStats(names: string[], values: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  names.forEach((name, i) => {
    const raw = values[i]
    if (raw == null || raw === '-') return
    // Combined made-att keys
    if (name.includes('-') && String(raw).includes('-')) {
      const { made, att } = parseMadeAtt(raw)
      const [madeKey, attKey] = name.split('-')
      if (madeKey) out[madeKey] = made
      if (attKey) out[attKey] = att
      // Also store under full name for lookups
      out[name] = made
    } else {
      out[name] = num(raw)
    }
  })
  return out
}

export function scorePlayerGame(
  stats: Record<string, number>,
  position: Position,
  settings?: ScoringSettings
): number {
  const s = settings || loadScoringSettings()
  const off = s.offense
  const k = s.kicker
  let pts = 0

  if (position === 'QB') {
    pts +=
      (stats.passingYards || 0) * off.passYd +
      (stats.passingTouchdowns || 0) * off.passTD +
      (stats.interceptions || 0) * off.int +
      (stats.rushingYards || 0) * off.rushYd +
      (stats.rushingTouchdowns || 0) * off.rushTD
  } else if (position === 'RB' || position === 'WR' || position === 'TE') {
    pts +=
      (stats.rushingYards || 0) * off.rushYd +
      (stats.rushingTouchdowns || 0) * off.rushTD +
      (stats.receptions || 0) * off.rec +
      (stats.receivingYards || 0) * off.recYd +
      (stats.receivingTouchdowns || 0) * off.recTD
    // fumbles lost if present
    if (stats.fumblesLost) pts += stats.fumblesLost * -2
  } else if (position === 'K') {
    const fg0 =
      (stats.fieldGoalsMade1_19 || 0) +
      (stats.fieldGoalsMade20_29 || 0) +
      (stats.fieldGoalsMade30_39 || 0)
    const fg40 = stats.fieldGoalsMade40_49 || 0
    // ESPN uses fieldGoalsMade50 for 50+
    const fg50 = stats.fieldGoalsMade50 || stats.fieldGoalsMade50_59 || 0
    const fg60 = stats.fieldGoalsMade60 || 0
    const made = fg0 + fg40 + fg50 + fg60
    const att =
      (stats.fieldGoalAttempts1_19 || 0) +
      (stats.fieldGoalAttempts20_29 || 0) +
      (stats.fieldGoalAttempts30_39 || 0) +
      (stats.fieldGoalAttempts40_49 || 0) +
      (stats.fieldGoalAttempts50 || stats.fieldGoalAttempts50_59 || 0) +
      (stats.fieldGoalAttempts60 || 0) ||
      stats.fieldGoalAttempts ||
      made
    const miss = Math.max(0, att - made)
    const xp = stats.extraPointsMade || 0
    pts +=
      xp * k.xpMade +
      miss * k.fgMiss +
      fg0 * k.fg0_39 +
      fg40 * k.fg40_49 +
      fg50 * k.fg50_59 +
      fg60 * k.fg60
  }

  return Math.round(pts * 10) / 10
}

export function scoreDstGame(
  stats: {
    sacks?: number
    ints?: number
    fumblesRec?: number
    safeties?: number
    defTDs?: number
    ptsAllowed?: number
    yardsAllowed?: number
  },
  settings?: ScoringSettings
): number {
  const s = settings || loadScoringSettings()
  const d = s.dst
  let pts = 0
  pts += (stats.sacks || 0) * d.sack
  pts += (stats.ints || 0) * d.int
  pts += (stats.fumblesRec || 0) * d.fumRec
  pts += (stats.safeties || 0) * d.safety
  pts += (stats.defTDs || 0) * d.defTD
  if (stats.ptsAllowed != null) pts += bracketPts(d.pa, stats.ptsAllowed)
  if (stats.yardsAllowed != null) pts += bracketPts(d.ya, stats.yardsAllowed)
  return Math.round(pts * 10) / 10
}

type EspnGamelog = {
  names?: string[]
  events?: Record<
    string,
    {
      id: string
      week?: number
      atVs?: string
      gameResult?: string
      opponent?: { abbreviation?: string; displayName?: string }
    }
  >
  seasonTypes?: Array<{
    categories?: Array<{ events?: Array<{ eventId: string; stats: string[] }> }>
  }>
}

export async function fetchPlayerGameLog(
  athleteId: string,
  position: Position
): Promise<GameLogRow[]> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${athleteId}/gamelog?season=${SEASON}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Game log HTTP ${res.status}`)
  const data = (await res.json()) as EspnGamelog
  const names = data.names || []
  const eventsMeta = data.events || {}
  const catEvents =
    data.seasonTypes?.[0]?.categories?.[0]?.events ||
    data.seasonTypes?.flatMap((st) => st.categories?.flatMap((c) => c.events || []) || []) ||
    []

  const settings = loadScoringSettings()
  const rows: GameLogRow[] = []

  for (const ev of catEvents) {
    const meta = eventsMeta[ev.eventId]
    if (!meta) continue
    const week = meta.week
    if (week == null || week < 1) continue
    const stats = mapStats(names, ev.stats || [])
    const opp =
      meta.opponent?.abbreviation ||
      meta.opponent?.displayName?.slice(0, 3)?.toUpperCase() ||
      '—'
    const atVs = (meta.atVs || '').toLowerCase()
    const homeAway: GameLogRow['homeAway'] =
      atVs === '@' || atVs === 'at' ? 'away' : atVs === 'vs' ? 'home' : 'neutral'
    rows.push({
      week,
      opponent: opp,
      homeAway,
      fantasyPts: scorePlayerGame(stats, position, settings),
      result: meta.gameResult,
    })
  }

  rows.sort((a, b) => a.week - b.week)
  return rows
}

/** DST: team schedule + per-game summary boxscore (on demand). */
export async function fetchDstGameLog(teamId: string): Promise<GameLogRow[]> {
  const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${SEASON}`
  const res = await fetch(scheduleUrl)
  if (!res.ok) throw new Error(`DST schedule HTTP ${res.status}`)
  const schedule = await res.json()
  const events: Array<Record<string, unknown>> = schedule.events || []
  const settings = loadScoringSettings()
  const rows: GameLogRow[] = []

  for (const e of events) {
    const comps = (e.competitions as Array<Record<string, unknown>>) || []
    if (!comps.length) continue
    const comp = comps[0]
    const status = (comp.status as { type?: { completed?: boolean } }) || {}
    if (!status.type?.completed) continue

    const weekObj = e.week as { number?: number } | number | undefined
    const week = typeof weekObj === 'number' ? weekObj : weekObj?.number
    if (week == null || week < 1) continue

    const competitors =
      (comp.competitors as Array<{
        homeAway?: string
        score?: string
        winner?: boolean
        team?: { id?: string; abbreviation?: string }
      }>) || []
    const self = competitors.find((c) => String(c.team?.id) === String(teamId))
    const opp = competitors.find((c) => String(c.team?.id) !== String(teamId))
    if (!self || !opp) continue

    const homeAway: GameLogRow['homeAway'] =
      self.homeAway === 'home' ? 'home' : self.homeAway === 'away' ? 'away' : 'neutral'

    // Pull boxscore for defensive-relevant stats
    let ptsAllowed = num(opp.score)
    let yardsAllowed = 0
    let sacks = 0
    let ints = 0
    let fumblesRec = 0
    let defTDs = 0
    let safeties = 0

    try {
      const eventId = String(e.id)
      const sumRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
      )
      if (sumRes.ok) {
        const summary = await sumRes.json()
        const teams = summary?.boxscore?.teams || []
        // Opponent offense = yards we allowed
        const oppBox = teams.find(
          (t: { team?: { id?: string } }) => String(t.team?.id) === String(opp.team?.id)
        )
        const selfBox = teams.find(
          (t: { team?: { id?: string } }) => String(t.team?.id) === String(teamId)
        )
        const oppStats: Array<{ name?: string; displayValue?: string; value?: number }> =
          oppBox?.statistics || []
        const selfStats: Array<{ name?: string; displayValue?: string; value?: number }> =
          selfBox?.statistics || []

        const findStat = (
          list: typeof oppStats,
          name: string
        ): string | number | undefined => {
          const hit = list.find((s) => (s.name || '').toLowerCase() === name.toLowerCase())
          return hit?.value ?? hit?.displayValue
        }

        yardsAllowed = num(findStat(oppStats, 'totalYards'))
        // Sacks by our defense ≈ opponent sacksYardsLost "2-12"
        const sackStr = String(findStat(oppStats, 'sacksYardsLost') ?? '')
        sacks = num(sackStr.split('-')[0])
        ints = num(findStat(oppStats, 'interceptions'))

        // Defensive TDs / fumble recoveries are harder; try scoringPlays
        const plays: Array<{
          team?: { id?: string }
          scoringType?: { name?: string }
          text?: string
        }> = summary?.scoringPlays || []
        for (const p of plays) {
          if (String(p.team?.id) !== String(teamId)) continue
          const t = (p.scoringType?.name || p.text || '').toLowerCase()
          if (t.includes('interception') || t.includes('fumble') || t.includes('return')) {
            if (t.includes('touchdown') || (p.text || '').toLowerCase().includes('touchdown')) {
              defTDs += 1
            }
          }
          if (t.includes('safety')) safeties += 1
        }

        // Fumble recoveries: not always in team box; leave 0 if unknown
        void selfStats
        void fumblesRec
      }
    } catch {
      // keep score-based PA only
    }

    rows.push({
      week,
      opponent: opp.team?.abbreviation || '—',
      homeAway,
      fantasyPts: scoreDstGame(
        {
          sacks,
          ints,
          fumblesRec,
          safeties,
          defTDs,
          ptsAllowed,
          yardsAllowed: yardsAllowed || undefined,
        },
        settings
      ),
      result: self.winner ? 'W' : self.winner === false ? 'L' : undefined,
    })

    // polite spacing between summary calls
    await new Promise((r) => setTimeout(r, 40))
  }

  rows.sort((a, b) => a.week - b.week)
  return rows
}

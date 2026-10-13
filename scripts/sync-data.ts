/**
 * Weekly data-sync job (intended to run every Tuesday).
 *
 * Pulls current-season NFL player & team defensive stats from ESPN's
 * public (unofficial) endpoints, computes weighted PPR grades, and
 * writes a single JSON "data-lake" snapshot to public/data/latest.json.
 *
 * Sources researched from GitHub projects:
 *  - cwendt94/espn-api
 *  - sejaldua/espn-api (endpoints.md)
 *  - aaronweldy/espn-openapi
 *  - pseudo-r/Public-ESPN-API
 *  - fenneh/espn-sports-api
 *
 * Key endpoints used:
 *  - https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams
 *  - https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete
 *  - https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes?...
 *  - Team statistics for DST
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { gradeAllPlayers, gradePlayersByPosition } from '../src/lib/grading'
import type { Player, TeamDefense, DataLake, PlayerStats, Position } from '../src/lib/types'

const SEASON = 2026
const DATA_DIR = join(process.cwd(), 'public', 'data')

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'nfl-player-ratings/1.0 (weekly-sync; contact via GitHub)',
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

/** Map ESPN position abbreviation to our Position type */
function mapPosition(pos: string | undefined): Position | null {
  if (!pos) return null
  const p = pos.toUpperCase()
  if (['QB'].includes(p)) return 'QB'
  if (['RB', 'FB'].includes(p)) return 'RB'
  if (['WR'].includes(p)) return 'WR'
  if (['TE'].includes(p)) return 'TE'
  if (['PK', 'K'].includes(p)) return 'K'
  return null
}

async function fetchLeaders(): Promise<any[]> {
  // Paginated leaders endpoint – fetch several pages of top statistical athletes
  const all: any[] = []
  for (let page = 1; page <= 6; page++) {
    try {
      const data = await fetchJson(
        `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete?limit=50&page=${page}`
      )
      if (data.athletes?.length) {
        all.push(...data.athletes)
      } else break
    } catch (e) {
      console.warn(`Leaders page ${page} failed`, e)
      break
    }
  }
  return all
}

async function fetchTeamList(): Promise<any[]> {
  const data = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams')
  return data?.sports?.[0]?.leagues?.[0]?.teams ?? []
}

/** Very lightweight extraction of common stat categories from ESPN athlete payload */
function extractStats(athleteEntry: any): PlayerStats {
  const stats: PlayerStats = { gamesPlayed: 0 }
  // ESPN structure varies; try common paths
  const categories = athleteEntry?.categories || athleteEntry?.stats?.categories || []
  for (const cat of categories) {
    const name = (cat.name || cat.displayName || '').toLowerCase()
    for (const s of cat.stats || []) {
      const abbrev = (s.abbreviation || s.name || '').toLowerCase()
      const val = Number(s.value ?? s.displayValue) || 0
      if (abbrev.includes('gp') || abbrev === 'g') stats.gamesPlayed = val
      if (abbrev === 'yds' && name.includes('pass')) stats.passYds = val
      if (abbrev === 'td' && name.includes('pass')) stats.passTDs = val
      if (abbrev === 'int') stats.interceptions = val
      if (abbrev === 'yds' && name.includes('rush')) stats.rushYds = val
      if (abbrev === 'td' && name.includes('rush')) stats.rushTDs = val
      if (abbrev === 'rec') stats.receptions = val
      if (abbrev === 'yds' && name.includes('rec')) stats.recYds = val
      if (abbrev === 'td' && name.includes('rec')) stats.recTDs = val
      if (abbrev === 'tgts' || abbrev === 'tar') stats.targets = val
      if (abbrev === 'fg') stats.fgMade = val
      if (abbrev === 'xp' || abbrev === 'xpm') stats.xpMade = val
    }
  }
  // Fallback: some payloads expose a flat stats object
  const flat = athleteEntry?.stats || athleteEntry?.athlete?.stats
  if (flat && typeof flat === 'object') {
    for (const [k, v] of Object.entries(flat)) {
      const num = Number(v)
      if (Number.isNaN(num)) continue
      if (k.toLowerCase().includes('passingyards')) stats.passYds = num
      // … extend as needed when real payloads are inspected
    }
  }
  return stats
}

async function buildPlayerPool(): Promise<Player[]> {
  console.log('Fetching statistical leaders…')
  const leaders = await fetchLeaders()
  console.log(`Got ${leaders.length} athlete entries`)

  const players: Player[] = []
  const seen = new Set<string>()

  for (const entry of leaders) {
    const ath = entry.athlete || entry
    const id = String(ath.id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)

    const pos = mapPosition(ath.position?.abbreviation || ath.position || entry.position)
    if (!pos) continue

    const stats = extractStats(entry)
    // Skip players with essentially no production
    const hasProduction =
      (stats.passYds || 0) + (stats.rushYds || 0) + (stats.recYds || 0) + (stats.receptions || 0) > 0
    if (!hasProduction && pos !== 'K') continue

    players.push({
      id,
      name: ath.displayName || `${ath.firstName || ''} ${ath.lastName || ''}`.trim(),
      firstName: ath.firstName || '',
      lastName: ath.lastName || '',
      position: pos,
      team: ath.team?.abbreviation || ath.teamAbbr || 'FA',
      teamId: ath.team?.id,
      jersey: ath.jersey,
      headshot: ath.headshot?.href || ath.headshot,
      stats,
      grade: 0,
      gradeLabel: 'Average',
      lastUpdated: new Date().toISOString(),
    })
  }

  // Grade within each position
  const graded = gradeAllPlayers(players)

  // Assign ranks
  const byOverall = [...graded].sort((a, b) => b.grade - a.grade)
  byOverall.forEach((p, i) => (p.rankOverall = i + 1))

  const byPos = new Map<Position, typeof graded>()
  for (const p of graded) {
    const list = byPos.get(p.position) || []
    list.push(p)
    byPos.set(p.position, list)
  }
  for (const [, list] of byPos) {
    list.sort((a, b) => b.grade - a.grade)
    list.forEach((p, i) => (p.rankPos = i + 1))
  }

  return graded
}

async function buildDefensePool(teams: any[]): Promise<TeamDefense[]> {
  // Placeholder – real DST stats require team statistics endpoints
  // e.g. https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/types/2/teams/{id}/statistics
  // For now we create skeleton entries that the grading function can still score once stats are populated.
  const defenses: TeamDefense[] = teams.map((t: any, idx: number) => {
    const team = t.team || t
    return {
      id: String(team.id),
      name: team.displayName || team.name,
      abbreviation: team.abbreviation,
      stats: {
        sacks: 0,
        ints: 0,
        fumblesRec: 0,
        defTDs: 0,
        ptsAllowed: 0,
        gamesPlayed: 0,
      },
      grade: 50,
      gradeLabel: 'Average',
      rank: idx + 1,
      lastUpdated: new Date().toISOString(),
    }
  })
  return defenses
}

async function main() {
  console.log(`Starting weekly ESPN sync for ${SEASON} season…`)
  mkdirSync(DATA_DIR, { recursive: true })

  const teams = await fetchTeamList()
  console.log(`Found ${teams.length} teams`)

  const players = await buildPlayerPool()
  const defenses = await buildDefensePool(teams)

  // Re-grade defenses once real stats exist
  const gradedDefs = gradePlayersByPosition(
    defenses.map((d) => ({ ...d, position: 'DST' as Position }))
  ).map((d, i) => ({ ...d, rank: i + 1 }))

  const now = new Date()
  const nextTuesday = new Date(now)
  nextTuesday.setDate(now.getDate() + ((2 + 7 - now.getDay()) % 7 || 7))
  nextTuesday.setHours(6, 0, 0, 0)

  const lake: DataLake = {
    meta: {
      lastSync: now.toISOString(),
      nextSync: nextTuesday.toISOString(),
      season: SEASON,
      week: 0, // can be enriched later
      source: 'ESPN public APIs (site.web.api + site.api + core)',
      playerCount: players.length,
      dstCount: gradedDefs.length,
    },
    players,
    defenses: gradedDefs,
  }

  const outPath = join(DATA_DIR, 'latest.json')
  writeFileSync(outPath, JSON.stringify(lake, null, 2))
  console.log(`Wrote data lake → ${outPath}`)
  console.log(`Players: ${players.length} | DST: ${gradedDefs.length}`)
  console.log('Done. Next scheduled sync: Tuesday.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

/**
 * Sync helpers: season-scoped stats only.
 * Overview "Regular Season" is NOT year-scoped for inactive players.
 */
import { writeFileSync, mkdirSync } from 'fs'
export { writeFileSync, mkdirSync }
import { join, dirname } from 'path'
export { join }
import { fileURLToPath } from 'url'
import { OFF, scoreKicker, scoreDstSeason } from './league-scoring.mjs'
export { OFF, scoreKicker, scoreDstSeason }

const __dirname = dirname(fileURLToPath(import.meta.url))
export const SEASON = 2026
export const DATA_DIR = join(__dirname, '..', 'public', 'data')

export const safe = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
export const num = (v) => {
  if (v == null || v === '-' || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export const POS_POOL = { QB: 120, RB: 200, WR: 330, TE: 190, K: 45, DST: 32 }
export const LEAGUE_POOL = 1600

export function seasonPPR(stats, pos) {
  let pts = 0
  if (pos === 'QB') {
    pts +=
      safe(stats.passYds) * OFF.passYd +
      safe(stats.passTDs) * OFF.passTD +
      safe(stats.interceptions) * OFF.int +
      safe(stats.rushYds) * OFF.rushYd +
      safe(stats.rushTDs) * OFF.rushTD
  } else if (pos === 'RB' || pos === 'WR' || pos === 'TE') {
    pts +=
      safe(stats.rushYds) * OFF.rushYd +
      safe(stats.rushTDs) * OFF.rushTD +
      safe(stats.receptions) * OFF.rec +
      safe(stats.recYds) * OFF.recYd +
      safe(stats.recTDs) * OFF.recTD
  } else if (pos === 'K') {
    return scoreKicker(stats, safe)
  } else if (pos === 'DST') {
    return scoreDstSeason(stats, safe)
  }
  return Math.round(pts * 10) / 10
}

export function estimateGames(stats, pos) {
  if (safe(stats.gamesPlayed) > 0) return stats.gamesPlayed
  if (pos === 'QB' && safe(stats.passAtt) > 0) return Math.max(1, Math.round(safe(stats.passAtt) / 34))
  if (pos === 'RB' && safe(stats.carries) > 0) return Math.max(1, Math.round(safe(stats.carries) / 12))
  if ((pos === 'WR' || pos === 'TE') && safe(stats.targets) > 0)
    return Math.max(1, Math.round(safe(stats.targets) / 6))
  if ((pos === 'WR' || pos === 'TE') && safe(stats.receptions) > 0)
    return Math.max(1, Math.round(safe(stats.receptions) / 4))
  if (pos === 'K' && safe(stats.xpMade) > 0) return Math.max(1, Math.round(safe(stats.xpMade) / 2.2))
  return 1
}

export function computeRaw(stats, pos) {
  return seasonPPR(stats, pos) / Math.max(estimateGames(stats, pos), 1)
}

export function rankNormalize(values, populationSize) {
  if (!values.length) return []
  const denom = Math.max(populationSize, 1)
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)
  const out = new Array(values.length)
  order.forEach((item, rank0) => {
    const score = 100 * (1 - rank0 / denom)
    out[item.i] = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10
  })
  return out
}

export function gradeLabel(s) {
  if (s >= 90) return 'Elite'
  if (s >= 75) return 'Great'
  if (s >= 55) return 'Solid'
  if (s >= 35) return 'Average'
  return 'Below'
}

export function gradeByPos(players) {
  if (!players.length) return []
  const pos = players[0].position
  const raw = players.map((p) => computeRaw(p.stats, pos))
  const pool = POS_POOL[pos] || LEAGUE_POOL
  const n = rankNormalize(raw, pool)
  return players.map((p, i) => ({
    ...p,
    grade: n[i],
    gradeLabel: gradeLabel(n[i]),
  }))
}

export function gradeAll(players) {
  const m = new Map()
  for (const p of players) {
    const l = m.get(p.position) || []
    l.push(p)
    m.set(p.position, l)
  }
  const r = []
  for (const [, g] of m) r.push(...gradeByPos(g))
  return r
}

export async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'nfl-player-ratings/1.4', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url)
  return res.json()
}

export function mapPos(p) {
  if (!p) return null
  const x = String(p).toUpperCase()
  if (x === 'QB') return 'QB'
  if (x === 'RB' || x === 'FB') return 'RB'
  if (x === 'WR') return 'WR'
  if (x === 'TE') return 'TE'
  if (x === 'PK' || x === 'K') return 'K'
  return null
}

export function idFromRef(ref) {
  const m = String(ref || '').match(/athletes\/(\d+)/)
  return m ? m[1] : null
}

export async function collectIds() {
  const ids = new Set()
  try {
    const data = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${SEASON}/types/2/leaders?limit=200`
    )
    for (const cat of data.categories || []) {
      if (/pass|rush|receiv|field|kick|scor|touch|reception/i.test(cat.name || '')) {
        for (const L of cat.leaders || []) {
          const id = idFromRef(L.athlete?.$ref || L.athlete)
          if (id) ids.add(id)
        }
      }
    }
  } catch (e) {
    console.warn('leaders collect', e.message)
  }

  try {
    const teams = await fetchJson(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams'
    )
    for (const item of teams.sports?.[0]?.leagues?.[0]?.teams || []) {
      const tid = item.team?.id
      if (!tid) continue
      try {
        const roster = await fetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${tid}/roster`
        )
        for (const group of roster.athletes || []) {
          for (const a of group.items || []) {
            const pos = mapPos(a.position?.abbreviation || a.position?.name)
            if (!pos) continue
            if (a.id) ids.add(String(a.id))
          }
        }
      } catch (e) {
        console.warn('roster', tid, e.message)
      }
      await new Promise((r) => setTimeout(r, 30))
    }
  } catch (e) {
    console.warn('teams roster collect', e.message)
  }

  console.log('collectIds total', ids.size)
  return [...ids]
}

export function parseStats(overview) {
  const stats = {}
  const block = overview?.statistics
  if (!block) return stats
  const names = block.names || []
  const split =
    (block.splits || []).find((s) => /regular/i.test(s.displayName || '')) ||
    (block.splits || [])[0]
  if (!split?.stats) return stats
  const map = {}
  names.forEach((n, i) => {
    if (n) map[n] = num(split.stats[i])
  })
  stats.carries = map.rushingAttempts || 0
  stats.rushYds = map.rushingYards || 0
  stats.rushTDs = map.rushingTouchdowns || 0
  stats.receptions = map.receptions || 0
  stats.targets = map.receivingTargets || 0
  stats.recYds = map.receivingYards || 0
  stats.recTDs = map.receivingTouchdowns || 0
  stats.passYds = map.passingYards || 0
  stats.passTDs = map.passingTouchdowns || 0
  stats.interceptions = map.interceptions || map.passingInterceptions || 0
  stats.completions = map.completions || 0
  stats.passAtt = map.passingAttempts || 0
  stats.fgMade = map.fieldGoalsMade || 0
  stats.fgAtt = map.fieldGoalAttempts || 0
  stats.xpMade = map.extraPointsMade || 0
  stats.sacks = map.sacks || 0
  stats.fumblesLost = map.fumblesLost || map.losingFumbles || 0
  stats.fumbles = map.fumbles || 0
  if (map.fumblesLost != null) stats.fumblesLost = map.fumblesLost
  else if (map.losingFumbles != null) stats.fumblesLost = map.losingFumbles
  return stats
}

export function parseFantasyMeta(overview) {
  const f = overview?.fantasy || {}
  const pct = num(f.percentOwned)
  return {
    percentOwned: pct > 0 ? pct : undefined,
    positionRankEspn: f.positionRank ? String(f.positionRank) : undefined,
  }
}

export async function fetchGamesPlayed(id) {
  // Season-scoped only. 404 / empty = no 2026 participation — do NOT fall back to career.
  try {
    const data = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${SEASON}/types/2/athletes/${id}/statistics`
    )
    if (data?.error || !data?.splits) {
      return { gamesPlayed: 0, teamGamesPlayed: 0, gamesStarted: 0, kick: {}, hasSeasonStats: false }
    }
    const cats = data?.splits?.categories || []
    if (!cats.length) {
      return { gamesPlayed: 0, teamGamesPlayed: 0, gamesStarted: 0, kick: {}, hasSeasonStats: false }
    }
    let gamesPlayed = 0
    let teamGamesPlayed = 0
    let gamesStarted = 0
    const kick = {}
    for (const cat of cats) {
      const catName = (cat.name || '').toLowerCase()
      for (const s of cat.stats || []) {
        const name = (s.name || '').toLowerCase()
        const abbr = (s.abbreviation || '').toLowerCase()
        const val = num(s.value ?? s.displayValue)
        if (name === 'gamesplayed') gamesPlayed = val
        if (name === 'teamgamesplayed' || abbr === 'tgp') teamGamesPlayed = val
        if (name === 'gamesstarted' || abbr === 'gs') gamesStarted = val
        if (name === 'fumbleslost' || abbr === 'fuml' || name === 'losingfumbles')
          kick.fumblesLost = val
        if (name === 'fumbles' && kick.fumblesLost == null) kick.fumblesLost = val
        if (catName === 'kicking' || catName === 'scoring') {
          if (name === 'extrapointsmade' || abbr === 'xpm') kick.xpMade = val
          if (name === 'fieldgoalsmade' || abbr === 'fgm') kick.fgMade = val
          if (name === 'fieldgoalattempts' || abbr === 'fga') kick.fgAtt = val
          if (name === 'fieldgoalsmade1_19') kick.fgMade1_19 = val
          if (name === 'fieldgoalsmade20_29') kick.fgMade20_29 = val
          if (name === 'fieldgoalsmade30_39') kick.fgMade30_39 = val
          if (name === 'fieldgoalsmade40_49') kick.fgMade40_49 = val
          if (name === 'fieldgoalsmade50_59') kick.fgMade50_59 = val
          if (name === 'fieldgoalsmade60_99' || name === 'fieldgoalsmade60') kick.fgMade60 = val
          if (name === 'fieldgoalattempts1_19') kick.fgAtt1_19 = val
          if (name === 'fieldgoalattempts20_29') kick.fgAtt20_29 = val
          if (name === 'fieldgoalattempts30_39') kick.fgAtt30_39 = val
          if (name === 'fieldgoalattempts40_49') kick.fgAtt40_49 = val
          if (name === 'fieldgoalattempts50_59') kick.fgAtt50_59 = val
          if (name === 'fieldgoalattempts60_99') kick.fgAtt60 = val
        }
      }
    }
    const made =
      safe(kick.fgMade1_19) +
      safe(kick.fgMade20_29) +
      safe(kick.fgMade30_39) +
      safe(kick.fgMade40_49) +
      safe(kick.fgMade50_59) +
      safe(kick.fgMade60)
    const att =
      safe(kick.fgAtt1_19) +
      safe(kick.fgAtt20_29) +
      safe(kick.fgAtt30_39) +
      safe(kick.fgAtt40_49) +
      safe(kick.fgAtt50_59) +
      safe(kick.fgAtt60)
    if (att > 0) kick.fgMissed = Math.max(0, att - made)
    else if (safe(kick.fgAtt) > 0) kick.fgMissed = Math.max(0, safe(kick.fgAtt) - safe(kick.fgMade))
    return { gamesPlayed, teamGamesPlayed, gamesStarted, kick, hasSeasonStats: true }
  } catch {
    return { gamesPlayed: 0, teamGamesPlayed: 0, gamesStarted: 0, kick: {}, hasSeasonStats: false }
  }
}

export async function profile(id) {
  const overview = await fetchJson(
    `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/overview`
  )
  let bio = {}
  try {
    bio = await fetchJson(
      `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}`
    )
  } catch {}
  const a = bio.athlete || bio || {}
  const pos = mapPos(a.position?.abbreviation || a.position?.name)
  // Overview "Regular Season" is NOT year-scoped for inactive players (e.g. Justin Jackson → 2022).
  // Only trust volume stats when the season-scoped core endpoint has data for SEASON.
  const gp = await fetchGamesPlayed(id)
  let stats
  if (gp.hasSeasonStats && (gp.gamesPlayed || 0) > 0) {
    stats = parseStats(overview)
    stats.gamesPlayed = gp.gamesPlayed || 0
    stats.teamGamesPlayed = gp.teamGamesPlayed || 0
    stats.gamesStarted = gp.gamesStarted || 0
    if (gp.kick?.fumblesLost != null) stats.fumblesLost = gp.kick.fumblesLost
    if (pos === 'K' && gp.kick) Object.assign(stats, gp.kick)
  } else {
    // No 2026 participation — zero production so we never invent GP from prior-year volume
    stats = {
      carries: 0, rushYds: 0, rushTDs: 0, receptions: 0, targets: 0, recYds: 0, recTDs: 0,
      passYds: 0, passTDs: 0, interceptions: 0, completions: 0, passAtt: 0,
      fgMade: 0, fgAtt: 0, xpMade: 0, sacks: 0, fumblesLost: 0,
      gamesPlayed: 0, teamGamesPlayed: 0, gamesStarted: 0,
    }
  }
  const fantasyMeta = parseFantasyMeta(overview)
  const team = a.team?.abbreviation || a.teamShortName || 'FA'
  return {
    id: String(id),
    name: a.displayName || `Player ${id}`,
    firstName: a.firstName || '',
    lastName: a.lastName || '',
    position: pos,
    team: String(team).slice(0, 4),
    teamId: String(a.team?.id || a.teamId || ''),
    jersey: a.jersey,
    stats,
    grade: 0,
    gradeLabel: 'Average',
    fantasyMeta,
    statusFromBio: a.status?.name || 'Active',
    lastUpdated: new Date().toISOString(),
  }
}

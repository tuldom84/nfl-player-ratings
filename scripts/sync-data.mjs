/**
 * Weekly ESPN data lake sync.
 * Offense: full-PPR. K/DST: league settings. Team OFF RPS for DST matchups.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { OFF, scoreKicker, scoreDstSeason } from './league-scoring.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEASON = 2026
const DATA_DIR = join(__dirname, '..', 'public', 'data')

const safe = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)
const num = (v) => {
  if (v == null || v === '-' || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function seasonPPR(stats, pos) {
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

function estimateGames(stats, pos) {
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

function computeRaw(stats, pos) {
  return seasonPPR(stats, pos) / Math.max(estimateGames(stats, pos), 1)
}
function normalize(vs) {
  if (!vs.length) return []
  const mn = Math.min(...vs)
  const mx = Math.max(...vs)
  const r = mx - mn || 1
  return vs.map((v) => ((v - mn) / r) * 100)
}
function gradeLabel(s) {
  if (s >= 90) return 'Elite'
  if (s >= 75) return 'Great'
  if (s >= 55) return 'Solid'
  if (s >= 35) return 'Average'
  return 'Below'
}
function gradeByPos(players) {
  if (!players.length) return []
  const pos = players[0].position
  const raw = players.map((p) => computeRaw(p.stats, pos))
  const n = normalize(raw)
  return players.map((p, i) => ({
    ...p,
    grade: Math.round(n[i] * 10) / 10,
    gradeLabel: gradeLabel(n[i]),
  }))
}
function gradeAll(players) {
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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'nfl-player-ratings/1.2', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url)
  return res.json()
}
function mapPos(p) {
  if (!p) return null
  const x = String(p).toUpperCase()
  if (x === 'QB') return 'QB'
  if (x === 'RB' || x === 'FB') return 'RB'
  if (x === 'WR') return 'WR'
  if (x === 'TE') return 'TE'
  if (x === 'PK' || x === 'K') return 'K'
  return null
}
function idFromRef(ref) {
  const m = String(ref || '').match(/athletes\/(\d+)/)
  return m ? m[1] : null
}

async function collectIds() {
  const data = await fetchJson(
    `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${SEASON}/types/2/leaders?limit=50`
  )
  const ids = new Set()
  for (const cat of data.categories || []) {
    if (/pass|rush|receiv|field|kick|scor|touch|reception/i.test(cat.name || '')) {
      for (const L of cat.leaders || []) {
        const id = idFromRef(L.athlete?.$ref || L.athlete)
        if (id) ids.add(id)
      }
    }
  }
  return [...ids]
}

function parseStats(overview) {
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
  stats.fumblesLost = 0
  if (map.fumblesLost != null) stats.fumblesLost = map.fumblesLost
  else if (map.losingFumbles != null) stats.fumblesLost = map.losingFumbles
  else if (map.fumbles != null) stats.fumblesLost = map.fumbles
  return stats
}

function parseFantasyMeta(overview) {
  const f = overview?.fantasy || {}
  const pct = num(f.percentOwned)
  return {
    percentOwned: pct > 0 ? pct : undefined,
    positionRankEspn: f.positionRank ? String(f.positionRank) : undefined,
  }
}

async function fetchGamesPlayed(id) {
  try {
    const data = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${SEASON}/types/2/athletes/${id}/statistics`
    )
    const cats = data?.splits?.categories || []
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
    return { gamesPlayed, teamGamesPlayed, gamesStarted, kick }
  } catch {
    return { gamesPlayed: 0, teamGamesPlayed: 0, gamesStarted: 0, kick: {} }
  }
}

async function profile(id) {
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
  const stats = parseStats(overview)
  const gp = await fetchGamesPlayed(id)
  stats.gamesPlayed = gp.gamesPlayed || 0
  stats.teamGamesPlayed = gp.teamGamesPlayed || 0
  stats.gamesStarted = gp.gamesStarted || 0
  if (gp.kick?.fumblesLost != null) stats.fumblesLost = gp.kick.fumblesLost
  if (pos === 'K' && gp.kick) Object.assign(stats, gp.kick)
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

async function teamDefStats(teamId, abbreviation) {
  const stats = {
    sacks: 0,
    ints: 0,
    fumblesRec: 0,
    fumblesForced: 0,
    safeties: 0,
    onePtSafeties: 0,
    twoPtReturns: 0,
    defTDs: 0,
    kicksBlocked: 0,
    ptsAllowed: 0,
    yardsAllowed: 0,
    gamesPlayed: 0,
    gameLogs: [],
  }
  const offense = {
    gamesPlayed: 0,
    pointsPerGame: 0,
    yardsPerGame: 0,
    passYardsPerGame: 0,
    rushYardsPerGame: 0,
    totalYards: 0,
    totalPoints: 0,
    totalTDs: 0,
    interceptions: 0,
    fumblesLost: 0,
    passTDs: 0,
    rushTDs: 0,
    qbRating: 0,
    sacksAllowed: 0,
  }
  try {
    const data = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${SEASON}/types/2/teams/${teamId}/statistics`
    )
    const cats = data?.splits?.categories || []
    for (const cat of cats) {
      const n = (cat.name || '').toLowerCase()
      for (const s of cat.stats || []) {
        const abbr = (s.abbreviation || '').toLowerCase()
        const name = (s.name || '').toLowerCase()
        const val = num(s.value ?? s.displayValue)
        if (n === 'defensive') {
          if (abbr === 'sack' || name === 'sacks') stats.sacks = val
          if (name === 'defensivetouchdowns') stats.defTDs = val
          if (name === 'safeties' || abbr === 'safe') stats.safeties = val
          if (name === 'oneptsafetiesmade' || abbr === 'opsm') stats.onePtSafeties = val
          if (name === 'twoptreturns' || abbr === '2ptr') stats.twoPtReturns = val
          if (name === 'kicksblocked' || abbr === 'kb') stats.kicksBlocked = val
          if (name === 'blockedfieldgoaltouchdowns' || name === 'blockedpunttouchdowns')
            stats.defTDs += val
          if (name === 'teamgamesplayed') stats.gamesPlayed = val
        }
        if (n === 'defensiveinterceptions') {
          if (abbr === 'int' || name === 'interceptions') stats.ints = val
          if (name === 'interceptiontouchdowns') stats.defTDs += val
        }
        if (n === 'general') {
          if (name === 'fumblesrecovered' || abbr === 'fr') stats.fumblesRec = val
          if (name === 'fumblesforced' || abbr === 'ff') stats.fumblesForced = val
          if (name === 'defensivefumblestouchdowns' || name === 'fumblestouchdowns')
            stats.defTDs += val
          if (name === 'gamesplayed') {
            stats.gamesPlayed = val
            offense.gamesPlayed = val
          }
          if (name === 'fumbleslost' || abbr === 'lst') offense.fumblesLost = val
        }
        if (n === 'returning') {
          if (name === 'kickoffreturntouchdowns' || name === 'puntreturntouchdowns')
            stats.defTDs += val
        }
        if (n === 'passing') {
          if (name === 'passingyardspergame') offense.passYardsPerGame = val
          if (name === 'passingtouchdowns') offense.passTDs = val
          if (name === 'interceptions' || abbr === 'int') offense.interceptions = val
          if (name === 'qbrating' || abbr === 'rtg') offense.qbRating = val
          if (name === 'sacks' || abbr === 'sack') offense.sacksAllowed = val
          if (name === 'netyardspergame') offense.yardsPerGame = val || offense.yardsPerGame
        }
        if (n === 'rushing') {
          if (name === 'rushingyardspergame') offense.rushYardsPerGame = val
          if (name === 'rushingtouchdowns') offense.rushTDs = val
          if (name === 'totalpointspergame') offense.pointsPerGame = val
          if (name === 'totalyards') offense.totalYards = val
          if (name === 'totaltouchdowns') offense.totalTDs = val
          if (name === 'netyardspergame') offense.yardsPerGame = val || offense.yardsPerGame
          if (name === 'teamgamesplayed') offense.gamesPlayed = val || offense.gamesPlayed
        }
        if (n === 'scoring') {
          if (name === 'totalpointspergame') offense.pointsPerGame = val
          if (name === 'totalpoints') offense.totalPoints = val
          if (name === 'passingtouchdowns') offense.passTDs = val
          if (name === 'rushingtouchdowns') offense.rushTDs = val
        }
      }
    }
    if (!offense.yardsPerGame) {
      offense.yardsPerGame =
        (offense.passYardsPerGame || 0) + (offense.rushYardsPerGame || 0)
    }
  } catch {}

  try {
    const sched = await fetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule`
    )
    for (const e of sched.events || []) {
      const c = (e.competitions || [])[0]
      if (!c || !(c.status || {}).type?.completed) continue
      const comps = c.competitors || []
      const self = comps.find(
        (x) => String(x.team?.id) === String(teamId) || x.team?.abbreviation === abbreviation
      )
      const opp = comps.find((x) => x !== self)
      if (!self || !opp) continue
      const ptsAllowed = num(opp.score?.value ?? opp.score)
      let yardsAllowed = 0
      try {
        const summary = await fetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`
        )
        for (const t of summary.boxscore?.teams || []) {
          if (
            String(t.team?.id) === String(opp.team?.id) ||
            t.team?.abbreviation === opp.team?.abbreviation
          ) {
            for (const s of t.statistics || []) {
              if ((s.name || '') === 'totalYards') yardsAllowed = num(s.displayValue ?? s.value)
            }
          }
        }
      } catch {}
      stats.gameLogs.push({
        eventId: e.id,
        ptsAllowed,
        yardsAllowed,
        opponent: opp.team?.abbreviation,
      })
      stats.ptsAllowed += ptsAllowed
      stats.yardsAllowed += yardsAllowed
      await new Promise((r) => setTimeout(r, 25))
    }
    if (stats.gameLogs.length) stats.gamesPlayed = stats.gameLogs.length
  } catch (e) {
    console.warn('schedule', teamId, e.message)
  }
  if (!offense.gamesPlayed && stats.gamesPlayed) offense.gamesPlayed = stats.gamesPlayed
  return { stats, offense }
}

async function loadMatchups(week) {
  const data = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${SEASON}`
  )
  const map = {}
  for (const t of data.week?.teamsOnBye || []) {
    map[t.abbreviation] = { opponent: 'BYE', homeAway: 'bye' }
  }
  for (const e of data.events || []) {
    const comps = e.competitions?.[0] || e
    const competitors = comps.competitors || []
    const home = competitors.find((c) => c.homeAway === 'home')
    const away = competitors.find((c) => c.homeAway === 'away')
    if (!home || !away) continue
    const h = home.team?.abbreviation
    const a = away.team?.abbreviation
    if (h && a) {
      map[h] = { opponent: a, homeAway: 'home' }
      map[a] = { opponent: h, homeAway: 'away' }
    }
  }
  return { map, week: data.week?.number || week }
}

async function loadInjuries() {
  const data = await fetchJson(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'
  )
  const byId = {}
  for (const team of data.injuries || []) {
    for (const inj of team.injuries || []) {
      const status = inj.status || 'Unknown'
      if (status === 'Active') continue
      const ath = inj.athlete || {}
      let id = ath.id ? String(ath.id) : null
      if (!id) {
        const href = (ath.links || [])[0]?.href || ''
        const m = href.match(/\/id\/(\d+)\//)
        if (m) id = m[1]
      }
      if (!id) continue
      byId[id] = {
        injuryStatus: status,
        injuryDetail: inj.shortComment || inj.type?.description || status,
      }
    }
  }
  return byId
}

function matchupMultiplier(oppDstGrade) {
  if (oppDstGrade == null) return 1
  return Math.round((1.18 - (oppDstGrade / 100) * 0.36) * 1000) / 1000
}
function injuryFactor(status) {
  if (!status || status === 'Active' || status === 'Unknown') return 1
  if (status === 'Questionable') return 0.85
  if (status === 'Doubtful') return 0.4
  if (status === 'Out' || status === 'Injured Reserve' || status === 'Suspension') return 0
  return 1
}

function attachFantasy(player, matchups, dstByAbbr, injuries, projectionWeek) {
  const pos = player.position
  const seasonPts = seasonPPR(player.stats, pos)
  const games = estimateGames(player.stats, pos)
  const avgPts = Math.round((seasonPts / games) * 10) / 10
  const team = player.team
  const mu = matchups[team]
  const opponent = mu?.opponent
  const homeAway = mu?.homeAway
  let oppDstGrade
  let mult = 1
  let matchupNote = 'No matchup data'
  if (homeAway === 'bye' || opponent === 'BYE') {
    mult = 0
    matchupNote = 'BYE week'
  } else if (opponent && dstByAbbr[opponent]) {
    oppDstGrade = dstByAbbr[opponent].grade
    mult = matchupMultiplier(oppDstGrade)
    const label = dstByAbbr[opponent].gradeLabel
    matchupNote =
      mult < 0.95
        ? `Tough vs ${opponent} DST (${label}, grade ${oppDstGrade})`
        : mult > 1.05
          ? `Favorable vs ${opponent} DST (${label}, grade ${oppDstGrade})`
          : `Neutral vs ${opponent} DST (grade ${oppDstGrade})`
  } else if (opponent) {
    matchupNote = `vs ${opponent}`
  }
  const inj = injuries[player.id] || {}
  const injuryStatus =
    inj.injuryStatus ||
    (player.statusFromBio === 'Active' ? 'Active' : player.statusFromBio) ||
    'Active'
  const injF = injuryFactor(injuryStatus)
  let projectedPts = Math.round(avgPts * mult * injF * 10) / 10
  if (homeAway === 'bye') projectedPts = 0
  player.stats.fantasyPts = seasonPts
  player.stats.gamesPlayed = games
  player.fantasy = {
    seasonPts,
    avgPts,
    games,
    gamesPlayed: games,
    teamGamesPlayed: safe(player.stats.teamGamesPlayed) || undefined,
    projectedPts,
    opponent,
    homeAway,
    oppDstGrade,
    matchupMultiplier: mult,
    matchupNote,
    injuryStatus,
    injuryDetail: inj.injuryDetail,
    percentOwned: player.fantasyMeta?.percentOwned,
    positionRankEspn: player.fantasyMeta?.positionRankEspn,
    projectionWeek,
  }
  delete player.fantasyMeta
  delete player.statusFromBio
  return player
}

function rawOffenseRps(o) {
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

async function main() {
  console.log('ESPN sync', SEASON, '(league K/DST scoring + team OFF RPS)')
  mkdirSync(DATA_DIR, { recursive: true })

  const board = await fetchJson(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  )
  const currentWeek = board.week?.number || 6
  // After a week ends ESPN often still returns that week (all Final).
  // For fantasy projections use the next week once every game is complete.
  const events = board.events || []
  const hasUpcoming = events.some((e) => {
    const typ = e.status?.type
    if (!typ) return false
    if (typ.completed) return false
    const name = String(typ.name || '')
    return name !== 'STATUS_FINAL'
  })
  let projectionWeek = currentWeek
  if (events.length > 0 && !hasUpcoming) {
    projectionWeek = currentWeek + 1
  }
  console.log(
    'ESPN week',
    currentWeek,
    'projection week',
    projectionWeek,
    hasUpcoming ? '(in progress)' : '(week complete → +1)'
  )

  const { map: matchups } = await loadMatchups(projectionWeek)
  console.log('Matchups loaded', Object.keys(matchups).length)
  const injuries = await loadInjuries()
  console.log('Injuries', Object.keys(injuries).length)

  const ids = await collectIds()
  console.log('IDs', ids.length)
  const players = []
  for (let i = 0; i < ids.length; i++) {
    try {
      const p = await profile(ids[i])
      if (!p.position) continue
      const prod =
        (p.stats.passYds || 0) +
        (p.stats.rushYds || 0) +
        (p.stats.recYds || 0) +
        (p.stats.receptions || 0) +
        (p.stats.fgMade || 0) +
        (p.stats.xpMade || 0)
      if (prod <= 0 && p.position !== 'K') continue
      players.push(p)
    } catch (e) {
      console.warn('skip', ids[i], e.message)
    }
    await new Promise((r) => setTimeout(r, 40))
    if ((i + 1) % 25 === 0) console.log(' ', i + 1, '/', ids.length)
  }

  const teams = await fetchJson(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams'
  )
  const defenses = []
  const teamOffenses = []
  for (const item of teams.sports?.[0]?.leagues?.[0]?.teams || []) {
    const t = item.team
    if (!t?.id) continue
    try {
      const { stats: fullStats, offense: offStats } = await teamDefStats(t.id, t.abbreviation)
      defenses.push({
        id: String(t.id),
        name: t.displayName || t.name,
        abbreviation: t.abbreviation,
        stats: fullStats,
        grade: 0,
        gradeLabel: 'Average',
        rank: 0,
        lastUpdated: new Date().toISOString(),
      })
      teamOffenses.push({
        id: String(t.id),
        name: t.displayName || t.name,
        abbreviation: t.abbreviation,
        stats: offStats,
        rps: 0,
        rpsLabel: 'Average',
        rank: 0,
        lastUpdated: new Date().toISOString(),
      })
    } catch (e) {
      console.warn('DST skip', t.abbreviation, e.message)
    }
    await new Promise((r) => setTimeout(r, 40))
  }

  const offRaws = teamOffenses.map((o) => rawOffenseRps(o.stats || {}))
  if (offRaws.length) {
    const mn = Math.min(...offRaws)
    const mx = Math.max(...offRaws)
    const range = mx - mn || 1
    teamOffenses.forEach((o, i) => {
      o.rps = Math.round(((offRaws[i] - mn) / range) * 1000) / 10
      o.rpsLabel = gradeLabel(o.rps)
    })
    teamOffenses.sort((a, b) => b.rps - a.rps)
    teamOffenses.forEach((o, i) => {
      o.rank = i + 1
    })
  }
  const offenseByAbbr = {}
  for (const o of teamOffenses) offenseByAbbr[o.abbreviation] = o
  console.log('Team offenses', teamOffenses.length)

  const dstGraded = gradeByPos(
    defenses.map((d) => ({
      ...d,
      position: 'DST',
      stats: d.stats,
    }))
  ).map((d) => {
    const { position, ...rest } = d
    return { ...rest, rank: 0 }
  })
  dstGraded.sort((a, b) => b.grade - a.grade)
  dstGraded.forEach((d, i) => {
    d.rank = i + 1
  })

  const dstByAbbr = {}
  for (const d of dstGraded) dstByAbbr[d.abbreviation] = d

  let graded = gradeAll(players)
  graded = graded.map((p) => attachFantasy(p, matchups, dstByAbbr, injuries, projectionWeek))

  for (const d of dstGraded) {
    const seasonPts = seasonPPR(d.stats, 'DST')
    const games = Math.max(1, d.stats.gamesPlayed || 1)
    const avgPts = Math.round((seasonPts / games) * 10) / 10
    const mu = matchups[d.abbreviation]
    let projectedPts = avgPts
    let oppOffenseRps
    let matchupMultiplier = 1
    let matchupNote =
      mu?.homeAway === 'bye'
        ? 'BYE week'
        : mu?.opponent
          ? `${mu.homeAway === 'home' ? 'vs' : '@'} ${mu.opponent}`
          : undefined
    if (mu?.homeAway === 'bye' || mu?.opponent === 'BYE') {
      projectedPts = 0
      matchupMultiplier = 0
      matchupNote = 'BYE week'
    } else if (mu?.opponent && offenseByAbbr[mu.opponent]) {
      const off = offenseByAbbr[mu.opponent]
      oppOffenseRps = off.rps
      matchupMultiplier = Math.round((1.18 - (oppOffenseRps / 100) * 0.36) * 1000) / 1000
      projectedPts = Math.round(avgPts * matchupMultiplier * 10) / 10
      const label = off.rpsLabel
      matchupNote =
        matchupMultiplier < 0.95
          ? `Tough vs ${mu.opponent} OFF (${label}, RPS ${oppOffenseRps})`
          : matchupMultiplier > 1.05
            ? `Favorable vs ${mu.opponent} OFF (${label}, RPS ${oppOffenseRps})`
            : `Neutral vs ${mu.opponent} OFF (RPS ${oppOffenseRps})`
    }
    d.fantasy = {
      seasonPts,
      avgPts,
      games,
      gamesPlayed: games,
      projectedPts,
      opponent: mu?.opponent,
      homeAway: mu?.homeAway,
      matchupNote,
      matchupMultiplier,
      oppOffenseRps,
      projectionWeek,
    }
  }

  const now = new Date()
  const next = new Date(now)
  next.setUTCDate(next.getUTCDate() + ((2 + 7 - next.getUTCDay()) % 7 || 7))
  next.setUTCHours(14, 0, 0, 0)

  const payload = {
    meta: {
      lastSync: now.toISOString(),
      nextSync: next.toISOString(),
      season: SEASON,
      week: projectionWeek,
      projectionWeek,
      source:
        'ESPN + team OFF RPS + league K/DST scoring + full-PPR offense',
      playerCount: graded.length,
      dstCount: dstGraded.length,
      offenseCount: teamOffenses.length,
    },
    players: graded,
    defenses: dstGraded,
    teamOffenses,
  }

  writeFileSync(join(DATA_DIR, 'latest.json'), JSON.stringify(payload))
  console.log(
    'Wrote latest.json',
    graded.length,
    'players',
    dstGraded.length,
    'DST',
    teamOffenses.length,
    'OFF',
    'week',
    projectionWeek
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

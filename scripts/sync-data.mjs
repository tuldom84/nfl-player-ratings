/**
 * Weekly ESPN data lake sync entrypoint.
 * Helpers: ./sync-lib.mjs (season-scoped GP filter).
 */
import {
  SEASON,
  DATA_DIR,
  safe,
  num,
  POS_POOL,
  LEAGUE_POOL,
  seasonPPR,
  estimateGames,
  computeRaw,
  rankNormalize,
  gradeLabel,
  gradeByPos,
  gradeAll,
  fetchJson,
  mapPos,
  idFromRef,
  collectIds,
  parseStats,
  parseFantasyMeta,
  fetchGamesPlayed,
  profile,
  writeFileSync,
  mkdirSync,
  join,
  OFF,
  scoreKicker,
  scoreDstSeason,
} from './sync-lib.mjs'
import { appendDstGameLogs } from './sync-dst-logs.mjs'

async function teamDefStats(teamId, abbreviation) {
  const stats = {
    sacks: 0, ints: 0, fumblesRec: 0, fumblesForced: 0, safeties: 0,
    onePtSafeties: 0, twoPtReturns: 0, defTDs: 0, kicksBlocked: 0,
    ptsAllowed: 0, yardsAllowed: 0, gamesPlayed: 0, gameLogs: [],
  }
  const offense = {
    gamesPlayed: 0, pointsPerGame: 0, yardsPerGame: 0, passYardsPerGame: 0,
    rushYardsPerGame: 0, totalYards: 0, totalPoints: 0, totalTDs: 0,
    interceptions: 0, fumblesLost: 0, passTDs: 0, rushTDs: 0, qbRating: 0, sacksAllowed: 0,
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
          if (name === 'blockedfieldgoaltouchdowns' || name === 'blockedpunttouchdowns') stats.defTDs += val
          if (name === 'teamgamesplayed') stats.gamesPlayed = val
        }
        if (n === 'defensiveinterceptions') {
          if (abbr === 'int' || name === 'interceptions') stats.ints = val
          if (name === 'interceptiontouchdowns') stats.defTDs += val
        }
        if (n === 'general') {
          if (name === 'fumblesrecovered' || abbr === 'fr') stats.fumblesRec = val
          if (name === 'fumblesforced' || abbr === 'ff') stats.fumblesForced = val
          if (name === 'defensivefumblestouchdowns' || name === 'fumblestouchdowns') stats.defTDs += val
          if (name === 'gamesplayed') { stats.gamesPlayed = val; offense.gamesPlayed = val }
          if (name === 'fumbleslost' || abbr === 'lst') offense.fumblesLost = val
        }
        if (n === 'returning') {
          if (name === 'kickoffreturntouchdowns' || name === 'puntreturntouchdowns') stats.defTDs += val
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
      offense.yardsPerGame = (offense.passYardsPerGame || 0) + (offense.rushYardsPerGame || 0)
    }
  } catch {}

  try {
    await appendDstGameLogs(stats, teamId, abbreviation)
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
        injuryDetail: inj.longComment || inj.shortComment || inj.details || '',
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
  const realGp = safe(player.stats.gamesPlayed)
  const games = realGp > 0 ? realGp : estimateGames(player.stats, pos)
  const avgPts = Math.round((seasonPts / Math.max(games, 1)) * 10) / 10
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
    seasonPts, avgPts, games, gamesPlayed: games,
    teamGamesPlayed: safe(player.stats.teamGamesPlayed) || undefined,
    projectedPts, opponent, homeAway, oppDstGrade,
    matchupMultiplier: mult, matchupNote, injuryStatus,
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
  const ppg = o.pointsPerGame || (o.totalPoints || 0) / g
  const ypg = o.yardsPerGame || 0
  const tds = ((o.passTDs || 0) + (o.rushTDs || 0) + (o.totalTDs || 0) / 2) / g
  const to = ((o.interceptions || 0) + (o.fumblesLost || 0)) / g
  return ppg * 2.2 + ypg * 0.04 + tds * 6 - to * 3
}

async function main() {
  console.log('ESPN sync', SEASON)
  mkdirSync(DATA_DIR, { recursive: true })

  const board = await fetchJson(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  )
  const espnWeek = board.week?.number || 1
  const now = new Date()
  const etHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const etDay = etHour.getDay()
  const events = board.events || []
  const hasUpcoming = events.some((e) => {
    const t = e.status?.type || {}
    return t.state === 'pre' || (!t.completed && t.state !== 'post')
  })
  const midweekGap = (etDay === 2 || etDay === 3) && !hasUpcoming
  let projectionWeek = espnWeek
  if (midweekGap) projectionWeek = espnWeek + 1
  console.log('ESPN week', espnWeek, 'ET day', etDay, 'projection week', projectionWeek)

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
      // Only rate players who actually played in the current season
      if (!(p.stats?.gamesPlayed > 0)) continue
      players.push(p)
    } catch (e) {
      console.warn('skip', ids[i], e.message)
    }
    await new Promise((r) => setTimeout(r, 40))
    if ((i + 1) % 50 === 0) console.log(' ', i + 1, '/', ids.length)
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
      console.warn('team', t.abbreviation, e.message)
    }
    await new Promise((r) => setTimeout(r, 50))
  }

  let graded = gradeAll(players)
  graded = [...graded].sort((a, b) => b.grade - a.grade)
  graded.forEach((p, i) => { p.rankOverall = i + 1 })
  const byPos = new Map()
  for (const p of graded) {
    const l = byPos.get(p.position) || []
    l.push(p)
    byPos.set(p.position, l)
  }
  for (const [, l] of byPos) {
    l.sort((a, b) => b.grade - a.grade)
    l.forEach((p, i) => { p.rankPos = i + 1 })
  }

  let gDef = gradeByPos(defenses.map((d) => ({ ...d, position: 'DST' })))
  gDef.sort((a, b) => b.grade - a.grade)
  gDef = gDef.map((d, i) => ({ ...d, rank: i + 1 }))
  const dstByAbbr = {}
  for (const d of gDef) dstByAbbr[d.abbreviation] = d

  graded = graded.map((p) => attachFantasy(p, matchups, dstByAbbr, injuries, projectionWeek))

  gDef = gDef.map((d) => {
    const seasonPts = seasonPPR(d.stats, 'DST')
    const games = Math.max(1, safe(d.stats.gamesPlayed) || 1)
    const avgPts = Math.round((seasonPts / games) * 10) / 10
    const mu = matchups[d.abbreviation]
    let projectedPts = avgPts
    let matchupNote = 'Team defense'
    if (mu?.homeAway === 'bye') {
      projectedPts = 0
      matchupNote = 'BYE week'
    } else if (mu?.opponent) {
      matchupNote = `${mu.homeAway === 'home' ? 'vs' : '@'} ${mu.opponent}`
    }
    return {
      ...d,
      fantasy: {
        seasonPts, avgPts, games, gamesPlayed: games,
        projectedPts: Math.round(projectedPts * 10) / 10,
        opponent: mu?.opponent, homeAway: mu?.homeAway,
        matchupNote, injuryStatus: 'Active', projectionWeek,
      },
    }
  })

  const offRaws = teamOffenses.map((o) => rawOffenseRps(o.stats))
  const norms = rankNormalize(offRaws, 32)
  teamOffenses.forEach((o, i) => {
    o.rps = norms[i]
    o.rpsLabel = gradeLabel(norms[i])
  })
  teamOffenses.sort((a, b) => b.rps - a.rps)
  teamOffenses.forEach((o, i) => { o.rank = i + 1 })

  const next = new Date(now)
  next.setDate(now.getDate() + ((2 - now.getDay() + 7) % 7 || 7))
  next.setHours(10, 0, 0, 0)
  const lake = {
    meta: {
      lastSync: now.toISOString(),
      nextSync: next.toISOString(),
      season: SEASON,
      week: espnWeek,
      projectionWeek,
      source: 'ESPN 2026 GP + full DST per-game logs (PA/YA/sacks/INT/FR/TD) + rank grades',
      playerCount: graded.length,
      dstCount: gDef.length,
      offenseCount: teamOffenses.length,
    },
    players: graded,
    defenses: gDef,
    teamOffenses,
  }
  writeFileSync(join(DATA_DIR, 'latest.json'), JSON.stringify(lake))
  console.log('Wrote', graded.length, 'players (2026 GP only)')
  graded.slice(0, 5).forEach((p) =>
    console.log(p.name, 'GP', p.stats.gamesPlayed, 'avg', p.fantasy.avgPts, 'proj', p.fantasy.projectedPts)
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

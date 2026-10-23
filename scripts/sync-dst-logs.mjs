/**
 * Build full per-game DST logs from schedule + boxscore.
 * Each log is scoreable with league PA/YA brackets + counting stats.
 */
import { fetchJson, num, SEASON } from './sync-lib.mjs'

function findStat(list, name) {
  const hit = (list || []).find((s) => (s.name || '').toLowerCase() === name.toLowerCase())
  if (!hit) return undefined
  const v = hit.value
  if (v != null && v !== '-' && !(typeof v === 'string' && String(v).trim() === '')) return v
  return hit.displayValue
}

function scoreValue(v) {
  if (v == null) return 0
  if (typeof v === 'object') return num(v.value ?? v.displayValue)
  return num(v)
}

/**
 * Mutates stats.gameLogs / ptsAllowed / yardsAllowed / gamesPlayed.
 * Returns the same stats object.
 */
export async function appendDstGameLogs(stats, teamId, abbreviation) {
  const sched = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${SEASON}`
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

    const weekNum =
      typeof e.week === 'number' ? e.week : num(e.week?.number ?? e.week?.text)
    const homeAway =
      self.homeAway === 'home' ? 'home' : self.homeAway === 'away' ? 'away' : 'neutral'
    const ptsAllowed = scoreValue(opp.score)

    let yardsAllowed = 0
    let sacks = 0
    let ints = 0
    let fumblesRec = 0
    let defTDs = 0
    let safeties = 0

    try {
      const summary = await fetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`
      )
      for (const t of summary.boxscore?.teams || []) {
        const isOpp =
          String(t.team?.id) === String(opp.team?.id) ||
          t.team?.abbreviation === opp.team?.abbreviation
        const isSelf =
          String(t.team?.id) === String(teamId) || t.team?.abbreviation === abbreviation
        const st = t.statistics || []
        if (isOpp) {
          yardsAllowed = num(findStat(st, 'totalYards'))
          const sackStr = String(findStat(st, 'sacksYardsLost') ?? '')
          sacks = num(sackStr.split('-')[0])
          ints = num(findStat(st, 'interceptions'))
          fumblesRec = num(findStat(st, 'fumblesLost'))
        }
        if (isSelf) {
          defTDs = num(findStat(st, 'defensiveTouchdowns'))
        }
      }
      for (const p of summary.scoringPlays || []) {
        if (String(p.team?.id) !== String(teamId) && p.team?.abbreviation !== abbreviation) {
          continue
        }
        const txt = `${p.scoringType?.name || ''} ${p.text || ''}`.toLowerCase()
        if (txt.includes('safety')) safeties += 1
      }
    } catch {
      /* keep PA from scoreboard only */
    }

    stats.gameLogs.push({
      eventId: String(e.id),
      week: weekNum || stats.gameLogs.length + 1,
      opponent: opp.team?.abbreviation || '—',
      homeAway,
      ptsAllowed,
      yardsAllowed,
      sacks,
      ints,
      fumblesRec,
      defTDs,
      safeties,
      result: self.winner === true ? 'W' : self.winner === false ? 'L' : undefined,
    })
    stats.ptsAllowed += ptsAllowed
    stats.yardsAllowed += yardsAllowed
    await new Promise((r) => setTimeout(r, 30))
  }

  if (stats.gameLogs.length) stats.gamesPlayed = stats.gameLogs.length
  return stats
}

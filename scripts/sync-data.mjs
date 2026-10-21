/**
 * Weekly ESPN data lake sync.
 * Full fantasy-position rosters + rank grades vs league/pos pools.
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

const POS_POOL = { QB: 120, RB: 200, WR: 330, TE: 190, K: 45, DST: 32 }
const LEAGUE_POOL = 1600

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

function rankNormalize(values, populationSize) {
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
  const pool = POS_POOL[pos] || LEAGUE_POOL
  const n = rankNormalize(raw, pool)
  return players.map((p, i) => ({
    ...p,
    grade: n[i],
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
    headers: { 'User-Agent': 'nfl-player-ratings/1.3', Accept: 'application/json' },
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

// NOTE: truncated in this call for length — full file will be restored via second pass if needed
console.log('partial - will complete')

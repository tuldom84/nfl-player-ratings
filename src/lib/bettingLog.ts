import type { GamePrediction } from './types'

export type PickGrade = 'W' | 'L' | 'P'

export interface TrackedPick {
  pick: string
  actual: string
  grade: PickGrade | null
}

export interface RecordLine {
  wins: number
  losses: number
  pushes: number
  decided: number
  /** (wins + half a push) / all graded games. A called push is already a win. */
  winPct: number | null
}

export interface BettingSummary {
  games: number
  finals: number
  pending: number
  ats: RecordLine
  totals: RecordLine
  straightUp: RecordLine
  avgScoreError: number | null
}

export interface WeekLog {
  season: number
  week: number
  games: GamePrediction[]
  summary: BettingSummary
}

export interface SeasonLog {
  season: number
  weeks: WeekLog[]
  summary: BettingSummary
}

export interface BettingLog {
  allTime: BettingSummary
  seasons: SeasonLog[]
}

const EMPTY_LINE: RecordLine = { wins: 0, losses: 0, pushes: 0, decided: 0, winPct: null }

export function isFinal(game: GamePrediction): boolean {
  return game.actualHomeScore != null && game.actualAwayScore != null
}

/** Nearest point. 20.5 → 21, 23.2 → 23. Picks use these, not the raw tenth. */
export function roundedScore(n: number): number {
  return Math.round(n)
}

export function roundedPrediction(game: GamePrediction): { home: number; away: number } {
  return {
    home: roundedScore(game.predictedHomeScore),
    away: roundedScore(game.predictedAwayScore),
  }
}

function sideFromMargin(margin: number, home: string, away: string): string {
  if (Math.abs(margin) < 0.0001) return 'PUSH'
  return margin > 0 ? home : away
}

function gradePick(pick: string, actual: string): PickGrade | null {
  if (pick === 'PASS') return null
  // Calling the push is a win. Any other push is a draw.
  if (pick === 'PUSH') return actual === 'PUSH' ? 'W' : 'L'
  if (actual === 'PUSH') return 'P'
  return pick === actual ? 'W' : 'L'
}

export function getAtsPick(game: GamePrediction): TrackedPick | null {
  if (game.marketHomeSpread == null) return null
  const predicted = roundedPrediction(game)
  const predictedMargin = predicted.home - predicted.away + game.marketHomeSpread
  const pick = sideFromMargin(predictedMargin, game.home, game.away)
  if (!isFinal(game)) return { pick, actual: '—', grade: null }
  const actualMargin = game.actualHomeScore! - game.actualAwayScore! + game.marketHomeSpread
  const actual = sideFromMargin(actualMargin, game.home, game.away)
  return { pick, actual, grade: gradePick(pick, actual) }
}

export function getTotalPick(game: GamePrediction): TrackedPick | null {
  if (game.marketTotal == null) return null
  const predicted = roundedPrediction(game)
  const predictedTotal = predicted.home + predicted.away
  const pick =
    Math.abs(predictedTotal - game.marketTotal) < 0.0001
      ? 'PUSH'
      : predictedTotal > game.marketTotal
        ? 'OVER'
        : 'UNDER'
  if (!isFinal(game)) return { pick, actual: '—', grade: null }
  const actualTotal = game.actualHomeScore! + game.actualAwayScore!
  const actual =
    Math.abs(actualTotal - game.marketTotal) < 0.0001
      ? 'PUSH'
      : actualTotal > game.marketTotal
        ? 'OVER'
        : 'UNDER'
  return { pick, actual, grade: gradePick(pick, actual) }
}

/** Model winner from the projected score, graded against the final score. */
export function getStraightUpPick(game: GamePrediction): TrackedPick {
  const predicted = roundedPrediction(game)
  const predictedMargin = predicted.home - predicted.away
  const pick = predictedMargin === 0 ? 'PUSH' : predictedMargin > 0 ? game.home : game.away
  if (!isFinal(game)) return { pick, actual: '—', grade: null }
  const actualMargin = game.actualHomeScore! - game.actualAwayScore!
  const actual =
    Math.abs(actualMargin) < 0.0001 ? 'PUSH' : actualMargin > 0 ? game.home : game.away
  return { pick, actual, grade: gradePick(pick, actual) }
}

export function formatModelSpread(game: GamePrediction): string {
  const predicted = roundedPrediction(game)
  const margin = predicted.home - predicted.away
  if (margin === 0) return 'PICK'
  const favorite = margin > 0 ? game.home : game.away
  return `${favorite} -${Math.abs(margin)}`
}

export function formatMarketSpread(game: GamePrediction): string {
  const line = game.marketHomeSpread ?? 0
  if (Math.abs(line) < 0.0001) return 'PK'
  const favorite = line < 0 ? game.home : game.away
  const points = Math.abs(line)
  return `${favorite} -${points % 1 === 0 ? points.toFixed(0) : points.toFixed(1)}`
}

export function formatRecord(line: RecordLine): string {
  return `${line.wins}-${line.losses}-${line.pushes}`
}

export function formatWinPct(line: RecordLine): string {
  if (line.winPct == null) return '—'
  return `${Math.round(line.winPct * 100)}%`
}

function tally(picks: Array<TrackedPick | null>): RecordLine {
  let wins = 0
  let losses = 0
  let pushes = 0
  for (const pick of picks) {
    if (!pick?.grade) continue
    if (pick.grade === 'W') wins++
    else if (pick.grade === 'L') losses++
    else pushes++
  }
  const graded = wins + losses + pushes
  return {
    wins,
    losses,
    pushes,
    decided: graded,
    // An uncalled push is a draw (half). A called push was already graded as a win.
    winPct: graded > 0 ? (wins + pushes * 0.5) / graded : null,
  }
}

export function scoreError(game: GamePrediction): number | null {
  if (!isFinal(game)) return null
  return (
    (Math.abs(game.predictedHomeScore - game.actualHomeScore!) +
      Math.abs(game.predictedAwayScore - game.actualAwayScore!)) /
    2
  )
}

export function summarize(games: GamePrediction[]): BettingSummary {
  const finals = games.filter(isFinal)
  const errors = finals.map(scoreError).filter((n): n is number => n != null)
  return {
    games: games.length,
    finals: finals.length,
    pending: games.length - finals.length,
    ats: games.length ? tally(games.map(getAtsPick)) : { ...EMPTY_LINE },
    totals: games.length ? tally(games.map(getTotalPick)) : { ...EMPTY_LINE },
    straightUp: games.length ? tally(games.map(getStraightUpPick)) : { ...EMPTY_LINE },
    avgScoreError: errors.length ? errors.reduce((sum, n) => sum + n, 0) / errors.length : null,
  }
}

export function buildBettingLog(games: GamePrediction[]): BettingLog {
  const bySeason = new Map<number, Map<number, GamePrediction[]>>()
  for (const game of games) {
    const weeks = bySeason.get(game.season) || new Map<number, GamePrediction[]>()
    const list = weeks.get(game.week) || []
    list.push(game)
    weeks.set(game.week, list)
    bySeason.set(game.season, weeks)
  }

  const seasons: SeasonLog[] = [...bySeason.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([season, weeks]) => {
      const weekLogs: WeekLog[] = [...weeks.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([week, weekGames]) => {
          const ordered = [...weekGames].sort((a, b) => a.away.localeCompare(b.away))
          return { season, week, games: ordered, summary: summarize(ordered) }
        })
      const seasonGames = weekLogs.flatMap((week) => week.games)
      return { season, weeks: weekLogs, summary: summarize(seasonGames) }
    })

  return { allTime: summarize(games), seasons }
}

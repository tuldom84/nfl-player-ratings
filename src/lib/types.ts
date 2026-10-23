export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'

export type InjuryStatus =
  | 'Active'
  | 'Questionable'
  | 'Doubtful'
  | 'Out'
  | 'Injured Reserve'
  | 'Suspension'
  | 'Unknown'

/** Per-game DST log from weekly sync (PA/YA for bracket scoring). */
export interface DstGameLog {
  eventId?: string
  week?: number
  ptsAllowed: number
  yardsAllowed: number
  opponent?: string
  homeAway?: 'home' | 'away' | 'neutral'
  sacks?: number
  ints?: number
  fumblesRec?: number
  defTDs?: number
  safeties?: number
}

export interface PlayerStats {
  passYds?: number
  passTDs?: number
  interceptions?: number
  passAtt?: number
  completions?: number
  rushYds?: number
  rushTDs?: number
  carries?: number
  receptions?: number
  recYds?: number
  recTDs?: number
  targets?: number
  fgMade?: number
  fgAtt?: number
  xpMade?: number
  sacks?: number
  ints?: number
  fumblesRec?: number
  defTDs?: number
  ptsAllowed?: number
  yardsAllowed?: number
  gamesPlayed?: number
  teamGamesPlayed?: number
  gamesStarted?: number
  fantasyPts?: number
  fumblesLost?: number
  fumblesForced?: number
  safeties?: number
  onePtSafeties?: number
  twoPtReturns?: number
  kicksBlocked?: number
  fgMade1_19?: number
  fgMade20_29?: number
  fgMade30_39?: number
  fgMade40_49?: number
  fgMade50_59?: number
  fgMade60?: number
  fgMissed?: number
  /** DST only — per-game PA/YA for correct bracket scoring */
  gameLogs?: DstGameLog[]
}

export interface OffenseStats {
  gamesPlayed?: number
  pointsPerGame?: number
  yardsPerGame?: number
  passYardsPerGame?: number
  rushYardsPerGame?: number
  totalYards?: number
  totalPoints?: number
  totalTDs?: number
  interceptions?: number
  fumblesLost?: number
  passTDs?: number
  rushTDs?: number
  qbRating?: number
  sacksAllowed?: number
}

export interface FantasyInfo {
  seasonPts: number
  avgPts: number
  games: number
  gamesPlayed?: number
  teamGamesPlayed?: number
  projectedPts: number
  opponent?: string
  homeAway?: 'home' | 'away' | 'bye'
  oppDstGrade?: number
  /** Opponent team offense RPS (for DST matchups) */
  oppOffenseRps?: number
  matchupMultiplier?: number
  matchupNote?: string
  injuryStatus?: InjuryStatus
  injuryDetail?: string
  percentOwned?: number
  positionRankEspn?: string
  projectionWeek?: number
}

export interface Player {
  id: string
  name: string
  firstName: string
  lastName: string
  position: Position
  team: string
  teamId?: string
  jersey?: string
  headshot?: string
  stats: PlayerStats
  grade: number
  gradeLabel: string
  valueGrade?: number
  valueLabel?: string
  rps?: number
  rpsLabel?: string
  availability?: number
  rankOverall?: number
  rankPos?: number
  rankValue?: number
  fantasy?: FantasyInfo
  lastUpdated: string
}

export interface TeamDefense {
  id: string
  name: string
  abbreviation: string
  stats: PlayerStats
  grade: number
  gradeLabel: string
  valueGrade?: number
  valueLabel?: string
  rps?: number
  rpsLabel?: string
  availability?: number
  rank: number
  rankValue?: number
  fantasy?: FantasyInfo
  lastUpdated: string
}

/** Real football team offense value (RPS only — not fantasy). */
export interface TeamOffense {
  id: string
  name: string
  abbreviation: string
  stats: OffenseStats
  rps: number
  rpsLabel: string
  rank: number
  lastUpdated: string
}

export interface DataMeta {
  lastSync: string
  nextSync: string
  season: number
  week: number
  projectionWeek?: number
  source: string
  playerCount: number
  dstCount: number
  offenseCount?: number
}

export interface DataLake {
  meta: DataMeta
  players: Player[]
  defenses: TeamDefense[]
  teamOffenses?: TeamOffense[]
}

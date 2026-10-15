export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'

export type InjuryStatus =
  | 'Active'
  | 'Questionable'
  | 'Doubtful'
  | 'Out'
  | 'Injured Reserve'
  | 'Suspension'
  | 'Unknown'

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
  /** True games played (not games started) */
  gamesPlayed?: number
  /** Team's games in the season so far */
  teamGamesPlayed?: number
  /** Games started — informational only; not used in averages */
  gamesStarted?: number
  fantasyPts?: number
  fumblesLost?: number
  fumblesForced?: number
  safeties?: number
  fgMade1_19?: number
  fgMade20_29?: number
  fgMade30_39?: number
  fgMade40_49?: number
  fgMade50_59?: number
  fgMade60?: number
  fgMissed?: number
}

export interface FantasyInfo {
  seasonPts: number
  avgPts: number
  /** Alias for gamesPlayed used in averages */
  games: number
  gamesPlayed?: number
  teamGamesPlayed?: number
  projectedPts: number
  opponent?: string
  homeAway?: 'home' | 'away' | 'bye'
  oppDstGrade?: number
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
  /** Real Position Score — real football value at position (0–100) */
  rps?: number
  rpsLabel?: string
  /** gamesPlayed / teamGamesPlayed (0–1) */
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

export interface DataMeta {
  lastSync: string
  nextSync: string
  season: number
  week: number
  projectionWeek?: number
  source: string
  playerCount: number
  dstCount: number
}

export interface DataLake {
  meta: DataMeta
  players: Player[]
  defenses: TeamDefense[]
}

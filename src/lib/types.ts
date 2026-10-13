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
  gamesPlayed?: number
  fantasyPts?: number
}

export interface FantasyInfo {
  seasonPts: number
  avgPts: number
  games: number
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
  /** Position-relative grade (0–100 within same position) */
  grade: number
  gradeLabel: string
  /** Cross-position PPR value grade (PPG × availability × pos weight) */
  valueGrade?: number
  valueLabel?: string
  /** gamesPlayed / teamGames (0–1) */
  availability?: number
  rankOverall?: number
  rankPos?: number
  /** Rank by valueGrade among players only */
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

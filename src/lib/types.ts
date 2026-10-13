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

/** PPR fantasy metrics derived from season stats + matchup */
export interface FantasyInfo {
  /** Total full-PPR fantasy points this season */
  seasonPts: number
  /** Average full-PPR points per game */
  avgPts: number
  /** Games used for average (estimated if ESPN omits GP) */
  games: number
  /** This week's projected PPR points (avg × opponent factor × injury factor) */
  projectedPts: number
  /** Opponent team abbreviation (or BYE) */
  opponent?: string
  /** Home / Away / BYE */
  homeAway?: 'home' | 'away' | 'bye'
  /** Opponent DST grade 0–100 (higher = tougher) */
  oppDstGrade?: number
  /** Multiplier applied to avg for matchup (e.g. 0.88 tough, 1.12 soft) */
  matchupMultiplier?: number
  /** Human-readable matchup note */
  matchupNote?: string
  injuryStatus?: InjuryStatus
  injuryDetail?: string
  percentOwned?: number
  positionRankEspn?: string
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
  rankOverall?: number
  rankPos?: number
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
  rank: number
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

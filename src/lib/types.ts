export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'

export interface PlayerStats {
  // Passing
  passYds?: number
  passTDs?: number
  interceptions?: number
  passAtt?: number
  completions?: number
  // Rushing
  rushYds?: number
  rushTDs?: number
  carries?: number
  // Receiving
  receptions?: number
  recYds?: number
  recTDs?: number
  targets?: number
  // Kicking
  fgMade?: number
  fgAtt?: number
  xpMade?: number
  // Defense / DST
  sacks?: number
  ints?: number
  fumblesRec?: number
  defTDs?: number
  ptsAllowed?: number
  yardsAllowed?: number
  // General
  gamesPlayed?: number
  fantasyPts?: number
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
  grade: number          // 0-100 normalized weighted grade
  gradeLabel: string     // Elite / Great / Solid / Average / Below
  rankOverall?: number
  rankPos?: number
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
  lastUpdated: string
}

export interface DataMeta {
  lastSync: string
  nextSync: string
  season: number
  week: number
  source: string
  playerCount: number
  dstCount: number
}

export interface DataLake {
  meta: DataMeta
  players: Player[]
  defenses: TeamDefense[]
}

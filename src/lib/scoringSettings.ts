/** League scoring settings with PPR / Standard presets and localStorage persistence. */

export type ScoringPreset = 'ppr' | 'standard' | 'custom'

export interface BracketRow {
  max: number
  pts: number
}

export interface OffenseScoring {
  passYd: number
  passTD: number
  int: number
  rushYd: number
  rushTD: number
  rec: number
  recYd: number
  recTD: number
}

export interface KickerScoring {
  xpMade: number
  fgMiss: number
  fg0_39: number
  fg40_49: number
  fg50_59: number
  fg60: number
}

export interface DstScoring {
  sack: number
  int: number
  fumRec: number
  fumForced: number
  safety: number
  onePtSafety: number
  twoPtReturn: number
  defTD: number
  blockedKick: number
  pa: BracketRow[]
  ya: BracketRow[]
}

export interface ScoringSettings {
  preset: ScoringPreset
  offense: OffenseScoring
  kicker: KickerScoring
  dst: DstScoring
}

const STORAGE_KEY = 'nfl-ratings-scoring-v1'
export const SCORING_CHANGE_EVENT = 'nfl-scoring-settings-changed'

export const PPR_OFFENSE: OffenseScoring = {
  passYd: 0.04,
  passTD: 4,
  int: -2,
  rushYd: 0.1,
  rushTD: 6,
  rec: 1,
  recYd: 0.1,
  recTD: 6,
}

export const STANDARD_OFFENSE: OffenseScoring = {
  ...PPR_OFFENSE,
  rec: 0,
}

export const DEFAULT_KICKER: KickerScoring = {
  xpMade: 1,
  fgMiss: -1,
  fg0_39: 3,
  fg40_49: 4,
  fg50_59: 5,
  fg60: 6,
}

export const DEFAULT_DST: DstScoring = {
  sack: 1,
  int: 2,
  fumRec: 2,
  fumForced: 1,
  safety: 2,
  onePtSafety: 2,
  twoPtReturn: 2,
  defTD: 6,
  blockedKick: 2,
  pa: [
    { max: 0, pts: 5 },
    { max: 6, pts: 4 },
    { max: 13, pts: 3 },
    { max: 17, pts: 1 },
    { max: 27, pts: 0 },
    { max: 34, pts: -1 },
    { max: 45, pts: -3 },
    { max: Infinity, pts: -5 },
  ],
  ya: [
    { max: 99, pts: 5 },
    { max: 199, pts: 3 },
    { max: 299, pts: 2 },
    { max: 399, pts: 0 },
    { max: 449, pts: -2 },
    { max: 499, pts: -3 },
    { max: 549, pts: -4 },
    { max: Infinity, pts: -5 },
  ],
}

export function presetSettings(preset: 'ppr' | 'standard'): ScoringSettings {
  return {
    preset,
    offense: preset === 'ppr' ? { ...PPR_OFFENSE } : { ...STANDARD_OFFENSE },
    kicker: { ...DEFAULT_KICKER },
    dst: {
      ...DEFAULT_DST,
      pa: DEFAULT_DST.pa.map((r) => ({ ...r })),
      ya: DEFAULT_DST.ya.map((r) => ({ ...r })),
    },
  }
}

export function defaultSettings(): ScoringSettings {
  return presetSettings('ppr')
}

export function loadScoringSettings(): ScoringSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as ScoringSettings
    if (!parsed?.offense || !parsed?.kicker || !parsed?.dst) return defaultSettings()
    return parsed
  } catch {
    return defaultSettings()
  }
}

export function saveScoringSettings(settings: ScoringSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent(SCORING_CHANGE_EVENT))
}

export function notifyScoringChange(): void {
  window.dispatchEvent(new CustomEvent(SCORING_CHANGE_EVENT))
}

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
  /** Fumble lost (typically -2). Applied to QB/RB/WR/TE. */
  fumLost: number
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
  /** Points-allowed brackets (per game). First matching max wins. */
  pa: BracketRow[]
  /** Yards-allowed brackets (per game). First matching max wins. */
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
  fumLost: -2,
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

/**
 * League defaults from ESPN scoring settings screenshots:
 * PA: 0→5, 1-6→4, 7-13→3, 14-17→1, 18-27→0 (off), 28-34→-1, 35-45→-3, 46+→-5
 * YA: <100→5, 100-199→3, 200-299→2, 300-399→0 (off), 400-449→-2, 450-499→-3, 500-549→-4, 550+→-5
 * 2pt return 2, 1pt safety 2
 */
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
    { max: 27, pts: 0 }, // 18–27 disabled in league → 0
    { max: 34, pts: -1 },
    { max: 45, pts: -3 },
    { max: Infinity, pts: -5 }, // 46+
  ],
  ya: [
    { max: 99, pts: 5 }, // less than 100
    { max: 199, pts: 3 },
    { max: 299, pts: 2 },
    { max: 399, pts: 0 }, // 300–399 disabled in league → 0
    { max: 449, pts: -2 },
    { max: 499, pts: -3 },
    { max: 549, pts: -4 },
    { max: Infinity, pts: -5 }, // 550+
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
    // Ensure PA/YA brackets always exist (older saves may omit them)
    if (!Array.isArray(parsed.dst.pa) || !parsed.dst.pa.length) {
      parsed.dst.pa = DEFAULT_DST.pa.map((r) => ({ ...r }))
    } else {
      // JSON.stringify turns Infinity into null — restore open-ended max
      parsed.dst.pa = parsed.dst.pa.map((r) => ({
        max: r.max == null || Number.isNaN(Number(r.max)) ? Infinity : Number(r.max),
        pts: Number(r.pts),
      }))
    }
    if (!Array.isArray(parsed.dst.ya) || !parsed.dst.ya.length) {
      parsed.dst.ya = DEFAULT_DST.ya.map((r) => ({ ...r }))
    } else {
      parsed.dst.ya = parsed.dst.ya.map((r) => ({
        max: r.max == null || Number.isNaN(Number(r.max)) ? Infinity : Number(r.max),
        pts: Number(r.pts),
      }))
    }
    if (parsed.dst.onePtSafety == null) parsed.dst.onePtSafety = DEFAULT_DST.onePtSafety
    if (parsed.dst.twoPtReturn == null) parsed.dst.twoPtReturn = DEFAULT_DST.twoPtReturn
    if (parsed.offense.fumLost == null) parsed.offense.fumLost = PPR_OFFENSE.fumLost
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

/** Human labels for PA brackets matching league UI. */
export const PA_BRACKET_LABELS = [
  '0 points allowed',
  '1–6 points allowed',
  '7–13 points allowed',
  '14–17 points allowed',
  '18–27 points allowed',
  '28–34 points allowed',
  '35–45 points allowed',
  '46+ points allowed',
]

export const YA_BRACKET_LABELS = [
  '<100 total yards allowed',
  '100–199 total yards allowed',
  '200–299 total yards allowed',
  '300–399 total yards allowed',
  '400–449 total yards allowed',
  '450–499 total yards allowed',
  '500–549 total yards allowed',
  '550+ total yards allowed',
]

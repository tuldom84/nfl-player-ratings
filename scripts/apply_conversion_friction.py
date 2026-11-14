#!/usr/bin/env python3
"""Apply CONVERSION_FRICTION=1 to src/lib/scoreProjection.ts"""
from pathlib import Path

p = Path('src/lib/scoreProjection.ts')
t = p.read_text()
assert 'function teamBreakdown' in t and 'export function getGameDetail' in t

t = t.replace(
    ' *   + (projected DST safeties) × 2\n *   + home-field advantage (+2.5 for home team)',
    ' *   + (projected DST safeties) × 2\n'
    ' *   − 1.0 conversion friction (missed XP / failed 2PT / rare scoring leakage)\n'
    ' *   + home-field advantage (+2.5 for home team)',
    1,
)

t = t.replace(
    'export const HOME_FIELD_ADVANTAGE = 2.5\n'
    '/** Points per turnover-differential-per-game edge vs the opponent. */\n'
    'export const TO_DIFF_POINT_VALUE = 1.75',
    'export const HOME_FIELD_ADVANTAGE = 2.5\n'
    '/** Flat per-team deduction for missed XP, failed 2PT, and similar scoring leakage. */\n'
    'export const CONVERSION_FRICTION = 1\n'
    '/** Points per turnover-differential-per-game edge vs the opponent. */\n'
    'export const TO_DIFF_POINT_VALUE = 1.75',
    1,
)

t = t.replace(
    '  safeties: number\n  safetyPts: number\n  baseScore: number\n  homeField: number',
    '  safeties: number\n  safetyPts: number\n'
    '  /** Flat −CONVERSION_FRICTION applied when forming baseScore. */\n'
    '  conversionFriction: number\n  baseScore: number\n  homeField: number',
    1,
)

t = t.replace(
    '    safeties: 0,\n'
    '    safetyPts: 0,\n'
    '    baseScore: 0,\n'
    '    homeField: isHome ? HOME_FIELD_ADVANTAGE : 0,\n'
    '    qbBoost: 0,\n'
    '    todPerGame: 0,\n'
    '    toAdj: 0,\n'
    '    finalScore: isHome ? HOME_FIELD_ADVANTAGE : 0,',
    '    safeties: 0,\n'
    '    safetyPts: 0,\n'
    '    conversionFriction: CONVERSION_FRICTION,\n'
    '    baseScore: r1(0 - CONVERSION_FRICTION),\n'
    '    homeField: isHome ? HOME_FIELD_ADVANTAGE : 0,\n'
    '    qbBoost: 0,\n'
    '    todPerGame: 0,\n'
    '    toAdj: 0,\n'
    '    finalScore: r1((isHome ? HOME_FIELD_ADVANTAGE : 0) - CONVERSION_FRICTION),',
    1,
)

t = t.replace(
    '  const tdPts = tds * 6\n'
    '  const fgPts = bestFg * 3\n'
    '  const xpPts = xp * 1\n'
    '  const qbBoostR = r2(qbBoost)\n'
    '  const baseScore = r1(tdPts + fgPts + xpPts + safetyPts)\n'
    '  const homeField = isHome ? HOME_FIELD_ADVANTAGE : 0\n'
    '  const finalScore = r1(baseScore + homeField + qbBoostR)',
    '  const tdPts = tds * 6\n'
    '  const fgPts = bestFg * 3\n'
    '  const xpPts = xp * 1\n'
    '  const qbBoostR = r2(qbBoost)\n'
    '  // −1 for typical missed XP / failed 2PT / conversion noise per team-game\n'
    '  const conversionFriction = CONVERSION_FRICTION\n'
    '  const baseScore = r1(tdPts + fgPts + xpPts + safetyPts - conversionFriction)\n'
    '  const homeField = isHome ? HOME_FIELD_ADVANTAGE : 0\n'
    '  const finalScore = r1(baseScore + homeField + qbBoostR)',
    1,
)

t = t.replace(
    '    safeties: r2(safetyCount),\n'
    '    safetyPts: r1(safetyPts),\n'
    '    baseScore,\n'
    '    homeField,',
    '    safeties: r2(safetyCount),\n'
    '    safetyPts: r1(safetyPts),\n'
    '    conversionFriction,\n'
    '    baseScore,\n'
    '    homeField,',
    1,
)

if 'CONVERSION_FRICTION = 1' not in t:
    raise SystemExit('patch failed: constant missing')
if 'safetyPts - conversionFriction' not in t:
    raise SystemExit('patch failed: baseScore formula missing')
if 'export function getGameDetail' not in t:
    raise SystemExit('patch failed: file truncated')

p.write_text(t)
print('ok', p.stat().st_size)

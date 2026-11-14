#!/usr/bin/env python3
from pathlib import Path

p = Path('src/features/BettingGameDetail.tsx')
t = p.read_text()

if 'CONVERSION_FRICTION' not in t:
    t = t.replace(
        'getGameDetail, HOME_FIELD_ADVANTAGE, TO_DIFF_POINT_VALUE, type TeamScoreBreakdown',
        'getGameDetail, HOME_FIELD_ADVANTAGE, TO_DIFF_POINT_VALUE, CONVERSION_FRICTION, type TeamScoreBreakdown',
        1,
    )

old = '''    {
      label: 'Safety points',
      a: fmt(away.safetyPts),
      h: fmt(home.safetyPts),
    },
    {
      label: 'Base score',
      a: fmt(away.baseScore),
      h: fmt(home.baseScore),
    },'''

new = '''    {
      label: 'Safety points',
      a: fmt(away.safetyPts),
      h: fmt(home.safetyPts),
    },
    {
      label: `Conversion friction (−${CONVERSION_FRICTION})`,
      a: fmt(-(away.conversionFriction ?? CONVERSION_FRICTION)),
      h: fmt(-(home.conversionFriction ?? CONVERSION_FRICTION)),
      note: 'Missed XP / failed 2PT / scoring leakage (~1 pt per team-game)',
    },
    {
      label: 'Base score',
      a: fmt(away.baseScore),
      h: fmt(home.baseScore),
      note: 'TD + FG + XP + safety − conversion friction',
    },'''

if old not in t:
    if 'Conversion friction' in t:
        print('already patched')
        raise SystemExit(0)
    raise SystemExit('pattern not found')

p.write_text(t.replace(old, new, 1))
print('ui patched')

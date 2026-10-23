import { useState, useEffect } from 'react'
import {
  type ScoringSettings,
  type ScoringPreset,
  loadScoringSettings,
  saveScoringSettings,
  presetSettings,
  PA_BRACKET_LABELS,
  YA_BRACKET_LABELS,
} from '../lib/scoringSettings'

type Section = 'offense' | 'kicker' | 'dst'

function NumField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 border-b border-slate-800">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  )
}

function BracketList({
  title,
  labels,
  rows,
}: {
  title: string
  labels: string[]
  rows: { max: number; pts: number }[]
}) {
  return (
    <div className="py-2 border-b border-slate-800 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">{title}</div>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li
            key={i}
            className={`flex items-center justify-between text-sm px-2 py-1.5 rounded-lg ${
              r.pts === 0 ? 'text-slate-500 bg-slate-950/40' : 'text-slate-200 bg-slate-800/40'
            }`}
          >
            <span>{labels[i] || `≤ ${r.max}`}</span>
            <span className="tabular-nums text-sky-300">
              {r.pts > 0 ? `+${r.pts}` : r.pts} pts
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Settings() {
  const [draft, setDraft] = useState<ScoringSettings>(() => loadScoringSettings())
  const [section, setSection] = useState<Section>('offense')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(loadScoringSettings())
  }, [])

  function applyPreset(preset: 'ppr' | 'standard') {
    setDraft(presetSettings(preset))
    setSaved(false)
  }

  function markCustom(next: ScoringSettings): ScoringSettings {
    return { ...next, preset: 'custom' as ScoringPreset }
  }

  function save() {
    saveScoringSettings(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function resetPreset() {
    const p = draft.preset === 'standard' ? 'standard' : 'ppr'
    setDraft(presetSettings(p === 'standard' ? 'standard' : 'ppr'))
    setSaved(false)
  }

  const o = draft.offense
  const k = draft.kicker
  const d = draft.dst

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-xs text-slate-500 mb-4">
        Scoring rules apply instantly to grades, averages, and projections. Saved on this device.
      </p>

      <div className="flex gap-2 mb-4">
        {(
          [
            { key: 'ppr' as const, label: 'PPR' },
            { key: 'standard' as const, label: 'Standard' },
            { key: 'custom' as const, label: 'Custom' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key === 'custom') {
                setDraft((prev) => ({ ...prev, preset: 'custom' }))
              } else {
                applyPreset(t.key)
              }
              setSaved(false)
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              draft.preset === t.key
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {draft.preset === 'ppr' && 'Full PPR — 1 point per reception'}
        {draft.preset === 'standard' && 'Standard — 0 points per reception'}
        {draft.preset === 'custom' && 'Custom rules — edit any values below'}
      </p>

      <div className="flex gap-2 mb-3 text-xs overflow-x-auto">
        {(
          [
            { key: 'offense' as const, label: 'Offense' },
            { key: 'kicker' as const, label: 'Kicker' },
            { key: 'dst' as const, label: 'DST' },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full ${
              section === s.key ? 'bg-slate-700 text-white' : 'text-slate-500'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 mb-4">
        {section === 'offense' && (
          <>
            <NumField
              label="Pass yard"
              value={o.passYd}
              step={0.01}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, passYd: n } }))
              }
            />
            <NumField
              label="Pass TD"
              value={o.passTD}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, passTD: n } }))
              }
            />
            <NumField
              label="Interception"
              value={o.int}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, int: n } }))
              }
            />
            <NumField
              label="Rush yard"
              value={o.rushYd}
              step={0.01}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, rushYd: n } }))
              }
            />
            <NumField
              label="Rush TD"
              value={o.rushTD}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, rushTD: n } }))
              }
            />
            <NumField
              label="Reception"
              value={o.rec}
              step={0.5}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, rec: n } }))
              }
            />
            <NumField
              label="Receiving yard"
              value={o.recYd}
              step={0.01}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, recYd: n } }))
              }
            />
            <NumField
              label="Receiving TD"
              value={o.recTD}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, recTD: n } }))
              }
            />
            <NumField
              label="Fumble lost"
              value={o.fumLost ?? -2}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, offense: { ...p.offense, fumLost: n } }))
              }
            />
          </>
        )}

        {section === 'kicker' && (
          <>
            <NumField
              label="XP made"
              value={k.xpMade}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, kicker: { ...p.kicker, xpMade: n } }))
              }
            />
            <NumField
              label="FG missed"
              value={k.fgMiss}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, kicker: { ...p.kicker, fgMiss: n } }))
              }
            />
            <NumField
              label="FG 0–39 yds"
              value={k.fg0_39}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, kicker: { ...p.kicker, fg0_39: n } }))
              }
            />
            <NumField
              label="FG 40–49 yds"
              value={k.fg40_49}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, kicker: { ...p.kicker, fg40_49: n } }))
              }
            />
            <NumField
              label="FG 50–59 yds"
              value={k.fg50_59}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, kicker: { ...p.kicker, fg50_59: n } }))
              }
            />
            <NumField
              label="FG 60+ yds"
              value={k.fg60}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, kicker: { ...p.kicker, fg60: n } }))
              }
            />
          </>
        )}

        {section === 'dst' && (
          <>
            <NumField
              label="Sack"
              value={d.sack}
              step={1}
              onChange={(n) => setDraft((p) => markCustom({ ...p, dst: { ...p.dst, sack: n } }))}
            />
            <NumField
              label="Interception"
              value={d.int}
              step={1}
              onChange={(n) => setDraft((p) => markCustom({ ...p, dst: { ...p.dst, int: n } }))}
            />
            <NumField
              label="Fumble recovery"
              value={d.fumRec}
              step={1}
              onChange={(n) => setDraft((p) => markCustom({ ...p, dst: { ...p.dst, fumRec: n } }))}
            />
            <NumField
              label="Forced fumble"
              value={d.fumForced}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, dst: { ...p.dst, fumForced: n } }))
              }
            />
            <NumField
              label="Safety"
              value={d.safety}
              step={1}
              onChange={(n) => setDraft((p) => markCustom({ ...p, dst: { ...p.dst, safety: n } }))}
            />
            <NumField
              label="1pt safety"
              value={d.onePtSafety ?? 2}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, dst: { ...p.dst, onePtSafety: n } }))
              }
            />
            <NumField
              label="2pt return"
              value={d.twoPtReturn ?? 2}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, dst: { ...p.dst, twoPtReturn: n } }))
              }
            />
            <NumField
              label="Def / return TD"
              value={d.defTD}
              step={1}
              onChange={(n) => setDraft((p) => markCustom({ ...p, dst: { ...p.dst, defTD: n } }))}
            />
            <NumField
              label="Blocked kick"
              value={d.blockedKick}
              step={1}
              onChange={(n) =>
                setDraft((p) => markCustom({ ...p, dst: { ...p.dst, blockedKick: n } }))
              }
            />
            <BracketList title="Points allowed (per game)" labels={PA_BRACKET_LABELS} rows={d.pa} />
            <BracketList title="Yards allowed (per game)" labels={YA_BRACKET_LABELS} rows={d.ya} />
            <p className="text-[11px] text-slate-500 py-2">
              PA/YA brackets match your league defaults and are applied <strong>per game</strong>{' '}
              (not as season averages). Gray rows are 0-pt bands (disabled tiers in league).
            </p>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
        >
          {saved ? 'Saved ✓' : 'Save rules'}
        </button>
        <button
          onClick={resetPreset}
          className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'

export type RankChip = {
  id: string
  label: string
  /** e.g. "#12" */
  rank: string
  /** score shown under rank */
  score?: string
  sublabel?: string
  accent?: 'violet' | 'emerald' | 'sky' | 'amber' | 'slate'
}

const accentBorder: Record<NonNullable<RankChip['accent']>, string> = {
  violet: 'border-violet-800/50',
  emerald: 'border-emerald-800/40',
  sky: 'border-sky-800/40',
  amber: 'border-amber-800/40',
  slate: 'border-slate-800',
}
const accentText: Record<NonNullable<RankChip['accent']>, string> = {
  violet: 'text-violet-300',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  amber: 'text-amber-300',
  slate: 'text-slate-200',
}

type Props = {
  chips: RankChip[]
  /** Plain lines explaining each rank */
  breakdown: { title: string; body: string }[]
  title?: string
}

/** Prominent rank chips + click-to-expand breakdown tooltip. */
export function RankSummary({ chips, breakdown, title = 'Ranks' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-medium">{title}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-emerald-400/90 px-2 py-1 rounded-full border border-slate-700 bg-slate-900 active:bg-slate-800"
          aria-expanded={open}
        >
          {open ? 'Hide breakdown' : 'What do these mean?'}
        </button>
      </div>

      <div
        className={`grid gap-2 ${
          chips.length >= 3 ? 'grid-cols-3' : chips.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {chips.map((c) => {
          const a = c.accent || 'slate'
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpen(true)}
              className={`bg-slate-900 rounded-xl p-3 border text-left active:scale-[0.98] transition-transform ${accentBorder[a]}`}
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{c.label}</div>
              <div className={`text-2xl font-bold tabular-nums leading-tight ${accentText[a]}`}>
                {c.rank}
              </div>
              {c.score != null && (
                <div className="text-xs text-slate-400 tabular-nums mt-0.5">{c.score}</div>
              )}
              {c.sublabel && <div className="text-[10px] text-slate-500 mt-0.5">{c.sublabel}</div>}
            </button>
          )
        })}
      </div>

      {open && (
        <div
          className="mt-3 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-lg"
          role="dialog"
          aria-label="Rank breakdown"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">Breakdown</span>
            <button
              type="button"
              className="text-xs text-slate-400 px-2 py-1"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <ul className="space-y-3">
            {breakdown.map((b) => (
              <li key={b.title}>
                <div className="font-medium text-slate-200 text-sm">{b.title}</div>
                <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

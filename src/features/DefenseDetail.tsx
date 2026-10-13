import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'

export default function DefenseDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  const defense = data?.defenses?.find((d) => d.id === id)

  if (!defense) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Defense not found</p>
        <Link to="/rankings" className="text-emerald-400 underline">← Rankings</Link>
      </div>
    )
  }

  const s = defense.stats || {}

  return (
    <div className="px-4 pt-4 pb-8">
      <Link to="/rankings" className="text-sm text-emerald-400 mb-4 inline-block">
        ← Rankings
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
          DST
        </div>
        <div>
          <h1 className="text-2xl font-bold">{defense.name}</h1>
          <p className="text-slate-400">{defense.abbreviation} · Team Defense</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-3xl font-bold text-emerald-400">{defense.grade.toFixed(1)}</span>
            <span className="text-sm text-slate-400">{defense.gradeLabel}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">DST rank #{defense.rank}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Season Stats</h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sacks" value={s.sacks} />
        <Stat label="Interceptions" value={s.ints} />
        <Stat label="Fumble Recoveries" value={s.fumblesRec} />
        <Stat label="Defensive TDs" value={s.defTDs} />
        {s.ptsAllowed != null && s.ptsAllowed > 0 && (
          <Stat label="Points Allowed" value={s.ptsAllowed} />
        )}
      </div>

      <p className="mt-8 text-xs text-slate-500">
        DST grade is relative among all 32 teams using sacks, INTs, fumble recoveries, and defensive TDs
        (fantasy-relevant categories). Data refreshed weekly on Tuesday.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0
  return (
    <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{v.toLocaleString()}</div>
    </div>
  )
}

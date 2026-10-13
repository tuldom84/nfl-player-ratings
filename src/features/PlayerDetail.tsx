import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  const player = data?.players.find((p) => p.id === id)

  if (!player) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Player not found</p>
        <Link to="/" className="text-emerald-400 underline">← Back</Link>
      </div>
    )
  }

  const s = player.stats

  return (
    <div className="px-4 pt-4 pb-8">
      <Link to="/rankings" className="text-sm text-emerald-400 mb-4 inline-block">
        ← Rankings
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-slate-400">
          {player.position}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <p className="text-slate-400">
            {player.team} · {player.position}
            {player.jersey ? ` · #${player.jersey}` : ''}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-3xl font-bold text-emerald-400">{player.grade.toFixed(1)}</span>
            <span className="text-sm text-slate-400">{player.gradeLabel}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Overall #{player.rankOverall} · Pos #{player.rankPos}
          </p>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Season Stats</h2>
      <div className="grid grid-cols-2 gap-3">
        {s.passYds != null && s.passYds > 0 && (
          <Stat label="Pass Yds" value={s.passYds} />
        )}
        {s.passTDs != null && s.passTDs > 0 && (
          <Stat label="Pass TDs" value={s.passTDs} />
        )}
        {s.interceptions != null && (
          <Stat label="INTs" value={s.interceptions} />
        )}
        {s.rushYds != null && s.rushYds > 0 && (
          <Stat label="Rush Yds" value={s.rushYds} />
        )}
        {s.rushTDs != null && s.rushTDs > 0 && (
          <Stat label="Rush TDs" value={s.rushTDs} />
        )}
        {s.receptions != null && s.receptions > 0 && (
          <Stat label="Receptions" value={s.receptions} />
        )}
        {s.recYds != null && s.recYds > 0 && (
          <Stat label="Rec Yds" value={s.recYds} />
        )}
        {s.recTDs != null && s.recTDs > 0 && (
          <Stat label="Rec TDs" value={s.recTDs} />
        )}
        {s.targets != null && s.targets > 0 && (
          <Stat label="Targets" value={s.targets} />
        )}
        {s.gamesPlayed != null && s.gamesPlayed > 0 && (
          <Stat label="Games" value={s.gamesPlayed} />
        )}
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Grade is a position-relative 0–100 score derived from weighted PPR contribution
        (volume + efficiency). Data refreshed weekly on Tuesday.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  )
}

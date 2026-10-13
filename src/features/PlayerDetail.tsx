import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'

function injuryColor(status?: string) {
  if (!status || status === 'Active') return 'bg-emerald-900/50 text-emerald-300'
  if (status === 'Questionable') return 'bg-amber-900/50 text-amber-300'
  if (status === 'Doubtful') return 'bg-orange-900/50 text-orange-300'
  return 'bg-rose-900/50 text-rose-300'
}

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
  const f = player.fantasy
  const week = data?.meta.projectionWeek || data?.meta.week

  return (
    <div className="px-4 pt-4 pb-8">
      <Link to="/rankings" className="text-sm text-emerald-400 mb-4 inline-block">
        ← Rankings
      </Link>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-slate-400">
          {player.position}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <p className="text-slate-400">
            {player.team} · {player.position}
            {player.jersey ? ` · #${player.jersey}` : ''}
          </p>
          {f?.injuryStatus && f.injuryStatus !== 'Active' && (
            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${injuryColor(f.injuryStatus)}`}>
              {f.injuryStatus}
            </span>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-3xl font-bold text-emerald-400">{player.grade.toFixed(1)}</span>
            <span className="text-sm text-slate-400">{player.gradeLabel}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Overall #{player.rankOverall} · Pos #{player.rankPos}
            {f?.positionRankEspn ? ` · ESPN #${f.positionRankEspn}` : ''}
          </p>
        </div>
      </div>

      {/* Fantasy summary */}
      {f && (
        <section className="mb-6 grid grid-cols-3 gap-2">
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg PPG</div>
            <div className="text-xl font-bold text-sky-400 tabular-nums">{f.avgPts.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500">{f.games}g full-PPR</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 border border-emerald-800/50 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Week {week} Proj
            </div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">
              {f.projectedPts.toFixed(1)}
            </div>
            <div className="text-[10px] text-slate-500">
              {f.homeAway === 'bye'
                ? 'BYE'
                : f.opponent
                  ? `${f.homeAway === 'home' ? 'vs' : '@'} ${f.opponent}`
                  : '—'}
            </div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Season</div>
            <div className="text-xl font-bold text-slate-200 tabular-nums">{f.seasonPts.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500">total PPR</div>
          </div>
        </section>
      )}

      {f?.matchupNote && (
        <div className="mb-6 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-sm text-slate-300">
          <span className="text-slate-500">Matchup: </span>
          {f.matchupNote}
          {f.matchupMultiplier != null && f.homeAway !== 'bye' && (
            <span className="text-slate-500"> · ×{f.matchupMultiplier.toFixed(2)}</span>
          )}
        </div>
      )}

      {f?.injuryDetail && f.injuryStatus !== 'Active' && (
        <div className="mb-6 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-900/50 text-sm text-rose-200">
          {f.injuryDetail}
        </div>
      )}

      {f?.percentOwned != null && (
        <p className="text-xs text-slate-500 mb-4">
          ESPN rostered in {f.percentOwned.toFixed(1)}% of leagues
        </p>
      )}

      <h2 className="text-lg font-semibold mb-3">Season Stats</h2>
      <div className="grid grid-cols-2 gap-3">
        {s.passYds != null && s.passYds > 0 && <Stat label="Pass Yds" value={s.passYds} />}
        {s.passTDs != null && s.passTDs > 0 && <Stat label="Pass TDs" value={s.passTDs} />}
        {s.interceptions != null && s.interceptions > 0 && <Stat label="INTs" value={s.interceptions} />}
        {s.rushYds != null && s.rushYds !== 0 && <Stat label="Rush Yds" value={s.rushYds} />}
        {s.rushTDs != null && s.rushTDs > 0 && <Stat label="Rush TDs" value={s.rushTDs} />}
        {s.receptions != null && s.receptions > 0 && <Stat label="Receptions" value={s.receptions} />}
        {s.recYds != null && s.recYds > 0 && <Stat label="Rec Yds" value={s.recYds} />}
        {s.recTDs != null && s.recTDs > 0 && <Stat label="Rec TDs" value={s.recTDs} />}
        {s.targets != null && s.targets > 0 && <Stat label="Targets" value={s.targets} />}
        {s.fgMade != null && s.fgMade > 0 && <Stat label="FG Made" value={s.fgMade} />}
        {s.xpMade != null && s.xpMade > 0 && <Stat label="XP Made" value={s.xpMade} />}
        {s.gamesPlayed != null && s.gamesPlayed > 0 && <Stat label="Games" value={s.gamesPlayed} />}
      </div>

      <p className="mt-8 text-xs text-slate-500 leading-relaxed">
        Full-PPR scoring (1 pt/rec). Weekly projection = season average × opponent DST factor
        (tougher defenses lower the projection) × injury availability. Data refreshed Tuesdays.
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

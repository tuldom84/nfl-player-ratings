import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Player, TeamDefense } from '../lib/types'

function GradeBadge({ grade, label }: { grade: number; label: string }) {
  const cls =
    label === 'Elite' ? 'grade-elite' :
    label === 'Great' ? 'grade-great' :
    label === 'Solid' ? 'grade-solid' :
    label === 'Average' ? 'grade-average' : 'grade-below'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {grade.toFixed(0)} · {label}
    </span>
  )
}

function PlayerCard({ player, useValue }: { player: Player; useValue?: boolean }) {
  const grade = useValue ? (player.valueGrade ?? player.grade) : player.grade
  const label = useValue ? (player.valueLabel ?? player.gradeLabel) : player.gradeLabel
  return (
    <Link
      to={`/player/${player.id}`}
      className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 active:scale-[0.98] transition-transform"
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-lg font-bold text-slate-400">
        {player.position}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-100 truncate">{player.name}</div>
        <div className="text-xs text-slate-400">
          {player.team} · {player.position}
          {useValue && player.rankOverall != null
            ? ` · #${player.rankOverall} overall`
            : player.rankPos != null
              ? ` · #${player.rankPos} ${player.position}`
              : ''}
        </div>
      </div>
      <GradeBadge grade={grade} label={label} />
    </Link>
  )
}

function DefenseCard({ defense }: { defense: TeamDefense }) {
  const grade = defense.valueGrade ?? defense.grade
  const label = defense.valueLabel ?? defense.gradeLabel
  return (
    <Link
      to={`/defense/${defense.id}`}
      className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 active:scale-[0.98] transition-transform"
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
        DST
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-100 truncate">{defense.name}</div>
        <div className="text-xs text-slate-400">{defense.abbreviation} · DST</div>
      </div>
      <GradeBadge grade={grade} label={label} />
    </Link>
  )
}

export default function Home() {
  const { data, loading, error } = useDataLake()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading ratings…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-2">{error || 'No data available'}</p>
        <p className="text-sm text-slate-500">
          Data is refreshed every Tuesday. Run <code className="bg-slate-800 px-1 rounded">npm run sync</code> to generate the data lake.
        </p>
      </div>
    )
  }

  // Cross-position value ranking for Top Overall
  const topOverall = [...data.players]
    .sort((a, b) => (b.valueGrade ?? b.grade) - (a.valueGrade ?? a.grade))
    .slice(0, 15)
  const topByPos = (pos: string) =>
    data.players.filter((p) => p.position === pos).sort((a, b) => b.grade - a.grade).slice(0, 5)
  const topDst = [...(data.defenses || [])]
    .sort((a, b) => (b.valueGrade ?? b.grade) - (a.valueGrade ?? a.grade))
    .slice(0, 5)

  return (
    <div className="px-4 pt-4 pb-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">NFL Player Ratings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Full-PPR value grades · Season {data.meta.season}
          {data.meta.lastSync && (
            <> · Updated {new Date(data.meta.lastSync).toLocaleDateString()}</>
          )}
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-1 text-emerald-400">Top Overall value</h2>
        <p className="text-xs text-slate-500 mb-3">
          Cross-position: avg PPG × availability × PPR positional weight
        </p>
        <div className="space-y-2">
          {topOverall.map((p) => (
            <PlayerCard key={p.id} player={p} useValue />
          ))}
        </div>
      </section>

      {(['QB', 'RB', 'WR', 'TE', 'K'] as const).map((pos) => {
        const list = topByPos(pos)
        if (!list.length) return null
        return (
          <section key={pos}>
            <h2 className="text-lg font-semibold mb-3 text-sky-400">Top {pos}</h2>
            <div className="space-y-2">
              {list.map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>
          </section>
        )
      })}

      {topDst.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-amber-400">Top DST</h2>
          <div className="space-y-2">
            {topDst.map((d) => (
              <DefenseCard key={d.id} defense={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

import { Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import type { Player, TeamDefense } from '../lib/types'
import { PlayerHeadshot } from '../components/PlayerHeadshot'
import DataLoadError from '../components/DataLoadError'
import ChipScroller from '../components/ChipScroller'

function GradeBadge({ grade, label, unit }: { grade: number; label: string; unit?: string }) {
  const cls =
    label === 'Elite' ? 'grade-elite' :
    label === 'Great' ? 'grade-great' :
    label === 'Solid' ? 'grade-solid' :
    label === 'Average' ? 'grade-average' : 'grade-below'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {grade.toFixed(0)}
      {unit ? ` ${unit}` : ''} · {label}
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
      <PlayerHeadshot src={player.headshot} name={player.name} position={player.position} size="md" />
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
      <GradeBadge grade={grade} label={label} unit={useValue ? 'val' : 'pos'} />
    </Link>
  )
}

function DefenseCard({ defense }: { defense: TeamDefense }) {
  // ALWAYS position-relative grade — never valueGrade
  const posGrade = defense.grade
  const posLabel = defense.gradeLabel
  const posRank = defense.rank // preserved as position rank among DST
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
        <div className="text-xs text-slate-400">
          {defense.abbreviation} · #{posRank} DST
        </div>
      </div>
      <GradeBadge grade={posGrade} label={posLabel} unit="pos" />
    </Link>
  )
}

const JUMPS = [
  { id: 'top-overall', label: 'Overall' },
  { id: 'top-QB', label: 'QB' },
  { id: 'top-RB', label: 'RB' },
  { id: 'top-WR', label: 'WR' },
  { id: 'top-TE', label: 'TE' },
  { id: 'top-K', label: 'K' },
  { id: 'top-DST', label: 'DST' },
] as const

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    return <DataLoadError message={error || 'No data available'} />
  }

  const topOverall = [...data.players]
    .sort((a, b) => (b.valueGrade ?? b.grade) - (a.valueGrade ?? a.grade))
    .slice(0, 15)
  const topByPos = (pos: string) =>
    data.players.filter((p) => p.position === pos).sort((a, b) => b.grade - a.grade).slice(0, 5)
  // Sort strictly by position-relative grade (defense.grade), never valueGrade
  const topDst = [...(data.defenses || [])]
    .sort((a, b) => b.grade - a.grade || a.abbreviation.localeCompare(b.abbreviation))
    .slice(0, 5)

  const visibleJumps = JUMPS.filter((j) => {
    if (j.id === 'top-overall') return topOverall.length > 0
    if (j.id === 'top-DST') return topDst.length > 0
    return topByPos(j.label).length > 0
  })

  return (
    <div className="px-4 lg:px-6 pt-4 pb-8 space-y-8">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">NFL Player Ratings</h1>
          <Link
            to="/about"
            className="lg:hidden shrink-0 text-sm font-medium text-slate-400 hover:text-emerald-400 pt-1"
          >
            About
          </Link>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Full-PPR value grades · Season {data.meta.season}
          {data.meta.lastSync && (
            <> · Updated {new Date(data.meta.lastSync).toLocaleDateString()}</>
          )}
        </p>
      </header>

      {visibleJumps.length > 1 && (
        <ChipScroller className="-mt-4">
          {visibleJumps.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => scrollToSection(j.id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              {j.label}
            </button>
          ))}
        </ChipScroller>
      )}

      <section id="top-overall" className="scroll-mt-3">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-lg font-semibold text-emerald-400">Top Overall value</h2>
          <Link to="/rankings?pos=ALL" className="text-xs font-medium text-slate-400 hover:text-emerald-400">
            See all
          </Link>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Cross-position: avg PPG × availability × PPR positional weight
        </p>
        <div className="space-y-2">
          {topOverall.map((p) => (
            <PlayerCard key={p.id} player={p} useValue />
          ))}
        </div>
      </section>

      <div className="space-y-8 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-8">
        {(['QB', 'RB', 'WR', 'TE', 'K'] as const).map((pos) => {
          const list = topByPos(pos)
          if (!list.length) return null
          return (
            <section key={pos} id={`top-${pos}`} className="scroll-mt-3">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold text-sky-400">Top {pos}</h2>
                <Link
                  to={`/rankings?pos=${pos}`}
                  className="text-xs font-medium text-slate-400 hover:text-emerald-400"
                >
                  See all
                </Link>
              </div>
              <div className="space-y-2">
                {list.map((p) => (
                  <PlayerCard key={p.id} player={p} />
                ))}
              </div>
            </section>
          )
        })}

        {topDst.length > 0 && (
          <section id="top-DST" className="scroll-mt-3">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="text-lg font-semibold text-amber-400">Top DST</h2>
              <Link to="/rankings?pos=DST" className="text-xs font-medium text-slate-400 hover:text-emerald-400">
                See all
              </Link>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Position grade among defenses only (not overall value)
            </p>
            <div className="space-y-2">
              {topDst.map((d) => (
                <DefenseCard key={d.id} defense={d} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

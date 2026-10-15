import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'

function pg(total: number | undefined, games: number): number | undefined {
  if (total == null) return undefined
  return Math.round((total / Math.max(games, 1)) * 10) / 10
}

type Row = { label: string; season: number | string; perGame?: number | string }

function StatTable({ rows, games }: { rows: Row[]; games: number }) {
  return (
    <>
      <p className="text-[11px] text-slate-500 mb-2">÷ {games} games for averages</p>
      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="grid grid-cols-3 gap-0 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span>Stat</span>
          <span className="text-right">Season</span>
          <span className="text-right">Per game</span>
        </div>
        <ul>
          {rows.map((row) => (
            <li
              key={row.label}
              className="grid grid-cols-3 gap-0 px-3 py-2.5 border-b border-slate-800/80 last:border-0 text-sm"
            >
              <span className="text-slate-400">{row.label}</span>
              <span className="text-right tabular-nums font-medium text-slate-100">
                {typeof row.season === 'number' ? row.season.toLocaleString() : row.season}
              </span>
              <span className="text-right tabular-nums text-slate-300">
                {row.perGame != null
                  ? typeof row.perGame === 'number'
                    ? row.perGame.toLocaleString()
                    : row.perGame
                  : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>

  const offense = data?.teamOffenses?.find((o) => o.id === id)
  const defense = data?.defenses?.find((d) => d.id === id)

  if (!offense && !defense) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Team not found</p>
        <Link to="/rankings" className="text-emerald-400 underline">
          ← Rankings
        </Link>
      </div>
    )
  }

  const name = offense?.name || defense?.name || 'Team'
  const abbr = offense?.abbreviation || defense?.abbreviation || ''
  const offRps = offense?.rps ?? 0
  const defRps = defense?.rps ?? defense?.grade ?? 0
  const power = Math.round(((offRps + defRps) / 2) * 10) / 10

  // Offense rows
  const os = offense?.stats || {}
  const og = Math.max(1, os.gamesPlayed || 1)
  const offRows: Row[] = []
  offRows.push({ label: 'Games played', season: og })
  if (os.pointsPerGame != null)
    offRows.push({
      label: 'Points / game',
      season: Math.round(os.pointsPerGame * 10) / 10,
      perGame: Math.round(os.pointsPerGame * 10) / 10,
    })
  if (os.totalPoints)
    offRows.push({ label: 'Total points', season: os.totalPoints, perGame: pg(os.totalPoints, og) })
  if (os.yardsPerGame != null)
    offRows.push({
      label: 'Yards / game',
      season: Math.round(os.yardsPerGame * 10) / 10,
      perGame: Math.round(os.yardsPerGame * 10) / 10,
    })
  if (os.totalYards)
    offRows.push({ label: 'Total yards', season: os.totalYards, perGame: pg(os.totalYards, og) })
  if (os.passYardsPerGame != null)
    offRows.push({
      label: 'Pass YPG',
      season: Math.round(os.passYardsPerGame * 10) / 10,
      perGame: Math.round(os.passYardsPerGame * 10) / 10,
    })
  if (os.rushYardsPerGame != null)
    offRows.push({
      label: 'Rush YPG',
      season: Math.round(os.rushYardsPerGame * 10) / 10,
      perGame: Math.round(os.rushYardsPerGame * 10) / 10,
    })
  if (os.qbRating)
    offRows.push({ label: 'QB rating', season: Math.round(os.qbRating * 10) / 10 })
  if (os.totalTDs != null)
    offRows.push({ label: 'Total TDs', season: os.totalTDs, perGame: pg(os.totalTDs, og) })
  if (os.passTDs != null)
    offRows.push({ label: 'Pass TDs', season: os.passTDs, perGame: pg(os.passTDs, og) })
  if (os.rushTDs != null)
    offRows.push({ label: 'Rush TDs', season: os.rushTDs, perGame: pg(os.rushTDs, og) })
  if (os.interceptions != null)
    offRows.push({
      label: 'Interceptions',
      season: os.interceptions,
      perGame: pg(os.interceptions, og),
    })
  if (os.fumblesLost != null)
    offRows.push({
      label: 'Fumbles lost',
      season: os.fumblesLost,
      perGame: pg(os.fumblesLost, og),
    })
  if (os.sacksAllowed != null)
    offRows.push({
      label: 'Sacks allowed',
      season: os.sacksAllowed,
      perGame: pg(os.sacksAllowed, og),
    })

  // Defense rows
  const ds = (defense?.stats || {}) as Record<string, number | undefined>
  const dg = Math.max(1, ds.gamesPlayed || defense?.fantasy?.gamesPlayed || 1)
  const defRows: Row[] = []
  defRows.push({ label: 'Games played', season: dg })
  const dAdd = (label: string, v: number | undefined) => {
    if (v == null) return
    defRows.push({ label, season: v, perGame: pg(v, dg) })
  }
  dAdd('Sacks', ds.sacks)
  dAdd('Interceptions', ds.ints)
  dAdd('Fumbles recovered', ds.fumblesRec)
  dAdd('Fumbles forced', ds.fumblesForced)
  dAdd('Defensive TDs', ds.defTDs)
  dAdd('Safeties', ds.safeties)
  dAdd('Kicks blocked', ds.kicksBlocked)
  dAdd('Points allowed', ds.ptsAllowed)
  dAdd('Yards allowed', ds.yardsAllowed)

  return (
    <div className="px-4 pt-4 pb-8">
      <Link to="/rankings" className="text-sm text-emerald-400 mb-4 inline-block">
        ← Rankings
      </Link>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
          {abbr || 'TM'}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-slate-400">{abbr} · Team power profile</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-slate-900 rounded-xl p-3 border border-amber-800/40 text-center">
          <div className="text-[10px] uppercase tracking-wide text-amber-400/90">Power</div>
          <div className="text-2xl font-bold text-amber-300 tabular-nums">{power.toFixed(1)}</div>
          <div className="text-[10px] text-slate-500">(OFF+DEF)/2</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-violet-800/40 text-center">
          <div className="text-[10px] uppercase tracking-wide text-violet-400/90">OFF RPS</div>
          <div className="text-2xl font-bold text-violet-300 tabular-nums">{offRps.toFixed(1)}</div>
          <div className="text-[10px] text-slate-500">{offense?.rpsLabel ?? '—'}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-sky-800/40 text-center">
          <div className="text-[10px] uppercase tracking-wide text-sky-400/90">DEF RPS</div>
          <div className="text-2xl font-bold text-sky-300 tabular-nums">{defRps.toFixed(1)}</div>
          <div className="text-[10px] text-slate-500">
            {defense?.rpsLabel ?? defense?.gradeLabel ?? '—'}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 text-xs">
        {offense && (
          <Link
            to={`/offense/${offense.id}`}
            className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-violet-300"
          >
            Offense only →
          </Link>
        )}
        {defense && (
          <Link
            to={`/defense/${defense.id}`}
            className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-sky-300"
          >
            Defense only →
          </Link>
        )}
      </div>

      {offense && (
        <>
          <h2 className="text-lg font-semibold mb-1 text-violet-300">Offense</h2>
          <StatTable rows={offRows} games={og} />
        </>
      )}

      {defense && (
        <>
          <h2 className="text-lg font-semibold mb-1 text-sky-300">Defense</h2>
          <StatTable rows={defRows} games={dg} />
        </>
      )}

      <p className="text-xs text-slate-500 leading-relaxed">
        Power ranking = average of offense RPS and defense RPS (real football value, not fantasy).
      </p>
    </div>
  )
}

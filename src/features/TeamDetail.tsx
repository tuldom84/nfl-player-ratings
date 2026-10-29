import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { RankSummary } from '../components/RankSummary'
import { withStatRanks, rankByField, type StatRowDef } from '../lib/statRanks'

function pg(total: number | undefined, games: number): number | undefined {
  if (total == null) return undefined
  return Math.round((total / Math.max(games, 1)) * 10) / 10
}

function StatTable({
  rows,
  games,
}: {
  rows: (StatRowDef & { rank?: number; of?: number })[]
  games: number
}) {
  return (
    <>
      <p className="text-[11px] text-slate-500 mb-2">÷ {games} games · rank among 32 teams</p>
      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="grid grid-cols-4 gap-0 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span>Stat</span>
          <span className="text-right">Season</span>
          <span className="text-right">Per game</span>
          <span className="text-right">Rank</span>
        </div>
        <ul>
          {rows.map((row) => (
            <li
              key={row.label}
              className="grid grid-cols-4 gap-0 px-3 py-2.5 border-b border-slate-800/80 last:border-0 text-sm"
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
              <span
                className={`text-right tabular-nums font-medium ${
                  row.rank != null && row.rank <= 5
                    ? 'text-emerald-400'
                    : row.rank != null && row.rank > 24
                      ? 'text-rose-400/90'
                      : 'text-slate-400'
                }`}
              >
                {row.rank != null ? `#${row.rank}` : '—'}
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

  const offense = data?.teamOffenses?.find((o) => o.id === id)
  const defense = data?.defenses?.find((d) => d.id === id)
  const allOff = data?.teamOffenses || []
  const allDef = data?.defenses || []

  const powerList = useMemo(() => {
    const byId = new Map<string, { id: string; power: number }>()
    for (const o of allOff) {
      const d = allDef.find((x) => x.id === o.id)
      const defRps = d?.rps ?? d?.grade ?? 0
      byId.set(o.id, { id: o.id, power: (o.rps + defRps) / 2 })
    }
    for (const d of allDef) {
      if (!byId.has(d.id)) {
        byId.set(d.id, { id: d.id, power: (d.rps ?? d.grade ?? 0) / 2 })
      }
    }
    return [...byId.values()]
  }, [allOff, allDef])

  const powerRankMap = useMemo(
    () => rankByField(powerList, (t) => t.power),
    [powerList]
  )

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>

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
  const powerEntry = powerList.find((t) => t.id === id)
  const powerRank = powerEntry ? powerRankMap.get(powerEntry) : undefined

  const os = offense?.stats || {}
  const og = Math.max(1, os.gamesPlayed || 1)
  const offRows: StatRowDef[] = []
  offRows.push({ label: 'Games played', season: og, noRank: true })
  if (os.pointsPerGame != null)
    offRows.push({
      label: 'Points / game',
      season: Math.round(os.pointsPerGame * 10) / 10,
      value: os.pointsPerGame,
      key: 'pointsPerGame',
      perGame: Math.round(os.pointsPerGame * 10) / 10,
    })
  if (os.totalPoints)
    offRows.push({
      label: 'Total points',
      season: os.totalPoints,
      value: os.totalPoints,
      key: 'totalPoints',
      perGame: pg(os.totalPoints, og),
      noRank: true,
    })
  if (os.yardsPerGame != null)
    offRows.push({
      label: 'Net yards / game',
      season: Math.round(os.yardsPerGame * 10) / 10,
      value: os.yardsPerGame,
      key: 'yardsPerGame',
      perGame: Math.round(os.yardsPerGame * 10) / 10,
    })
  if (os.totalYards)
    offRows.push({
      label: 'Total yards (gross)',
      season: os.totalYards,
      value: os.totalYards,
      key: 'totalYards',
      perGame: pg(os.totalYards, og),
      noRank: true,
    })
  if (os.passYardsPerGame != null)
    offRows.push({
      label: 'Pass YPG',
      season: Math.round(os.passYardsPerGame * 10) / 10,
      value: os.passYardsPerGame,
      key: 'passYardsPerGame',
      perGame: Math.round(os.passYardsPerGame * 10) / 10,
    })
  if (os.rushYardsPerGame != null)
    offRows.push({
      label: 'Rush YPG',
      season: Math.round(os.rushYardsPerGame * 10) / 10,
      value: os.rushYardsPerGame,
      key: 'rushYardsPerGame',
      perGame: Math.round(os.rushYardsPerGame * 10) / 10,
    })
  if (os.qbRating)
    offRows.push({
      label: 'QB rating',
      season: Math.round(os.qbRating * 10) / 10,
      value: os.qbRating,
      key: 'qbRating',
    })
  if (os.totalTDs != null)
    offRows.push({
      label: 'Total TDs',
      season: os.totalTDs,
      value: os.totalTDs,
      key: 'totalTDs',
      perGame: pg(os.totalTDs, og),
    })
  if (os.passTDs != null)
    offRows.push({
      label: 'Pass TDs',
      season: os.passTDs,
      value: os.passTDs,
      key: 'passTDs',
      perGame: pg(os.passTDs, og),
    })
  if (os.rushTDs != null)
    offRows.push({
      label: 'Rush TDs',
      season: os.rushTDs,
      value: os.rushTDs,
      key: 'rushTDs',
      perGame: pg(os.rushTDs, og),
    })
  if (os.interceptions != null)
    offRows.push({
      label: 'Interceptions',
      season: os.interceptions,
      value: os.interceptions,
      key: 'interceptions',
      perGame: pg(os.interceptions, og),
    })
  if (os.fumblesLost != null)
    offRows.push({
      label: 'Fumbles lost',
      season: os.fumblesLost,
      value: os.fumblesLost,
      key: 'fumblesLost',
      perGame: pg(os.fumblesLost, og),
    })
  if (os.sacksAllowed != null)
    offRows.push({
      label: 'Sacks allowed',
      season: os.sacksAllowed,
      value: os.sacksAllowed,
      key: 'sacksAllowed',
      perGame: pg(os.sacksAllowed, og),
    })

  const rankedOff = withStatRanks(
    offRows,
    allOff.map((o) => ({ stats: o.stats as Record<string, number | undefined> })),
    allOff.length
  )

  const ds = (defense?.stats || {}) as Record<string, number | undefined>
  const dg = Math.max(1, ds.gamesPlayed || defense?.fantasy?.gamesPlayed || 1)
  const defRows: StatRowDef[] = []
  defRows.push({ label: 'Games played', season: dg, noRank: true })
  const dAdd = (label: string, v: number | undefined, key?: StatRowDef['key'], noRank = false) => {
    if (v == null) return
    defRows.push({ label, season: v, value: v, key, perGame: pg(v, dg), noRank })
  }
  dAdd('Sacks', ds.sacks, undefined, true)
  dAdd('Interceptions', ds.ints, 'ints')
  dAdd('Fumbles recovered', ds.fumblesRec, 'fumblesRec')
  dAdd('Fumbles forced', ds.fumblesForced, 'fumblesForced')
  dAdd('Defensive TDs', ds.defTDs, 'defTDs')
  dAdd('Safeties', ds.safeties, 'safeties')
  dAdd('Kicks blocked', ds.kicksBlocked)
  dAdd('Points allowed', ds.ptsAllowed, 'ptsAllowed')
  dAdd('Yards allowed', ds.yardsAllowed, 'yardsAllowed')

  let rankedDef = withStatRanks(
    defRows,
    allDef.map((d) => ({
      stats: {
        ...(d.stats as Record<string, number | undefined>),
        gamesPlayed:
          (d.stats as Record<string, number | undefined>).gamesPlayed ||
          d.fantasy?.gamesPlayed ||
          d.fantasy?.games ||
          1,
      },
    })),
    allDef.length
  )
  if (ds.sacks != null) {
    const vals = allDef.map((d) => {
      const st = d.stats as Record<string, number | undefined>
      const g = Math.max(1, st.gamesPlayed || d.fantasy?.gamesPlayed || d.fantasy?.games || 1)
      return (st.sacks || 0) / g
    })
    const my = (ds.sacks || 0) / dg
    const sr = [...vals].sort((a, b) => b - a).filter((v) => v > my).length + 1
    rankedDef = rankedDef.map((r) =>
      r.label === 'Sacks' ? { ...r, rank: sr, of: allDef.length } : r
    )
  }

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

      <RankSummary
        title="Season ranks"
        chips={[
          {
            id: 'power',
            label: 'Power rank',
            rank: powerRank != null ? `#${powerRank}` : '—',
            score: `${power.toFixed(1)} power`,
            sublabel: '(OFF+DEF)/2',
            accent: 'amber',
          },
          {
            id: 'off',
            label: 'OFF RPS',
            rank: offense ? `#${offense.rank}` : '—',
            score: `${offRps.toFixed(1)}`,
            sublabel: offense?.rpsLabel ?? '—',
            accent: 'violet',
          },
          {
            id: 'def',
            label: 'DEF rank',
            rank: defense?.rank != null ? `#${defense.rank}` : '—',
            score: `${defRps.toFixed(1)}`,
            sublabel: defense?.rpsLabel ?? defense?.gradeLabel ?? '—',
            accent: 'sky',
          },
        ]}
        breakdown={[
          {
            title: 'Power rank',
            body: 'Average of offense RPS and defense RPS (real football, not fantasy). Ranked among all 32 NFL teams. #1 = strongest overall side of the ball combination.',
          },
          {
            title: 'OFF RPS rank',
            body: 'Team offense real-football value among 32 teams (uses net yards/game). Drives DST matchup multipliers.',
          },
          {
            title: 'DEF rank',
            body: 'Team defense fantasy grade rank among 32 DSTs (league scoring settings).',
          },
        ]}
      />

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
          <StatTable rows={rankedOff} games={og} />
        </>
      )}

      {defense && (
        <>
          <h2 className="text-lg font-semibold mb-1 text-sky-300">Defense</h2>
          <StatTable rows={rankedDef} games={dg} />
        </>
      )}

      <p className="text-xs text-slate-500 leading-relaxed">
        Power ranking = average of offense RPS and defense RPS (real football value, not fantasy).
        Offense rankings use <strong className="text-slate-400">net yards/game</strong> (not gross
        total yards).
      </p>
    </div>
  )
}

import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { RankSummary } from '../components/RankSummary'
import { withStatRanks, type StatRowDef } from '../lib/statRanks'

function pg(total: number | undefined, games: number): number | undefined {
  if (total == null) return undefined
  return Math.round((total / Math.max(games, 1)) * 10) / 10
}

export default function OffenseDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()

  const offense = data?.teamOffenses?.find((o) => o.id === id)
  const peers = data?.teamOffenses || []

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>

  if (!offense) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Offense not found</p>
        <Link to="/rankings" className="text-emerald-400 underline">
          ← Rankings
        </Link>
      </div>
    )
  }

  const s = offense.stats || {}
  const games = Math.max(1, s.gamesPlayed || 1)

  const rows: StatRowDef[] = []
  rows.push({
    label: 'Games played', season: games, noRank: true,
    value: undefined
  })

  if (s.pointsPerGame != null) {
    rows.push({
      label: 'Points / game',
      season: Math.round(s.pointsPerGame * 10) / 10,
      value: s.pointsPerGame,
      key: 'pointsPerGame',
      perGame: Math.round(s.pointsPerGame * 10) / 10,
    })
    if (s.totalPoints) {
      rows.push({
        label: 'Total points',
        season: s.totalPoints,
        value: s.totalPoints,
        key: 'totalPoints',
        perGame: pg(s.totalPoints, games),
      })
    }
  } else if (s.totalPoints) {
    rows.push({
      label: 'Total points',
      season: s.totalPoints,
      value: s.totalPoints,
      key: 'totalPoints',
      perGame: pg(s.totalPoints, games),
    })
  }

  if (s.yardsPerGame != null) {
    rows.push({
      label: 'Yards / game',
      season: Math.round(s.yardsPerGame * 10) / 10,
      value: s.yardsPerGame,
      key: 'yardsPerGame',
      perGame: Math.round(s.yardsPerGame * 10) / 10,
    })
  }
  if (s.totalYards) {
    rows.push({
      label: 'Total yards',
      season: s.totalYards,
      value: s.totalYards,
      key: 'totalYards',
      perGame: pg(s.totalYards, games),
    })
  }
  if (s.passYardsPerGame != null) {
    rows.push({
      label: 'Pass YPG',
      season: Math.round(s.passYardsPerGame * 10) / 10,
      value: s.passYardsPerGame,
      key: 'passYardsPerGame',
      perGame: Math.round(s.passYardsPerGame * 10) / 10,
    })
  }
  if (s.rushYardsPerGame != null) {
    rows.push({
      label: 'Rush YPG',
      season: Math.round(s.rushYardsPerGame * 10) / 10,
      value: s.rushYardsPerGame,
      key: 'rushYardsPerGame',
      perGame: Math.round(s.rushYardsPerGame * 10) / 10,
    })
  }
  if (s.qbRating) {
    rows.push({
      label: 'QB rating',
      season: Math.round(s.qbRating * 10) / 10,
      value: s.qbRating,
      key: 'qbRating',
    })
  }
  if (s.totalTDs != null) {
    rows.push({
      label: 'Total TDs',
      season: s.totalTDs,
      value: s.totalTDs,
      key: 'totalTDs',
      perGame: pg(s.totalTDs, games),
    })
  }
  if (s.passTDs != null) {
    rows.push({
      label: 'Pass TDs',
      season: s.passTDs,
      value: s.passTDs,
      key: 'passTDs',
      perGame: pg(s.passTDs, games),
    })
  }
  if (s.rushTDs != null) {
    rows.push({
      label: 'Rush TDs',
      season: s.rushTDs,
      value: s.rushTDs,
      key: 'rushTDs',
      perGame: pg(s.rushTDs, games),
    })
  }
  if (s.interceptions != null) {
    rows.push({
      label: 'Interceptions',
      season: s.interceptions,
      value: s.interceptions,
      key: 'interceptions',
      perGame: pg(s.interceptions, games),
    })
  }
  if (s.fumblesLost != null) {
    rows.push({
      label: 'Fumbles lost',
      season: s.fumblesLost,
      value: s.fumblesLost,
      key: 'fumblesLost',
      perGame: pg(s.fumblesLost, games),
    })
  }
  if (s.sacksAllowed != null) {
    rows.push({
      label: 'Sacks allowed',
      season: s.sacksAllowed,
      value: s.sacksAllowed,
      key: 'sacksAllowed',
      perGame: pg(s.sacksAllowed, games),
    })
  }

  const peerPayload = peers.map((o) => ({
    stats: o.stats as Record<string, number | undefined>,
  }))
  const rankedRows = withStatRanks(rows, peerPayload, peers.length)

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <Link to="/rankings" className="text-sm text-emerald-400">
          ← Rankings
        </Link>
        <Link to={`/team/${offense.id}`} className="text-sm text-violet-400">
          Full team →
        </Link>
      </div>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
          OFF
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{offense.name}</h1>
          <p className="text-slate-400">{offense.abbreviation} · Team Offense</p>
        </div>
      </div>

      <RankSummary
        title="Season ranks"
        chips={[
          {
            id: 'rps',
            label: 'OFF RPS rank',
            rank: `#${offense.rank}`,
            score: `${offense.rps.toFixed(1)} RPS`,
            sublabel: offense.rpsLabel,
            accent: 'violet',
          },
        ]}
        breakdown={[
          {
            title: 'Offense RPS rank',
            body: 'Real-football team offense value among 32 NFL teams. Weights PPG, YPG, TDs, QB rating; penalizes turnovers and sacks allowed. Used to adjust DST weekly projections — not fantasy scoring.',
          },
        ]}
      />

      <div className="bg-slate-900 rounded-xl p-4 border border-violet-800/50 mb-6">
        <div className="text-[10px] uppercase tracking-wide text-violet-400/90">
          Offense RPS (real football)
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-3xl font-bold text-violet-300 tabular-nums">
              {offense.rps.toFixed(1)}
            </div>
            <div className="text-sm text-slate-400">{offense.rpsLabel}</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            Rank #{offense.rank} of 32
            <br />
            Not fantasy scoring
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-2">Season stats</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Rates and totals with rank among 32 offenses
      </p>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
        <div className="grid grid-cols-4 gap-0 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span>Stat</span>
          <span className="text-right">Season</span>
          <span className="text-right">Per game</span>
          <span className="text-right">Rank</span>
        </div>
        <ul>
          {rankedRows.map((row) => (
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

      <p className="mt-4 text-xs text-slate-500 leading-relaxed">
        Offense RPS weights PPG, YPG, TDs, QB rating, and penalizes turnovers & sacks allowed. Used
        to adjust <strong className="text-slate-400">DST weekly projections</strong>.
      </p>
    </div>
  )
}

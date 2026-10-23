import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { RankSummary } from '../components/RankSummary'
import { GameLogSection } from '../components/GameLogSection'
import { withStatRanks, rankByField, type StatRowDef } from '../lib/statRanks'

function pg(total: number | undefined, games: number): number | undefined {
  if (total == null) return undefined
  return Math.round((total / Math.max(games, 1)) * 10) / 10
}

export default function DefenseDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()

  const defense = data?.defenses?.find((d) => d.id === id)
  const peers = data?.defenses || []

  const rpsRankMap = useMemo(
    () => rankByField(peers, (d) => d.rps ?? d.grade),
    [peers]
  )

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>

  if (!defense) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Defense not found</p>
        <Link to="/rankings" className="text-emerald-400 underline">
          ← Rankings
        </Link>
      </div>
    )
  }

  const s = (defense.stats || {}) as Record<string, number | undefined>
  const f = defense.fantasy
  const games = Math.max(1, s.gamesPlayed || f?.gamesPlayed || f?.games || 1)
  const week = data?.meta.projectionWeek || data?.meta.week

  const rows: StatRowDef[] = []
  const add = (label: string, season: number | undefined, key: StatRowDef['key'], showZero = true) => {
    if (season == null) return
    if (!showZero && season === 0) return
    rows.push({
      label,
      key,
      value: season,
      season: Number.isInteger(season) ? season : Math.round(season * 10) / 10,
      perGame: pg(season, games),
    })
  }

  rows.push({ label: 'Games played', season: games, noRank: true })
  // Sacks: higher is better for DST (unlike QB sacks taken)
  if (s.sacks != null) {
    rows.push({
      label: 'Sacks',
      value: s.sacks,
      season: s.sacks,
      perGame: pg(s.sacks, games),
      noRank: true, // ranked manually below
    })
  }
  add('Interceptions', s.ints, 'ints', true)
  add('Fumbles recovered', s.fumblesRec, 'fumblesRec', true)
  add('Fumbles forced', s.fumblesForced, 'fumblesForced', true)
  add('Defensive TDs', s.defTDs, 'defTDs', true)
  add('Safeties', s.safeties, 'safeties', true)
  add('Kicks blocked', s.kicksBlocked, undefined, true)
  add('Points allowed', s.ptsAllowed, 'ptsAllowed', true)
  add('Yards allowed', s.yardsAllowed, 'yardsAllowed', true)

  const peerPayload = peers.map((d) => ({
    stats: d.stats as Record<string, number | undefined>,
  }))
  const sackVals = peers.map((d) => (d.stats as Record<string, number | undefined>).sacks || 0)
  const sackRank =
    s.sacks != null
      ? [...sackVals].sort((a, b) => b - a).indexOf(s.sacks) + 1
      : undefined

  let rankedRows = withStatRanks(rows, peerPayload, peers.length)
  rankedRows = rankedRows.map((r) => {
    if (r.label === 'Sacks' && sackRank != null) {
      return { ...r, rank: sackRank, of: peers.length }
    }
    return r
  })

  const rpsRank = rpsRankMap.get(defense)
  const posRank = defense.rank
  const valueRank = defense.rankValue

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <Link to="/rankings" className="text-sm text-emerald-400">
          ← Rankings
        </Link>
        <Link to={`/team/${defense.id}`} className="text-sm text-violet-400">
          Full team →
        </Link>
      </div>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
          DST
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{defense.name}</h1>
          <p className="text-slate-400">{defense.abbreviation} · Team Defense</p>
        </div>
      </div>

      <RankSummary
        title="Season ranks"
        chips={[
          {
            id: 'pos',
            label: 'DST rank',
            rank: posRank != null ? `#${posRank}` : '—',
            score: `${defense.grade.toFixed(1)} grade`,
            sublabel: 'of 32',
            accent: 'sky',
          },
          {
            id: 'value',
            label: 'Value rank',
            rank: valueRank != null ? `#${valueRank}` : '—',
            score:
              defense.valueGrade != null ? `${defense.valueGrade.toFixed(1)} value` : undefined,
            sublabel: 'cross-position',
            accent: 'emerald',
          },
          {
            id: 'rps',
            label: 'RPS rank',
            rank: rpsRank != null ? `#${rpsRank}` : '—',
            score: `${(defense.rps ?? defense.grade).toFixed(1)} RPS`,
            sublabel: defense.rpsLabel ?? defense.gradeLabel,
            accent: 'violet',
          },
        ]}
        breakdown={[
          {
            title: 'DST rank',
            body: 'Fantasy position grade among all 32 team defenses using your league DST scoring (sacks, turnovers, TDs, PA/YA brackets). #1 = highest fantasy production.',
          },
          {
            title: 'Value rank',
            body: 'Cross-position fantasy value vs the full player pool (scarcity-weighted). DST is weighted lower than skill positions in typical PPR value.',
          },
          {
            title: 'RPS rank',
            body: 'Real-football defensive value (not fantasy scoring). Ranked among 32 team defenses.',
          },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900 rounded-xl p-3 border border-violet-800/40">
          <div className="text-[10px] uppercase tracking-wide text-violet-400/90">RPS</div>
          <div className="text-2xl font-bold text-violet-300 tabular-nums">
            {(defense.rps ?? defense.grade).toFixed(1)}
          </div>
          <div className="text-xs text-slate-400">{defense.rpsLabel ?? defense.gradeLabel}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Pos grade</div>
          <div className="text-2xl font-bold text-sky-400 tabular-nums">
            {defense.grade.toFixed(1)}
          </div>
          <div className="text-xs text-slate-400">{defense.gradeLabel}</div>
        </div>
      </div>

      {f && (
        <section className="mb-6 grid grid-cols-3 gap-2">
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg PPG</div>
            <div className="text-xl font-bold text-sky-400 tabular-nums">{f.avgPts.toFixed(1)}</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 border border-emerald-800/50 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Wk {week} Proj</div>
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
            <div className="text-xl font-bold text-slate-200 tabular-nums">
              {f.seasonPts.toFixed(1)}
            </div>
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

      <GameLogSection kind="dst" teamId={defense.id} />

      <h2 className="text-lg font-semibold mb-2">Season stats</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Totals, per-game, and rank among 32 defenses (lower better for PA / YA)
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
        DST grades use league scoring. Weekly projection adjusts for opponent{' '}
        <strong className="text-slate-400">offense RPS</strong>.
      </p>
    </div>
  )
}

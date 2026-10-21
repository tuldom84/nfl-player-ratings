import { useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { nflPasserRating } from '../lib/rps'
import { RankSummary } from '../components/RankSummary'
import {
  withStatRanks,
  rankByField,
  type StatRowDef,
} from '../lib/statRanks'
import type { Player, PlayerStats } from '../lib/types'

function injuryColor(status?: string) {
  if (!status || status === 'Active') return 'bg-emerald-900/50 text-emerald-300'
  if (status === 'Questionable') return 'bg-amber-900/50 text-amber-300'
  if (status === 'Doubtful') return 'bg-orange-900/50 text-orange-300'
  return 'bg-rose-900/50 text-rose-300'
}

function pg(total: number | undefined, games: number): number | undefined {
  if (total == null) return undefined
  return Math.round((total / Math.max(games, 1)) * 10) / 10
}

function buildStatRows(player: Player, games: number): StatRowDef[] {
  const s = player.stats as PlayerStats & Record<string, number | undefined>
  const pos = player.position
  const rows: StatRowDef[] = []

  const add = (
    label: string,
    season: number | undefined,
    key: StatRowDef['key'],
    showZero = false
  ) => {
    if (season == null) return
    if (!showZero && season === 0) return
    const val = Number.isInteger(season) ? season : Math.round(season * 10) / 10
    rows.push({
      label,
      key,
      value: typeof season === 'number' ? season : undefined,
      season: val,
      perGame: pg(season, games),
    })
  }

  rows.push({ label: 'Games played', season: games, value: games, noRank: true })
  if (s.teamGamesPlayed) {
    rows.push({ label: 'Team games', season: s.teamGamesPlayed, noRank: true })
  }

  if (pos === 'QB') {
    const rating = nflPasserRating(
      s.completions || 0,
      s.passAtt || 0,
      s.passYds || 0,
      s.passTDs || 0,
      s.interceptions || 0
    )
    const compPct =
      s.passAtt && s.passAtt > 0
        ? Math.round(((s.completions || 0) / s.passAtt) * 1000) / 10
        : undefined
    const ypa =
      s.passAtt && s.passAtt > 0
        ? Math.round(((s.passYds || 0) / s.passAtt) * 100) / 100
        : undefined

    rows.push({
      label: 'Passer rating',
      season: rating,
      value: rating,
      key: 'passerRating',
      perGame: undefined,
    })
    if (compPct != null)
      rows.push({ label: 'Comp %', season: compPct, value: compPct, key: 'compPct' })
    if (ypa != null) rows.push({ label: 'Yards / att', season: ypa, value: ypa, key: 'ypa' })
    add('Completions', s.completions, 'completions', true)
    add('Pass attempts', s.passAtt, 'passAtt', true)
    add('Pass yards', s.passYds, 'passYds', true)
    add('Pass TDs', s.passTDs, 'passTDs', true)
    add('Interceptions', s.interceptions, 'interceptions', true)
    add('Sacks taken', s.sacks, 'sacks', true)
    add('Rush yards', s.rushYds, 'rushYds', true)
    add('Rush TDs', s.rushTDs, 'rushTDs', true)
    add('Carries', s.carries, 'carries')
    add('Fumbles lost', s.fumblesLost, 'fumblesLost', true)
  } else if (pos === 'RB') {
    const ypc =
      s.carries && s.carries > 0
        ? Math.round(((s.rushYds || 0) / s.carries) * 100) / 100
        : undefined
    if (ypc != null) rows.push({ label: 'Yards / carry', season: ypc, value: ypc, key: 'ypc' })
    add('Carries', s.carries, 'carries', true)
    add('Rush yards', s.rushYds, 'rushYds', true)
    add('Rush TDs', s.rushTDs, 'rushTDs', true)
    add('Targets', s.targets, 'targets', true)
    add('Receptions', s.receptions, 'receptions', true)
    add('Rec yards', s.recYds, 'recYds', true)
    add('Rec TDs', s.recTDs, 'recTDs', true)
    add('Fumbles lost', s.fumblesLost, 'fumblesLost', true)
  } else if (pos === 'WR' || pos === 'TE') {
    const catchRate =
      s.targets && s.targets > 0
        ? Math.round(((s.receptions || 0) / s.targets) * 1000) / 10
        : undefined
    const ypr =
      s.receptions && s.receptions > 0
        ? Math.round(((s.recYds || 0) / s.receptions) * 100) / 100
        : undefined
    if (catchRate != null)
      rows.push({ label: 'Catch rate %', season: catchRate, value: catchRate, key: 'catchRate' })
    if (ypr != null) rows.push({ label: 'Yards / rec', season: ypr, value: ypr, key: 'ypr' })
    add('Targets', s.targets, 'targets', true)
    add('Receptions', s.receptions, 'receptions', true)
    add('Rec yards', s.recYds, 'recYds', true)
    add('Rec TDs', s.recTDs, 'recTDs', true)
    add('Rush yards', s.rushYds, 'rushYds')
    add('Rush TDs', s.rushTDs, 'rushTDs')
    add('Carries', s.carries, 'carries')
    add('Fumbles lost', s.fumblesLost, 'fumblesLost', true)
  } else if (pos === 'K') {
    const made =
      (s.fgMade1_19 || 0) +
        (s.fgMade20_29 || 0) +
        (s.fgMade30_39 || 0) +
        (s.fgMade40_49 || 0) +
        (s.fgMade50_59 || 0) +
        (s.fgMade60 || 0) ||
      s.fgMade ||
      0
    const att = s.fgAtt || made
    const fgPct = att > 0 ? Math.round((made / att) * 1000) / 10 : undefined
    if (fgPct != null) rows.push({ label: 'FG %', season: fgPct, value: fgPct, key: 'fgPct' })
    add('FG made', made, 'fgMadeTotal', true)
    add('FG att', att, 'fgAtt', true)
    add('FG missed', s.fgMissed ?? Math.max(0, att - made), 'fgMissed', true)
    add(
      'FG 0–39',
      (s.fgMade1_19 || 0) + (s.fgMade20_29 || 0) + (s.fgMade30_39 || 0),
      'fg0_39'
    )
    add('FG 40–49', s.fgMade40_49, 'fgMade40_49')
    add('FG 50–59', s.fgMade50_59, 'fgMade50_59')
    add('FG 60+', s.fgMade60, 'fgMade60')
    add('XP made', s.xpMade, 'xpMade', true)
  } else {
    add('Pass yards', s.passYds, 'passYds')
    add('Pass TDs', s.passTDs, 'passTDs')
    add('Rush yards', s.rushYds, 'rushYds')
    add('Rush TDs', s.rushTDs, 'rushTDs')
    add('Receptions', s.receptions, 'receptions')
    add('Rec yards', s.recYds, 'recYds')
    add('Rec TDs', s.recTDs, 'recTDs')
    add('Fumbles lost', s.fumblesLost, 'fumblesLost', true)
  }

  return rows
}

function peerStatsForRank(p: Player): Record<string, number | undefined> {
  const s = p.stats as Record<string, number | undefined>
  const out: Record<string, number | undefined> = { ...s }
  if (p.position === 'QB') {
    out.passerRating = nflPasserRating(
      s.completions || 0,
      s.passAtt || 0,
      s.passYds || 0,
      s.passTDs || 0,
      s.interceptions || 0
    )
  }
  return out
}

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading } = useDataLake()
  const navigate = useNavigate()

  const player = data?.players.find((p) => p.id === id)

  const peers = useMemo(() => {
    if (!data || !player) return []
    return data.players.filter((p) => p.position === player.position)
  }, [data, player])

  const rpsRankMap = useMemo(() => {
    return rankByField(peers, (p) => p.rps)
  }, [peers])

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>

  if (!player) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Player not found</p>
        <Link to="/" className="text-emerald-400 underline">
          ← Back
        </Link>
      </div>
    )
  }

  const s = player.stats
  const f = player.fantasy
  const week = data?.meta.projectionWeek || data?.meta.week
  const gamesPlayed = Math.max(1, s.gamesPlayed || f?.gamesPlayed || f?.games || 1)
  const teamGames = s.teamGamesPlayed || f?.teamGamesPlayed
  const baseRows = buildStatRows(player, gamesPlayed)
  const peerPayload = peers.map((p) => ({ stats: peerStatsForRank(p) }))
  const rankedRows = withStatRanks(baseRows, peerPayload, peers.length)

  const posRank = player.rankPos
  const valueRank = player.rankValue ?? player.rankOverall
  const rpsRank = rpsRankMap.get(player)
  const posPool = peers.length

  function addToCompare() {
    if (!id) return
    let ids: string[] = []
    try {
      const stored = sessionStorage.getItem('compare-ids')
      if (stored) ids = JSON.parse(stored)
    } catch {
      /* ignore */
    }
    if (!ids.includes(id)) ids = [...ids, id].slice(-5)
    sessionStorage.setItem('compare-ids', JSON.stringify(ids))
    navigate(`/compare?ids=${ids.join(',')}`)
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <Link to="/rankings" className="text-sm text-emerald-400">
          ← Rankings
        </Link>
        <button
          onClick={addToCompare}
          className="text-sm px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 active:bg-slate-700"
        >
          + Compare
        </button>
      </div>

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
            <span
              className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                injuryColor(f.injuryStatus)
              }`}
            >
              {f.injuryStatus}
            </span>
          )}
        </div>
      </div>

      <RankSummary
        title="Season ranks"
        chips={[
          {
            id: 'pos',
            label: 'Pos rank',
            rank: posRank != null ? `#${posRank}` : '—',
            score: `${player.grade.toFixed(1)} grade`,
            sublabel: `of ${posPool} ${player.position}s`,
            accent: 'sky',
          },
          {
            id: 'value',
            label: 'Value rank',
            rank: valueRank != null ? `#${valueRank}` : '—',
            score: `${(player.valueGrade ?? player.grade).toFixed(1)} value`,
            sublabel: 'cross-position',
            accent: 'emerald',
          },
          {
            id: 'rps',
            label: 'RPS rank',
            rank: rpsRank != null ? `#${rpsRank}` : '—',
            score: `${(player.rps ?? 0).toFixed(1)} RPS`,
            sublabel: player.rpsLabel ?? 'real football',
            accent: 'violet',
          },
        ]}
        breakdown={[
          {
            title: 'Pos rank',
            body: `Fantasy position grade vs other ${player.position}s only. Ranked by season average fantasy points (your scoring settings), then availability penalty if GP < 50% of team games. #1 = best at the position in this data set (${posPool} players).`,
          },
          {
            title: 'Value rank',
            body:
              'Cross-position fantasy value for full-PPR style leagues. Combines points/game × availability × positional scarcity weights (RB > WR > TE > QB > DST > K). Ranked against the full fantasy pool (~1600 scale), not just this sample.',
          },
          {
            title: 'RPS rank (Real Position Score)',
            body: `Real-football value at ${player.position} — not fantasy scoring. Uses per-game rates with position-specific weights (e.g. QB: passer rating, efficiency, TD/INT balance). Ranked among ${player.position}s only.`,
          },
        ]}
      />

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-slate-900 rounded-xl p-3 border border-violet-800/50 text-center">
          <div className="text-[10px] uppercase tracking-wide text-violet-400/90">RPS</div>
          <div className="text-xl font-bold text-violet-300 tabular-nums">
            {(player.rps ?? 0).toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-500">{player.rpsLabel ?? '—'}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-emerald-800/40 text-center">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Value</div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">
            {(player.valueGrade ?? player.grade).toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-500">{player.valueLabel ?? player.gradeLabel}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Pos grade</div>
          <div className="text-xl font-bold text-sky-400 tabular-nums">{player.grade.toFixed(1)}</div>
          <div className="text-[10px] text-slate-500">{player.gradeLabel}</div>
        </div>
      </div>

      {(player.availability != null || gamesPlayed != null) && (
        <p className="text-xs text-slate-500 mb-4">
          <span className="text-slate-300">{gamesPlayed}</span> games played
          {teamGames != null ? ` / ${teamGames} team games` : ''}
          {player.availability != null && (
            <> · Availability {Math.round(player.availability * 100)}%</>
          )}
        </p>
      )}

      {f && (
        <section className="mb-6 grid grid-cols-3 gap-2">
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg PPG</div>
            <div className="text-xl font-bold text-sky-400 tabular-nums">{f.avgPts.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500">{gamesPlayed} GP</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 border border-emerald-800/50 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Week {week} Proj</div>
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
            <div className="text-[10px] text-slate-500">fantasy pts</div>
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

      <h2 className="text-lg font-semibold mb-2">Season stats</h2>
      <p className="text-[11px] text-slate-500 mb-3">
        Season totals, per-game averages, and rank among {posPool} {player.position}s
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
                    : row.rank != null && row.of != null && row.rank > row.of * 0.75
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
        <strong className="text-slate-400">Stat rank</strong> is among {player.position}s in the
        current data lake (#1 = best). Lower is better for turnovers / points & yards allowed.
        <strong className="text-slate-400"> RPS</strong> uses per-game rates with position weights;
        fantasy grades use your league scoring settings.
      </p>
    </div>
  )
}

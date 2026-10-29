import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDataLake } from '../hooks/useDataLake'
import { getGameDetail, HOME_FIELD_ADVANTAGE, type TeamScoreBreakdown } from '../lib/scoreProjection'

function fmt(n: number, d = 1) {
  return n.toFixed(d)
}

function CompareRow({
  label,
  away,
  home,
  higherBetter = true,
  digits = 1,
}: {
  label: string
  away: number | undefined
  home: number | undefined
  higherBetter?: boolean
  digits?: number
}) {
  if (away == null && home == null) return null
  const a = away ?? 0
  const h = home ?? 0
  const aWin = higherBetter ? a > h : a < h
  const hWin = higherBetter ? h > a : h < a
  return (
    <li className="grid grid-cols-[1fr_1.2fr_1fr] gap-1 px-3 py-2 border-b border-slate-800/80 last:border-0 text-sm">
      <span
        className={`text-right tabular-nums font-medium ${
          aWin ? 'text-emerald-300' : 'text-slate-200'
        }`}
      >
        {away != null ? away.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—'}
      </span>
      <span className="text-center text-slate-500 text-xs self-center">{label}</span>
      <span
        className={`text-left tabular-nums font-medium ${
          hWin ? 'text-emerald-300' : 'text-slate-200'
        }`}
      >
        {home != null ? home.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—'}
      </span>
    </li>
  )
}

function ScoreCalcTable({
  away,
  home,
}: {
  away: TeamScoreBreakdown
  home: TeamScoreBreakdown
}) {
  const rows: { label: string; a: string; h: string; note?: string }[] = [
    {
      label: 'Projected TDs',
      a: fmt(away.tds, 2),
      h: fmt(home.tds, 2),
      note: `× matchup TD factor (away ${away.tdFactor}, home ${home.tdFactor})`,
    },
    {
      label: 'TD points (×6)',
      a: fmt(away.tdPts),
      h: fmt(home.tdPts),
    },
    {
      label: 'Projected FG',
      a: fmt(away.fg, 2),
      h: fmt(home.fg, 2),
      note: away.kickerName || home.kickerName
        ? `K: ${away.kickerName || '—'} / ${home.kickerName || '—'}`
        : undefined,
    },
    {
      label: 'FG points (×3)',
      a: fmt(away.fgPts),
      h: fmt(home.fgPts),
    },
    {
      label: 'Projected XP',
      a: fmt(away.xp, 2),
      h: fmt(home.xp, 2),
    },
    {
      label: 'XP points (×1)',
      a: fmt(away.xpPts),
      h: fmt(home.xpPts),
    },
    {
      label: 'Safeties',
      a: fmt(away.safeties, 2),
      h: fmt(home.safeties, 2),
    },
    {
      label: 'Safety points',
      a: fmt(away.safetyPts),
      h: fmt(home.safetyPts),
    },
    {
      label: 'Base score',
      a: fmt(away.baseScore),
      h: fmt(home.baseScore),
    },
    {
      label: `Home field (+${HOME_FIELD_ADVANTAGE})`,
      a: '0',
      h: fmt(home.homeField),
    },
    {
      label: 'Final score',
      a: fmt(away.finalScore),
      h: fmt(home.finalScore),
    },
  ]

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-1 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
        <span className="text-right">{away.abbr}</span>
        <span className="text-center">Component</span>
        <span className="text-left">{home.abbr}</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.label}
            className={`px-3 py-2 border-b border-slate-800/80 last:border-0 ${
              row.label === 'Final score' ? 'bg-slate-900/60' : ''
            }`}
          >
            <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-1 text-sm">
              <span
                className={`text-right tabular-nums font-medium ${
                  row.label === 'Final score' ? 'text-emerald-300' : 'text-slate-100'
                }`}
              >
                {row.a}
              </span>
              <span className="text-center text-slate-400 text-xs self-center">{row.label}</span>
              <span
                className={`text-left tabular-nums font-medium ${
                  row.label === 'Final score' ? 'text-emerald-300' : 'text-slate-100'
                }`}
              >
                {row.h}
              </span>
            </div>
            {row.note && (
              <p className="text-[10px] text-slate-600 text-center mt-0.5">{row.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BettingGameDetail() {
  const { away: awayParam, home: homeParam } = useParams<{ away: string; home: string }>()
  const away = (awayParam || '').toUpperCase()
  const home = (homeParam || '').toUpperCase()
  const { data, loading, error } = useDataLake()

  const detail = useMemo(
    () => (data && away && home ? getGameDetail(data, away, home) : null),
    [data, away, home]
  )

  const offAway = data?.teamOffenses?.find((o) => o.abbreviation === away)
  const offHome = data?.teamOffenses?.find((o) => o.abbreviation === home)
  const defAway = data?.defenses?.find((d) => d.abbreviation === away)
  const defHome = data?.defenses?.find((d) => d.abbreviation === home)

  if (loading) return <div className="p-6 text-slate-400">Loading…</div>
  if (error) return <div className="p-6 text-rose-400">{error}</div>
  if (!detail) {
    return (
      <div className="p-6 text-center">
        <p className="text-rose-400 mb-4">Game not found</p>
        <Link to="/betting" className="text-emerald-400 underline">
          ← Betting
        </Link>
      </div>
    )
  }

  const homeWin = detail.winner === home
  const awayWin = detail.winner === away
  const osA = offAway?.stats
  const osH = offHome?.stats
  const dsA = defAway?.stats
  const dsH = defHome?.stats
  const gA = Math.max(1, osA?.gamesPlayed || dsA?.gamesPlayed || 1)
  const gH = Math.max(1, osH?.gamesPlayed || dsH?.gamesPlayed || 1)

  return (
    <div className="px-4 pt-4 pb-8">
      <Link to="/betting" className="text-sm text-emerald-400 mb-4 inline-block">
        ← Betting
      </Link>

      <div className="text-center mb-4">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
          Week {data?.meta.projectionWeek || data?.meta.week} matchup
        </p>
        <h1 className="text-xl font-bold">
          {away} <span className="text-slate-500 font-normal">@</span> {home}
        </h1>
      </div>

      {/* Scoreboard */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 mb-6">
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="text-center">
            <div className={`text-lg font-bold ${awayWin ? 'text-emerald-300' : 'text-slate-200'}`}>
              {away}
            </div>
            <div className={`text-3xl font-bold tabular-nums ${awayWin ? 'text-emerald-300' : ''}`}>
              {fmt(detail.awayScore)}
            </div>
            {offAway && (
              <Link to={`/team/${offAway.id}`} className="text-[10px] text-violet-400">
                Team profile →
              </Link>
            )}
          </div>
          <div className="text-center text-xs text-slate-500">
            <div
              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold mb-1 ${
                detail.winner === 'TIE'
                  ? 'bg-slate-800 text-slate-300'
                  : 'bg-emerald-900/50 text-emerald-300'
              }`}
            >
              Pick {detail.winner}
            </div>
            <div className="tabular-nums">O/U {fmt(detail.total)}</div>
            <div className="tabular-nums">
              {home} {detail.spread > 0 ? '+' : ''}
              {fmt(detail.spread)}
            </div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${homeWin ? 'text-emerald-300' : 'text-slate-200'}`}>
              {home}
            </div>
            <div className={`text-3xl font-bold tabular-nums ${homeWin ? 'text-emerald-300' : ''}`}>
              {fmt(detail.homeScore)}
            </div>
            {offHome && (
              <Link to={`/team/${offHome.id}`} className="text-[10px] text-violet-400">
                Team profile →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Power / RPS comparison */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
        Team power
      </h2>
      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-1 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span className="text-right">{away}</span>
          <span className="text-center">Stat</span>
          <span className="text-left">{home}</span>
        </div>
        <ul>
          <CompareRow
            label="OFF RPS"
            away={offAway?.rps}
            home={offHome?.rps}
            digits={1}
          />
          <CompareRow
            label="DEF RPS"
            away={defAway?.rps ?? defAway?.grade}
            home={defHome?.rps ?? defHome?.grade}
            digits={1}
          />
          <CompareRow
            label="Power (avg)"
            away={
              offAway && defAway
                ? Math.round((((offAway.rps + (defAway.rps ?? defAway.grade)) / 2) * 10)) / 10
                : undefined
            }
            home={
              offHome && defHome
                ? Math.round((((offHome.rps + (defHome.rps ?? defHome.grade)) / 2) * 10)) / 10
                : undefined
            }
            digits={1}
          />
        </ul>
      </div>

      {/* Offense rates */}
      <h2 className="text-sm font-semibold text-violet-400/90 uppercase tracking-wide mb-2">
        Offense
      </h2>
      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-1 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span className="text-right">{away}</span>
          <span className="text-center">Stat</span>
          <span className="text-left">{home}</span>
        </div>
        <ul>
          <CompareRow label="PPG" away={osA?.pointsPerGame} home={osH?.pointsPerGame} />
          <CompareRow label="Net YPG" away={osA?.yardsPerGame} home={osH?.yardsPerGame} />
          <CompareRow label="Pass YPG" away={osA?.passYardsPerGame} home={osH?.passYardsPerGame} />
          <CompareRow label="Rush YPG" away={osA?.rushYardsPerGame} home={osH?.rushYardsPerGame} />
          <CompareRow
            label="TD / g"
            away={osA?.totalTDs != null ? osA.totalTDs / gA : undefined}
            home={osH?.totalTDs != null ? osH.totalTDs / gH : undefined}
            digits={2}
          />
          <CompareRow label="QB rating" away={osA?.qbRating} home={osH?.qbRating} />
        </ul>
      </div>

      {/* Defense rates */}
      <h2 className="text-sm font-semibold text-sky-400/90 uppercase tracking-wide mb-2">
        Defense
      </h2>
      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-1 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 border-b border-slate-800">
          <span className="text-right">{away}</span>
          <span className="text-center">Stat</span>
          <span className="text-left">{home}</span>
        </div>
        <ul>
          <CompareRow
            label="PA / g"
            away={dsA?.ptsAllowed != null ? dsA.ptsAllowed / Math.max(1, dsA.gamesPlayed || gA) : undefined}
            home={dsH?.ptsAllowed != null ? dsH.ptsAllowed / Math.max(1, dsH.gamesPlayed || gH) : undefined}
            higherBetter={false}
          />
          <CompareRow
            label="YA / g"
            away={
              dsA?.yardsAllowed != null
                ? dsA.yardsAllowed / Math.max(1, dsA.gamesPlayed || gA)
                : undefined
            }
            home={
              dsH?.yardsAllowed != null
                ? dsH.yardsAllowed / Math.max(1, dsH.gamesPlayed || gH)
                : undefined
            }
            higherBetter={false}
          />
          <CompareRow
            label="Sacks / g"
            away={dsA?.sacks != null ? dsA.sacks / Math.max(1, dsA.gamesPlayed || gA) : undefined}
            home={dsH?.sacks != null ? dsH.sacks / Math.max(1, dsH.gamesPlayed || gH) : undefined}
            digits={2}
          />
          <CompareRow
            label="INT / g"
            away={dsA?.ints != null ? dsA.ints / Math.max(1, dsA.gamesPlayed || gA) : undefined}
            home={dsH?.ints != null ? dsH.ints / Math.max(1, dsH.gamesPlayed || gH) : undefined}
            digits={2}
          />
        </ul>
      </div>

      {/* Score derivation */}
      <h2 className="text-sm font-semibold text-amber-400/90 uppercase tracking-wide mb-2">
        Score derivation
      </h2>
      <p className="text-[11px] text-slate-500 mb-2">
        How the projected final scores are built from TDs, kicks, and safeties
      </p>
      <ScoreCalcTable away={detail.awayBreakdown} home={detail.homeBreakdown} />

      {/* TD contributors */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
        TD contributors
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {([detail.awayBreakdown, detail.homeBreakdown] as const).map((side) => (
          <div key={side.abbr} className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-2 py-1.5 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
              {side.abbr}
            </div>
            <ul className="text-xs">
              {side.contributors.length === 0 && (
                <li className="px-2 py-2 text-slate-600">No TD share</li>
              )}
              {side.contributors.slice(0, 8).map((c) => (
                <li
                  key={c.id}
                  className="flex justify-between gap-1 px-2 py-1.5 border-b border-slate-800/60 last:border-0"
                >
                  <span className="text-slate-300 truncate">
                    <span className="text-slate-500">{c.position}</span> {c.name.split(' ').pop()}
                    {c.injuryWeight < 1 && (
                      <span className="text-amber-500/90"> · {Math.round(c.injuryWeight * 100)}%</span>
                    )}
                  </span>
                  <span className="tabular-nums text-slate-400 shrink-0">{c.tds.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Fixed roster: best 1 QB + 2 RB + 3 WR + 2 TE sorted by production (TDs then yards).
        Pass + rush TDs on QB; rush + receiving TDs on skill players. Missing / Out slots use
        75% of league-average TD/game for that position. Injury weights: Out = 0 (placeholder),
        Q = 50%, Doubtful/DTD = 25%. Home field +{HOME_FIELD_ADVANTAGE} applied to {home} only.
      </p>
    </div>
  )
}

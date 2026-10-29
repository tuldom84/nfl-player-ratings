import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="px-4 pt-4 pb-8 prose prose-invert prose-sm max-w-none">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold m-0">About</h1>
        <Link to="/" className="text-sm text-emerald-400 no-underline">
          ← Home
        </Link>
      </div>

      <p className="text-slate-300 leading-relaxed">
        <strong>NFL Player Ratings</strong> is a mobile-first PWA that grades NFL players and
        teams for fantasy football using current-season stats from ESPN’s public APIs. League
        scoring is fully configurable in Settings and drives season points, averages, and
        projections.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Scoring</h2>
      <p className="text-slate-300">
        Defaults match typical full-PPR + your league’s DST PA/YA brackets. Everything is
        editable under Settings and applied on device — nothing is hardcoded in the scorers.
      </p>
      <ul className="list-disc pl-5 space-y-1 text-slate-300">
        <li>
          <strong>Offense (QB/RB/WR/TE):</strong> pass/rush/rec yards & TDs, receptions, INT,
          fumbles lost (default −2).
        </li>
        <li>
          <strong>Kicker:</strong> XP, FG miss, distance buckets (0–39 / 40–49 / 50–59 / 60+).
        </li>
        <li>
          <strong>DST:</strong> counting stats (sack, INT, FR, FF, safety, def TD, blocked kick)
          plus <em>per-game</em> points-allowed and yards-allowed brackets.
        </li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">Grades & ranks</h2>
      <ul className="list-disc pl-5 space-y-1 text-slate-300">
        <li>
          <strong>Position grade:</strong> avg fantasy PPG vs others at the same position (0–100).
        </li>
        <li>
          <strong>Value grade:</strong> cross-position (avg PPG × availability × positional
          scarcity).
        </li>
        <li>
          <strong>RPS:</strong> real-football value from per-game rates (not fantasy scoring).
          Team offense RPS uses <strong>net yards/game</strong> (never gross total yards).
        </li>
        <li>
          Stat table ranks: rates like PA/YA use <strong>per-game</strong> values so teams with
          different games played compare fairly. Season totals still show a rank when relevant.
        </li>
        <li>Labels: Elite (≥90), Great (≥75), Solid (≥55), Average (≥35), Below.</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">Weekly projections</h2>
      <ul className="list-disc pl-5 space-y-1 text-slate-300">
        <li>
          <strong>Skill players:</strong> yards scale with opponent DST yards allowed vs league
          avg; TDs scale with opponent points allowed vs league avg; then scored with your
          settings.
        </li>
        <li>
          <strong>DST:</strong> season avg PPG adjusted by opponent offense PPG and net YPG vs
          league averages (stronger offense → lower DST projection).
        </li>
        <li>Injury status scales projections (Out/IR = 0, Doubtful, Questionable, etc.).</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">Betting tab</h2>
      <p className="text-slate-300">
        Projected game scores for the current week:{' '}
        <strong>
          matchup-adjusted offensive TDs × 6 + FG × 3 + XP × 1 + DST safeties × 2 + 2.5 home
          field + a small QB quality boost
        </strong>
        , then net turnover differential: (team TOD/g − opponent TOD/g) × 1.75 added to that
        team and subtracted from the opponent. TOD/g is takeaways per game minus giveaways per
        game. Questionable or day-to-day TDs count at 90%, Doubtful at 70%. Out, IR, and
        suspension are not penalized. RB, WR, and TE TDs/g are multiplied by availability
        (games played / team games). The QB is not. Pass/rec TDs counted once (QB pass + all rush).
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Data cadence</h2>
      <p className="text-slate-300">
        Stats sync weekly (Tuesday) into a static data lake on GitHub Pages. Game logs and box
        scores load on demand from ESPN when you open them. Client-side rescoring applies your
        saved Settings immediately.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Data sources</h2>
      <p className="text-slate-300">
        ESPN public endpoints (site.api, site.web.api, sports.core.api).
      </p>

      <p className="mt-8 text-xs text-slate-500">
        Not affiliated with ESPN or the NFL. Stats, grades, and score projections are for
        entertainment and fantasy analysis only — not betting advice.
      </p>
    </div>
  )
}

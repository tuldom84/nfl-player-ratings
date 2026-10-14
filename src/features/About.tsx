export default function About() {
  return (
    <div className="px-4 pt-4 pb-8 prose prose-invert prose-sm max-w-none">
      <h1 className="text-2xl font-bold mb-4">About</h1>

      <p className="text-slate-300 leading-relaxed">
        <strong>NFL Player Ratings</strong> is a mobile-first PWA that grades NFL players
        for fantasy football using current-season statistics pulled from ESPN’s public APIs.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Scoring used</h2>
      <ul className="list-disc pl-5 space-y-1 text-slate-300">
        <li>
          <strong>Offense (QB/RB/WR/TE):</strong> full-PPR (1 pt/rec, 0.1/yd, 6 rush/rec TD,
          4 pass TD, −2 INT).
        </li>
        <li>
          <strong>Kicker:</strong> XP 1; FG miss −1; FG 0–39: 3, 40–49: 4, 50–59: 5, 60+: 6.
        </li>
        <li>
          <strong>DST:</strong> points-allowed & yards-allowed brackets per game, plus INT 2,
          FR 2, FF 1, safety 2, def/return TD 6, blocked kick 2. (Sacks not scored in this
          league.)
        </li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">How grades work</h2>
      <ul className="list-disc pl-5 space-y-1 text-slate-300">
        <li>Season fantasy points are computed with the scoring above.</li>
        <li>Position grade: relative to others at the same position (0–100).</li>
        <li>
          Value grade: cross-position using avg PPG × availability × PPR positional weight.
        </li>
        <li>Labels: Elite (≥90), Great (≥75), Solid (≥55), Average (≥35), Below.</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">Data cadence</h2>
      <p className="text-slate-300">
        Stats are synced <strong>once per week on Tuesday</strong> and stored in a static
        data lake. DST points/yards allowed are scored <em>per game</em> from box scores so
        brackets apply correctly.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Data sources</h2>
      <p className="text-slate-300">
        ESPN public endpoints (site.api, site.web.api, sports.core.api).
      </p>

      <p className="mt-8 text-xs text-slate-500">
        Not affiliated with ESPN or the NFL. Stats and grades are for entertainment / fantasy
        analysis only.
      </p>
    </div>
  )
}

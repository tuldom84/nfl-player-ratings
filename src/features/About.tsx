export default function About() {
  return (
    <div className="px-4 pt-4 pb-8 prose prose-invert prose-sm max-w-none">
      <h1 className="text-2xl font-bold mb-4">About</h1>

      <p className="text-slate-300 leading-relaxed">
        <strong>NFL Player Ratings</strong> is a mobile-first PWA that grades NFL players
        for PPR fantasy football using current-season statistics pulled from ESPN’s public APIs.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">How grades work</h2>
      <ul className="list-disc pl-5 space-y-1 text-slate-300">
        <li>Raw fantasy-point contribution is calculated with full-PPR scoring coefficients.</li>
        <li>Players are graded relative to others at the same position (min-max 0–100).</li>
        <li>Weights emphasize the stats that historically drive PPR value (receptions, yards, TDs, opportunity).</li>
        <li>Labels: Elite (≥90), Great (≥75), Solid (≥55), Average (≥35), Below.</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">Data cadence</h2>
      <p className="text-slate-300">
        Stats are synced <strong>once per week on Tuesday</strong> and stored in a static
        “data lake” (<code className="bg-slate-800 px-1 rounded">/data/latest.json</code>).
        The app serves that snapshot until the next resync — no live API calls on every page view.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Data sources</h2>
      <p className="text-slate-300">
        ESPN public endpoints (site.api, site.web.api, sports.core.api). Research based on open-source
        projects such as cwendt94/espn-api, sejaldua/espn-api, aaronweldy/espn-openapi and others.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">Tech</h2>
      <p className="text-slate-300">
        React + Vite + Tailwind + PWA (vite-plugin-pwa). Mobile-first, offline-capable shell,
        safe-area aware.
      </p>

      <p className="mt-8 text-xs text-slate-500">
        Not affiliated with ESPN or the NFL. Stats and grades are for entertainment / fantasy analysis only.
      </p>
    </div>
  )
}

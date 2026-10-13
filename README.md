# NFL Player Ratings

Mobile-first Progressive Web App that rates NFL players for **PPR fantasy football** using current-season statistics.

**🚀 Live demo:** [https://tuldom84.github.io/nfl-player-ratings/](https://tuldom84.github.io/nfl-player-ratings/)

**Repo:** https://github.com/tuldom84/nfl-player-ratings

## Features

- **Weighted normalized grades** (0–100) per position based on PPR scoring value
- **Weekly data lake** – stats pulled from ESPN public APIs **once per week on Tuesday**, then served from static JSON
- Mobile-first UI with bottom navigation, safe-area support, and offline-capable shell (PWA)
- Rankings by overall / position + player detail views
- GitHub Actions workflow for automatic Tuesday resync

## Tech Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- vite-plugin-pwa
- ESPN public endpoints (researched from open-source projects on GitHub)

## Data Sources (ESPN)

Research drawn from popular GitHub projects:

- [cwendt94/espn-api](https://github.com/cwendt94/espn-api)
- [sejaldua/espn-api](https://github.com/sejaldua/espn-api) (endpoints documentation)
- [aaronweldy/espn-openapi](https://github.com/aaronweldy/espn-openapi)
- [pseudo-r/Public-ESPN-API](https://github.com/pseudo-r/Public-ESPN-API)
- [fenneh/espn-sports-api](https://github.com/fenneh/espn-sports-api)

Key endpoints used by the sync script:

- `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams`
- `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete`
- Core athlete & team statistics endpoints

## Grading Algorithm (PPR)

1. Compute raw fantasy-point contribution using standard full-PPR coefficients.
2. Group players by position.
3. Min-max normalize the raw contribution within each position → 0–100 grade.
4. Apply position-specific relative weights that emphasize volume + efficiency metrics known to drive PPR value (receptions heavily weighted for WR/TE/RB).

See `src/lib/grading.ts` for the exact weights and scoring coefficients.

## Getting Started

```bash
# Install
npm install

# Generate / refresh the data lake (pulls live ESPN data)
npm run sync

# Develop
npm run dev

# Production build
npm run build
```

The data lake lives at `public/data/latest.json`. The app reads it on load and caches it in `localStorage` for offline use until the next weekly sync.

## Weekly Sync

A GitHub Action (`.github/workflows/weekly-sync.yml`) runs every Tuesday at 10:00 UTC, executes `npm run sync`, and commits the updated `latest.json`.

You can also trigger it manually from the Actions tab.

## Live Demo (GitHub Pages)

The app is automatically deployed to GitHub Pages on every push to `main` via `.github/workflows/deploy-pages.yml`.

**URL:** https://tuldom84.github.io/nfl-player-ratings/

> **Note:** You may need to enable GitHub Pages once in the repo settings:
> Settings → Pages → Source → **GitHub Actions**.

## Project Structure

```
src/
  components/     # shared UI
  features/       # Home, Rankings, PlayerDetail, About
  hooks/          # useDataLake
  lib/            # types, grading algorithms
  styles/
scripts/
  sync-data.ts    # weekly ESPN → data-lake job
public/
  data/latest.json
.github/workflows/
  weekly-sync.yml
  deploy-pages.yml
```

## License

MIT

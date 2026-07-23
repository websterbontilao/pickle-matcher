# Pickle Matcher

A courtside PWA for running pickleball round-robin sessions — no server, no accounts, works fully offline once installed. Add players, configure courts, and each court independently generates its own matches, tracks results, and rotates players fairly as the session runs.

## Features

- **Independent per-court play** — each court starts, times, and advances its own matches; no waiting on a synchronized "round."
- **Singles or doubles**, chosen once per session. Doubles is always a clean 2v2 — nobody plays 1v2.
- **Linked players** always end up as teammates when both are active, and can be swapped or team-switched before a match starts.
- **Fair rotation** — priority goes to whoever's played the fewest games, with two built-in guardrails: a forced rest after 2 games in a row, and a guaranteed spot after sitting out 2 cycles in a row.
- **Match history** and per-player stats (record, win %, time played) — all derived from the match log, nothing tracked separately.
- **Installable and offline-capable** — add it to your home screen and it works with no signal at the courts.
- **Dark mode**, and everything persisted locally — close the tab, reopen later, pick up where you left off.

See [`TASK.md`](./TASK.md) for the original product spec and [`CLAUDE.md`](./CLAUDE.md) for architecture notes (a few product decisions have since diverged from the original spec — noted there).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Note: the service worker is disabled in dev mode by design — to test offline/install behavior, use a production build instead:

```bash
npm run build   # static export to out/
npm start       # serves out/ locally (serve out)
```

### Other commands

```bash
npm test              # vitest run
npm run test:watch    # vitest watch mode
npm run lint           # eslint
npx tsc --noEmit       # type-check
```

## Tech stack

Next.js (App Router, static export) · TypeScript · Zod · TanStack Query (as a localStorage adapter, not for network data) · Tailwind + shadcn/ui · Serwist (PWA/offline) · Vitest.

There is no backend — `output: "export"` is set permanently in `next.config.ts`, and all state lives in the browser's `localStorage`.

## Deployment

Deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`): pushing to `main` builds a static export with `BASE_PATH` set to the repo's subpath and publishes it automatically. Requires **Settings → Pages → Source: GitHub Actions** to be set once on the repo.

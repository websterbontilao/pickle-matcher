# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Next.js version note** (from `AGENTS.md`): this repo runs Next.js 16, which has breaking changes vs. older training data — APIs, conventions, and file structure may differ from what you expect. Check `node_modules/next/dist/docs/` before assuming behavior, especially around Turbopack defaults (see below).

## What this is

Pickle Matcher — a PWA that runs courtside pickleball round-robin sessions. Fully client-side: no backend, no auth, no network calls at runtime. All session state lives in `localStorage`; the whole app is deployed as a static export (GitHub Pages). See `TASK.md` for the original product spec — note that live usage has since diverged from it in a few places (see "Divergences from TASK.md" below).

## Commands

```bash
npm run dev          # next dev --webpack (Turbopack is NOT used — see "Turbopack" below)
npm run build         # next build --webpack — static export to out/
npm start             # serve out — serves the static export locally (next start does NOT work, see below)
npm test              # vitest run
npm run test:watch    # vitest watch mode
npx vitest run path/to/file.test.ts        # single test file
npx vitest run -t "test name substring"    # single test by name
npm run lint          # eslint
npx tsc --noEmit      # type-check without emitting
```

There is no dev/prod distinction in how the app behaves (no server, no env-gated features) other than the service worker being disabled in dev (see PWA section).

### Turbopack

Next.js 16 defaults to Turbopack, but `@serwist/next`'s webpack plugin doesn't support it, so both `dev` and `build` are pinned to `--webpack`. Don't drop that flag.

### `output: "export"` — no server, ever

`next.config.ts` sets `output: "export"` permanently, because this app is deployed to GitHub Pages and has no server-side needs at all. Consequences that catch people out:

- **`next start` does not work** — there's no server build, only static files in `out/`. Local "production" testing is `npm run build && npm start`, where `start` is aliased to `serve out`.
- Adding any server-only feature (API routes, middleware, dynamic rendering, `next/image` optimization) will break the build. If a task seems to need one of these, that's a sign the static-export architecture needs to change first — flag it rather than silently reintroducing a server.
- `BASE_PATH` env var (read via `lib/basePath.ts`) drives `basePath`/`assetPrefix` for GitHub Pages' subpath hosting (`/<repo-name>`). Empty locally. The GitHub Actions workflow (`.github/workflows/deploy.yml`) sets it automatically from the repo name at build time.

## Architecture

### Data flow: schemas → engine/mutations → query adapter → hooks → components

1. **`lib/schemas/`** — Zod schemas for everything (`Player`, `Court`, `Match`, `SessionSettings`, `SitOut`, and the top-level `SessionState`). Types are always inferred from schemas, never hand-written. `EMPTY_SESSION_STATE` (in `session.ts`) is the fallback used on first load or corrupt storage.
2. **`lib/engine/`** — the pure scheduling algorithm (see below). No I/O, no localStorage, fully unit-testable in isolation.
3. **`lib/mutations/`** — pure `(SessionState, input) => SessionState` reducers, grouped by domain (`players.ts`, `courts.ts`, `settings.ts`, `rounds.ts`, `session.ts`). These call into `lib/engine` but never touch storage directly.
4. **`lib/storage/sessionStorage.ts`** — the *only* code that touches `localStorage` directly (`loadSessionState`/`saveSessionState`), with `SessionStateSchema.safeParse` on load so corrupt/missing storage falls back to `EMPTY_SESSION_STATE` instead of crashing.
5. **`lib/query/`** — a thin TanStack Query adapter over that one localStorage blob. `useSessionQuery` is the single source of truth (`queryKey: ['session']`); every other selector hook derives from it. `createSessionMutation.ts` wraps a mutation reducer with optimistic-update → localStorage-write → rollback-on-error, **and pipes every mutation's result through `fillOpenCourts`** (see below) — this is what makes court auto-advancement happen without every reducer needing to know about it.
6. **`lib/hooks/`** — one-line hooks wrapping each mutation reducer via `useSessionMutation`, plus plain selector hooks (`usePlayers`, `useCourts`, etc.) in `useSessionState.ts`.
7. **`components/`** — grouped by feature (`players/`, `setup/`, `round/`, `history/`, `session/`, `layout/`, `ui/` for shadcn primitives). No component ever imports `lib/storage` directly.

**Golden rule:** components/hooks never touch `localStorage` or the scheduling engine directly — always go through a mutation in `lib/mutations/` (invoked via a hook in `lib/hooks/`).

### The scheduling engine (`lib/engine/generateNextMatch.ts`)

Courts run **independently** — there is no global "round" that synchronizes all courts. Each court has its own current match, its own timer, its own start/stop lifecycle.

- `generateNextMatchForCourt(state, courtId)` is the pure entry point: given the current state, decides whether enough free players exist for *this one court* and builds a Match if so. It considers only players not currently `busy` (seated in any other undecided match anywhere — see `busyPlayerIds`, which looks at each court's *latest* match only, to avoid stale/superseded matches wrongly blocking players).
- Doubles matches are **always exactly 2v2** — never uneven. If the player count doesn't divide evenly, the leftover sits out (reusing the same rest/rotation machinery as singles) rather than forming a 1v2/2v3 match.
- Unlinked-pair scrambling (`lib/engine/pairing.ts::formBestDoublesSplit`): among the 4 selected players, evaluates every structurally-valid 2v2 split (only 1 possible arrangement if a linked pair is involved, up to 3 if all four are unlinked) and picks whichever minimizes combined repeat-partnership + repeat-opponent history, so partners/opponents actually get reshuffled over time instead of repeating.
- Fairness/rotation is enforced via two symmetric streak counters on `Player`: `consecutiveGames` (forces a rest once someone's played too many in a row — `lib/engine/restRules.ts::isForcedRest`) and `consecutiveSitOuts` (guarantees a spot once someone's been benched too many cycles in a row, overriding normal priority/tie-breaks — `isForcedPlay`). Both thresholds are `REST_STREAK_THRESHOLD`/`SIT_OUT_STREAK_THRESHOLD` = 2. Selection logic reorders the priority list (forced-play front, forced-rest back, normal priority in between) rather than branching separately, so the existing "fall back to normal priority if not enough players" behavior falls out for free.
- `lib/mutations/rounds.ts::fillOpenCourts(state)` is the orchestrator: loops over every court, and for any court without a current undecided match, calls `generateNextMatchForCourt` and folds the result (new match, sit-out log entries, streak counter updates) into state. It's idempotent and a no-op until `state.sessionStarted` — this is what's piped through every mutation via the query adapter (#5 above), which is how "a court auto-fills the instant its result is recorded" actually happens: `recordResult` just marks the match decided, and the very same mutation call's `fillOpenCourts` pass immediately seats the next one.

### Session lifecycle (two independent "locks")

- **`sessionStarted`** (session-wide, one-way until explicitly reversed): sole gate for locking format/court configuration and for whether `fillOpenCourts` does anything. Set via `startSession`. `stopSession` can reverse it (clearing auto-filled matches) **only while no match has actually been started yet** (`anyMatchStarted`) — once real match history exists, it's a one-way door.
- **`match.startedAt`** (per-match): controls whether a specific match can still be swapped (`isMatchSwappable` = `startedAt === null`) versus is live/locked. Starting a match begins its timer and is what `recordResult` requires before accepting a winner.

### Swapping

`swapPlayerInMatch` (`lib/mutations/rounds.ts`) is a single unified reducer handling three cases by just applying the same id-swap to whichever match(es) contain the two ids: a team-switch (opponent within the same match), a cross-match swap (player in a different not-yet-started match), or a one-way substitution (free/waiting player). None of these ever touch `gamesPlayed`/`joinedAt`/streak counters.

### Match history vs. live state

`lib/mutations/rounds.ts::matchHistory(state)` returns every decided match (`winner !== null`), sorted by timestamp with `roundNumber` (a monotonic sequence, not a synchronized round number) as a tiebreak for matches decided in the same millisecond. This is a pure historical view — it deliberately does not care whether a match is still any court's "current" one.

### PWA / offline (`app/sw.ts`, `next.config.ts`)

- Serwist, via `@serwist/next`. Service worker is **disabled in development** (`disable: process.env.NODE_ENV === "development"`) — this is intentional (avoids stale-cache dev confusion), not a bug. Test offline/install behavior against `npm run build && npm start`, never `npm run dev`.
- `additionalPrecacheEntries` in `next.config.ts` explicitly lists every route (`/`, `/players/`, `/history/`, `/setup/`) — Next's App Router doesn't emit page/document routes into the asset manifest Serwist precaches from by default, so without this a route you hadn't visited while online (especially `/` itself, visited before the SW finishes installing) fails offline. **When adding a new route, add it here too.**
- `app/sw.ts` overrides Serwist's default page/RSC/same-origin-navigation caching strategies with a short `networkTimeoutSeconds` (2s). The upstream defaults have no timeout at all, which makes every navigation hang waiting for the network to *definitively* fail before falling back to the cache — this is what caused a real "very slow when offline/installed" bug. Don't remove this override.
- `reloadOnOnline` is explicitly `false` — some browsers/networks fire the `online` event repeatedly, and the default behavior reloads the page every time, which reads as an infinite reload loop. This app has no server data that would ever need a reconnect-triggered refresh.
- `public/manifest.json` uses **relative** paths (`start_url: "."`, `icons/icon-*.png`) so it works under any `basePath` without a build step rewriting it.
- `public/.nojekyll` is required — without it, GitHub Pages' Jekyll processing silently strips the `_next/` folder.

### Testing conventions

- Vitest, colocated in `__tests__/` folders next to the code they test.
- Pure reducers/engine functions are tested directly with hand-built `SessionState`/`Player`/`Match` fixtures (see `makePlayer`/`baseState` helpers repeated per test file) — no React, no mocking of storage or query.
- When a test needs a specific court occupancy scenario, it composes real mutations (`fillOpenCourts`, `startMatch`, `recordResult`, etc.) rather than hand-constructing intermediate state, so it double-checks the actual pipeline.

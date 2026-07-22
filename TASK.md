# Pickleball Round-Robin Matcher — Project Plan

## Stack
- **Next.js** (App Router)
- **Zod** — schema validation for all data models
- **TanStack Query** — used as a client-only cache/mutation layer over `localStorage` (no server exists; TanStack Query still gives us query keys, invalidation, and optimistic updates for a snappier UI when generating rounds/recording results)
- **PWA**: `next-pwa` or `@serwist/next` for service worker + manifest (pick one; Serwist is the actively maintained successor to next-pwa as of early 2026 — verify current status before locking in)
- No backend, no auth, no network calls required at runtime

## Confirmed Product Decisions
| Topic | Decision |
|---|---|
| Match format | Both doubles (2v2) and singles (1v1), selectable per session |
| Uneven player counts | No bench/sit-out — allow uneven matches (e.g. 1v2) so everyone plays every round |
| Linked players | Always teammates whenever both are active/present |
| Match result entry | Tap winning side only — no score entry |
| Sessions | Single ongoing session/pool; "reset" wipes everything (confirm dialog required) |
| Mid-session player add | Joins queue, prioritized by fewest games played (same priority logic as existing players) |
| Ratings (DUPR etc.) | Out of scope for v1 |
| Linking scope | Strictly pairs — a player can only be linked to one other player at a time |
| Manual pairing swap | Allowed — players can be swapped between matches/courts *before* a generated round starts. Swapping does not reset or penalize either player's queue priority; it's purely a reassignment for that round |
| Player removal mid-session | Soft-remove only (set `active: false`) — never hard-delete. Preserves their historical stats/matches; excludes them from all future round generation |
| Format lock | Format (singles or doubles) is chosen once, before the session starts, and cannot be changed afterward. The only exception is the existing uneven-match fallback (e.g. 1v2 in doubles) when player counts don't divide evenly — that's a per-round scheduling adjustment, not a format change |

## Data Model (define as Zod schemas first, derive TS types from them)

```
Player {
  id: string
  name: string
  linkedPlayerId?: string       // mutual link, always teammates
  active: boolean               // false = removed mid-session (soft-delete); excluded from future rounds but history/stats retained
  joinedAt: number              // used for queue priority on mid-session adds
  gamesPlayed: number
  wins: number
  losses: number
}

Court {
  id: string
  name: string                  // "Court 1", editable
}

Match {
  id: string
  roundNumber: number
  courtId: string
  teamA: string[]                // player ids — length 1 or 2
  teamB: string[]                // may be uneven vs teamA (e.g. 1 vs 2)
  winner: 'A' | 'B' | null        // null until recorded
  timestamp: number
}

SessionSettings {
  format: 'singles' | 'doubles'
  courtCount: number
}

SessionState {
  players: Player[]
  courts: Court[]
  matches: Match[]
  settings: SessionSettings
  currentRound: number
}
```

## UI / Design Guidelines
- **Icons**: use `lucide-react` throughout (player, court, trophy/win, link, plus/add, etc.) instead of emoji or custom SVGs — keeps things consistent and lightweight
- **Density over decoration**: this is a utility app used courtside, often glanced at quickly — prioritize information density over whitespace. Tighter padding/margins, compact list rows, small font sizes where legible, avoid large hero sections or big empty cards
- Favor **tables/lists** over cards when displaying player stats or court assignments, since cards waste space with padding and only show one record at a time
- Keep visual style minimal: rely on typography weight/size and subtle borders/dividers to separate sections rather than heavy shadows, gradients, or large rounded corners
- Should still be usable one-handed on a phone screen at a glance mid-game — legibility and tap-target size matter more than density in the match-recording view specifically (the "tap winner" buttons should stay large enough to hit reliably even if everything else is compact)

## Build Phases

### Phase 0 — Project Setup
- [ ] Scaffold Next.js app (App Router, TypeScript)
- [ ] Add manifest.json, icons, service worker config for PWA installability + offline shell caching
- [ ] Verify app installs and loads with network fully disabled (airplane mode test)
- [ ] Zod schemas for all models above, with inferred types exported
- [ ] TanStack Query setup: a thin adapter so `useQuery`/`useMutation` read/write `localStorage` under the hood (e.g. `usePlayers()`, `useMatches()`) — centralizes persistence so no component touches `localStorage` directly

### Phase 1 — Player Management
- [ ] Add / edit player
- [ ] **Remove player** = soft-delete: set `active: false`, do not delete the record or their match history. Removed players disappear from future scheduling but their stats stay in the summary view (decide: show them in stats list tagged "left session," or hide entirely — recommend showing, since their games still count toward session totals)
- [ ] If a removed player was already assigned to the *current, already-generated* round, leave their current match as-is (don't retroactively rewrite a round in progress) — they simply won't appear starting next round
- [ ] Link two players together (bidirectional — linking A→B also sets B→A); unlink action
- [ ] UI must show linked pairs clearly in the player list
- [ ] Validate: a player can only be linked to one other player at a time. If a user tries to link a player who is already linked to someone else, replace the old link (auto-unlink the previous pair) rather than rejecting the action

### Phase 2 — Court & Format Setup
- [ ] Configure number of courts (add/remove), editable court names
- [ ] Format toggle: singles / doubles, chosen once before the session starts (before adding players / generating the first round) and locked for the rest of the session — no mid-session format changes

### Phase 3 — Round-Robin Scheduling Engine
This is the core logic. Implement as a pure function: `generateNextRound(sessionState) → Match[]`, so it's independently testable.

**Priority order for building each round's pairings:**
1. **Respect links** — linked pairs are always placed on the same team when both are active.
2. **Equalize games played** — players with fewer `gamesPlayed` get priority to be scheduled before players who've played more.
3. **Minimize repeat partnerships/matchups** — among equally-eligible players, prefer pairings that haven't happened yet (track a simple partner/opponent history count per player pair).
4. **No sit-outs** — if the active player count doesn't evenly divide into full teams across available courts, form an uneven match (e.g. 1v2) rather than benching anyone. Every active player should be in a match every round.

**Edge case to resolve during implementation:** in **singles** mode, matches are inherently 1v1 — there's no natural "uneven" equivalent like doubles has. If there's an odd number of active players, the agent needs to pick one of:
   - one player sits out that round (breaks the "no sit-outs" preference, but may be unavoidable in singles), or
   - the leftover player plays a makeshift 1v2 against a pair for that round only.

   Recommend defaulting to a fair rotating sit-out **only for this singles-odd-count edge case**, and clearly displaying who's sitting out and why. Surface this in the UI, don't silently drop a player.

- [ ] Implement pairing algorithm per above priority order
- [ ] "Generate Next Round" is a manual, explicit action (not automatic/timed)
- [ ] Mid-session add: new player enters the pool immediately, `gamesPlayed = 0` puts them at top priority for the next generated round
- [ ] **Manual swap before round start**: once a round is generated but before any result is recorded, allow the user to swap two players' assigned matches/courts (e.g. drag-and-drop or tap-to-swap). This only changes the `teamA`/`teamB` assignments on the not-yet-played `Match` records for that round — it must NOT touch `gamesPlayed`, `joinedAt`, or any queue-priority field for either player. Once the round is confirmed/results start coming in, matches lock and swapping is no longer available for that round
- [ ] Unit tests: even doubles count, odd doubles count (uneven match), even/odd singles, linked pair present, mid-round player add, swap-before-start preserves queue priority, player removed mid-round doesn't affect that round's already-generated matches

### Phase 4 — Live Round View & Match Recording
- [ ] Show current round: each court with its matchup
- [ ] Tap-to-record winner (side A or B) — no score entry
- [ ] On result recorded: update both players'/teams' `gamesPlayed`, `wins`, `losses`
- [ ] Allow editing/undoing the most recent result (mistakes happen mid-game)
- [ ] Prevent generating the next round until all current-round matches are recorded (or explicitly allow skipping — decide as a confirm-dialog escape hatch)

### Phase 5 — Stats & Summary
- [ ] Per-player: games played, wins, losses, win rate %
- [ ] Session-wide summary view (sortable by win rate / games played)
- [ ] Handle divide-by-zero (0 games played → show "—" not "NaN%")

### Phase 6 — Persistence
- [ ] All state persisted to `localStorage` on every mutation via the TanStack Query adapter
- [ ] Explicit "Reset Session" action with a confirmation dialog (irreversible — wipes players, matches, and stats)
- [ ] Handle corrupted/missing localStorage gracefully (Zod `.safeParse` on load, fall back to empty state rather than crashing)

### Phase 7 — PWA Polish
- [ ] App icon set (multiple sizes), manifest name/short_name/theme colors
- [ ] "Add to Home Screen" works on iOS Safari and Android Chrome
- [ ] Confirm full functionality offline after first load (no network calls exist at runtime, but verify the service worker caches the app shell correctly)

## Non-Goals for v1 (explicitly out of scope)
- DUPR or any skill-based rating system
- Multi-device sync or any backend/server
- Multiple named/saved sessions — only one active session at a time
- Score entry (points) — win/loss only
- Automated round timers
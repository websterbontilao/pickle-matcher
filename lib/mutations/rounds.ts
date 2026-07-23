import type { Match, Player, SessionState } from "@/lib/schemas";
import { busyPlayerIds, generateNextMatchForCourt } from "@/lib/engine/generateNextMatch";

export { busyPlayerIds };

/** The latest match generated for a specific court (by sequence number),
 * or undefined if that court has never had one. Courts advance
 * independently, so "current" is always just "most recently generated for
 * this court", regardless of what any other court is doing. */
export function currentMatchForCourt(state: SessionState, courtId: string): Match | undefined {
  const matches = state.matches.filter((m) => m.courtId === courtId);
  if (matches.length === 0) return undefined;
  return matches.reduce((a, b) => (a.roundNumber > b.roundNumber ? a : b));
}

/** A match can be swapped only in the window between generation and
 * "Start match" — starting is what locks the lineup in and begins the
 * timer. */
export function isMatchSwappable(match: Match): boolean {
  return match.startedAt === null;
}

/** Active players not currently assigned to any in-progress-or-pending
 * match anywhere — i.e. the live "waiting" pool, whether they're waiting
 * because of a forced rest or simply because every court is occupied. */
export function currentlyWaitingPlayers(state: SessionState): Player[] {
  const busy = busyPlayerIds(state);
  return state.players.filter((p) => p.active && !busy.has(p.id));
}

/** Every decided match, most recently finished first. Includes matches
 * that are no longer any court's "current" one (e.g. superseded by a later
 * auto-generated match), since this is a record of what was actually
 * played, not a live-state view. */
export function matchHistory(state: SessionState): Match[] {
  return state.matches
    .filter((m) => m.winner !== null)
    .sort((a, b) => b.timestamp - a.timestamp || b.roundNumber - a.roundNumber);
}

/**
 * Fills every court that doesn't currently have an in-progress-or-pending
 * match with a freshly generated one, as long as there are enough free
 * players. Safe to call after any mutation — it's idempotent and no-ops
 * entirely until the session has been explicitly started. Courts are
 * filled in order, and each fill immediately affects eligibility for the
 * next court checked in the same pass (so two courts freeing up
 * simultaneously don't both try to claim the same players).
 */
export function fillOpenCourts(state: SessionState, deps: { now?: () => number } = {}): SessionState {
  if (!state.sessionStarted) return state;

  let next = state;
  let changed = false;

  for (const court of next.courts) {
    const current = currentMatchForCourt(next, court.id);
    if (current && current.winner === null) continue;

    const result = generateNextMatchForCourt(next, court.id, deps);
    if (!result.match) continue;

    const restedIds = new Set(result.restedPlayerIds);
    const playingIds = new Set([...result.match.teamA, ...result.match.teamB]);
    next = {
      ...next,
      matches: [...next.matches, result.match],
      sitOuts: [...next.sitOuts, ...result.restedSitOuts],
      matchSequence: next.matchSequence + 1,
      players: next.players.map((p) => {
        if (restedIds.has(p.id)) {
          return { ...p, consecutiveGames: 0, consecutiveSitOuts: p.consecutiveSitOuts + 1 };
        }
        if (playingIds.has(p.id)) return { ...p, consecutiveSitOuts: 0 };
        return p;
      }),
    };
    changed = true;
  }

  return changed ? next : state;
}

export interface StartMatchInput {
  matchId: string;
}

/** Locks in the generated lineup and starts its timer. Before this, players
 * can still be swapped around. */
export function startMatch(state: SessionState, input: StartMatchInput): SessionState {
  const match = state.matches.find((m) => m.id === input.matchId);
  if (!match || match.startedAt !== null) return state;
  return {
    ...state,
    matches: state.matches.map((m) => (m.id === input.matchId ? { ...m, startedAt: Date.now() } : m)),
  };
}

/** Swaps two ids wherever they each appear in `team` — a no-op for
 * whichever side doesn't contain either id. Applying this to both teamA and
 * teamB of the same match switches the two players' team assignment
 * (since a player only ever appears in one of the two arrays); applying it
 * across two different matches' arrays performs a cross-match swap. */
function swapWithinTeam(team: string[], a: string, b: string): string[] {
  return team.map((id) => (id === a ? b : id === b ? a : id));
}

export interface SwapPlayerInput {
  matchId: string;
  outPlayerId: string;
  inPlayerId: string;
}

/**
 * Swaps `outPlayerId` (who must be in this not-yet-started match) with
 * `inPlayerId`, wherever they currently are:
 * - on the opposing team of this same match — a team switch;
 * - in a different not-yet-started match — a two-way swap;
 * - nowhere (free/waiting) — a one-way replacement.
 * Never touches gamesPlayed/joinedAt/consecutiveGames. Whichever of the two
 * ends up seated in a match gets `consecutiveSitOuts` cleared — otherwise a
 * player brought in from the bench keeps whatever streak they'd built up
 * (fillOpenCourts only clears it when *it* seats someone), and immediately
 * re-qualifies for a guaranteed spot the very next cycle even though the
 * swap just gave them a game. No-ops if this match is locked, `outPlayerId`
 * isn't actually in it, the swap is a no-op, or `inPlayerId` is actively
 * playing (started) in a different match.
 */
export function swapPlayerInMatch(state: SessionState, input: SwapPlayerInput): SessionState {
  const match = state.matches.find((m) => m.id === input.matchId);
  if (!match || !isMatchSwappable(match)) return state;
  if (input.outPlayerId === input.inPlayerId) return state;
  if (!match.teamA.includes(input.outPlayerId) && !match.teamB.includes(input.outPlayerId)) return state;

  const otherMatch = state.matches.find(
    (m) =>
      m.id !== match.id &&
      m.winner === null &&
      (m.teamA.includes(input.inPlayerId) || m.teamB.includes(input.inPlayerId)),
  );
  if (otherMatch && !isMatchSwappable(otherMatch)) return state;

  const matches = state.matches.map((m) => {
    if (m.id === match.id || (otherMatch && m.id === otherMatch.id)) {
      return {
        ...m,
        teamA: swapWithinTeam(m.teamA, input.outPlayerId, input.inPlayerId),
        teamB: swapWithinTeam(m.teamB, input.outPlayerId, input.inPlayerId),
      };
    }
    return m;
  });

  const stillSeated = new Set(
    matches.filter((m) => m.winner === null).flatMap((m) => [...m.teamA, ...m.teamB]),
  );
  const players = state.players.map((p) => {
    if ((p.id === input.inPlayerId || p.id === input.outPlayerId) && stillSeated.has(p.id) && p.consecutiveSitOuts !== 0) {
      return { ...p, consecutiveSitOuts: 0 };
    }
    return p;
  });

  return { ...state, matches, players };
}

export interface RecordResultInput {
  matchId: string;
  winner: "A" | "B";
}

export function recordResult(state: SessionState, input: RecordResultInput): SessionState {
  const match = state.matches.find((m) => m.id === input.matchId);
  if (!match || match.startedAt === null || match.winner !== null) return state;

  const winningTeam = input.winner === "A" ? match.teamA : match.teamB;
  const losingTeam = input.winner === "A" ? match.teamB : match.teamA;

  const players = state.players.map((p) => {
    if (winningTeam.includes(p.id)) {
      return { ...p, gamesPlayed: p.gamesPlayed + 1, wins: p.wins + 1, consecutiveGames: p.consecutiveGames + 1 };
    }
    if (losingTeam.includes(p.id)) {
      return { ...p, gamesPlayed: p.gamesPlayed + 1, losses: p.losses + 1, consecutiveGames: p.consecutiveGames + 1 };
    }
    return p;
  });

  const matches = state.matches.map((m) =>
    m.id === input.matchId ? { ...m, winner: input.winner, timestamp: Date.now() } : m,
  );

  return { ...state, players, matches };
}

/** Reverses a single recorded match's stats and resets its winner to null,
 * used by changeResult to swap in a different winner. */
function revertMatchResult(state: SessionState, match: Match): SessionState {
  const winningTeam = match.winner === "A" ? match.teamA : match.teamB;
  const losingTeam = match.winner === "A" ? match.teamB : match.teamA;

  const players = state.players.map((p) => {
    if (winningTeam.includes(p.id)) {
      return {
        ...p,
        gamesPlayed: Math.max(0, p.gamesPlayed - 1),
        wins: Math.max(0, p.wins - 1),
        consecutiveGames: Math.max(0, p.consecutiveGames - 1),
      };
    }
    if (losingTeam.includes(p.id)) {
      return {
        ...p,
        gamesPlayed: Math.max(0, p.gamesPlayed - 1),
        losses: Math.max(0, p.losses - 1),
        consecutiveGames: Math.max(0, p.consecutiveGames - 1),
      };
    }
    return p;
  });

  const matches = state.matches.map((m) => (m.id === match.id ? { ...m, winner: null } : m));

  return { ...state, players, matches };
}

/** Changes an already-decided match to a different winner — reverts the
 * previous winner's stats, then records the new one. No-ops if the match
 * isn't decided yet (use recordResult for that) or the winner is unchanged. */
export function changeResult(state: SessionState, input: RecordResultInput): SessionState {
  const match = state.matches.find((m) => m.id === input.matchId);
  if (!match || match.winner === null || match.winner === input.winner) return state;

  return recordResult(revertMatchResult(state, match), input);
}

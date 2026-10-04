import type { Match, Player, SessionState } from "@/lib/schemas";
import { buildPairHistory } from "./pairHistory";
import { getSchedulableUnits, getSoloUnits, rankUnits } from "./units";
import { formBestDoublesSplit } from "./pairing";
import { buildSitOut, computeStreakThreshold, isForcedRest, REST_REASON, WAITING_REASON } from "./restRules";
import type { MatchGenerationResult, RankedUnit, Unit } from "./types";

export interface GenerateMatchDeps {
  now?: () => number;
}

/** The latest (highest-sequence) match generated for each court — a court
 * only ever has one *current* match, even though older, since-superseded
 * matches (e.g. reverted by undo after the court already auto-advanced)
 * may still linger in history with winner still null. */
function latestMatchByCourtId(matches: Match[]): Map<string, Match> {
  const latest = new Map<string, Match>();
  for (const match of matches) {
    const existing = latest.get(match.courtId);
    if (!existing || match.roundNumber > existing.roundNumber) latest.set(match.courtId, match);
  }
  return latest;
}

/** Anyone currently assigned to an undecided *current* match anywhere
 * (started or still in the pre-start swap window) — they can't be
 * double-booked onto another court at the same time. Only each court's
 * latest match counts, so a superseded/reverted older match can't
 * incorrectly keep its players marked busy. */
export function busyPlayerIds(state: SessionState): Set<string> {
  const busy = new Set<string>();
  for (const match of latestMatchByCourtId(state.matches).values()) {
    if (match.winner !== null) continue;
    for (const id of match.teamA) busy.add(id);
    for (const id of match.teamB) busy.add(id);
  }
  return busy;
}

function buildMatch(courtId: string, sequence: number, teamA: string[], teamB: string[], now: () => number): Match {
  return {
    id: `${sequence}-${courtId}-${teamA.join("+")}-vs-${teamB.join("+")}`,
    roundNumber: sequence,
    courtId,
    teamA,
    teamB,
    winner: null,
    startedAt: null,
    timestamp: now(),
  };
}

function reasonFor(player: Player, threshold: number): string {
  return isForcedRest(player, threshold) ? REST_REASON : WAITING_REASON;
}

function streakThreshold(state: SessionState): number {
  const activePlayerCount = state.players.filter((p) => p.active).length;
  const playersPerMatch = state.settings.format === "singles" ? 2 : 4;
  return computeStreakThreshold(activePlayerCount, state.courts.length, playersPerMatch);
}

/** Everyone free to be seated right now (active and not in any undecided
 * current match), grouped into units for the session's format and in the
 * exact order the scheduler will consider them — newcomers, then forced
 * play, then normal priority, then forced rest. This is what the Next Up
 * preview renders, so it always matches what actually happens. */
export function nextUpQueue(state: SessionState): RankedUnit[] {
  const busy = busyPlayerIds(state);
  const eligible = state.players.filter((p) => p.active && !busy.has(p.id));
  const units = state.settings.format === "singles" ? getSoloUnits(eligible) : getSchedulableUnits(eligible);
  const playersById = new Map(eligible.map((p) => [p.id, p]));
  return rankUnits(units, playersById, streakThreshold(state));
}

/**
 * Pure, per-court match generation: given the current state and a specific
 * court, decides whether enough free (active, not currently playing
 * elsewhere) players exist to seat a new match there, and if so, builds it.
 * Courts advance independently — this never looks at what any other court
 * is doing beyond who they're currently holding onto (via busyPlayerIds).
 */
export function generateNextMatchForCourt(
  state: SessionState,
  courtId: string,
  deps: GenerateMatchDeps = {},
): MatchGenerationResult {
  const now = deps.now ?? Date.now;
  const sequence = state.matchSequence + 1;
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const queue = nextUpQueue(state);
  const threshold = streakThreshold(state);
  const target = state.settings.format === "singles" ? 2 : 4;
  const totalSlots = queue.reduce((sum, u) => sum + u.playerIds.length, 0);

  if (totalSlots < target) {
    return { match: null, restedSitOuts: [], restedPlayerIds: [] };
  }

  const { playing, benched } = splitUnitsByRest(queue, target);
  const { teamA, teamB } =
    state.settings.format === "singles"
      ? { teamA: playing[0].playerIds, teamB: playing[1].playerIds }
      : formBestDoublesSplit(playing, buildPairHistory(state.matches));
  const match = buildMatch(courtId, sequence, teamA, teamB, now);

  const restedPlayers = benched.flatMap((u) => u.playerIds.map((id) => playersById.get(id)!));
  return {
    match,
    restedSitOuts: restedPlayers.map((p) => buildSitOut(p, sequence, reasonFor(p, threshold))),
    restedPlayerIds: restedPlayers.map((p) => p.id),
  };
}

/** Splits the ranked queue into who plays this cycle and who sits out.
 * Newcomer and forced-play units are guaranteed a spot (newcomers first if
 * they can't all fit); forced-rest units only play if there aren't enough
 * normal-tier players to fill the match. Works at the Unit level, so a
 * linked pair rests or plays together, and the guarantee is by slot count
 * rather than headcount. */
function splitUnitsByRest(queue: RankedUnit[], target: number): { playing: Unit[]; benched: Unit[] } {
  const guaranteed = queue.filter((u) => u.tier === "newcomer" || u.tier === "guaranteed");
  const guaranteedSlots = guaranteed.reduce((sum, u) => sum + u.playerIds.length, 0);

  if (guaranteedSlots >= target) {
    // Rare: the guaranteed group alone already fills (or overflows) the
    // match. Fall back to the normal exact-fit selection, scoped to just
    // that pool — its ordering keeps newcomers ahead.
    const { playing, benched } = selectPlayingUnits(guaranteed, target);
    return { playing, benched: [...benched, ...queue.filter((u) => !guaranteed.includes(u))] };
  }

  const remainder = queue.filter((u) => !guaranteed.includes(u));
  const restingRemainder = remainder.filter((u) => u.tier === "resting");
  const normalRemainder = remainder.filter((u) => u.tier !== "resting");
  const remainingTarget = target - guaranteedSlots;
  const normalSlots = normalRemainder.reduce((sum, u) => sum + u.playerIds.length, 0);
  const pool = normalSlots >= remainingTarget ? normalRemainder : remainder;

  const { playing: morePlaying, benched } = selectPlayingUnits(pool, remainingTarget);
  const allBenched = normalSlots >= remainingTarget ? [...benched, ...restingRemainder] : benched;
  return { playing: [...guaranteed, ...morePlaying], benched: allBenched };
}

/**
 * Splits priority-sorted units into the ones that play this cycle and the
 * ones that don't, so the number of playing slots is always exactly
 * `target` (a multiple of 4) — doubles matches are always a clean 2v2,
 * never uneven. Unit sizes are only 1 (lone player) or 2 (linked pair), so
 * an exact-sum subset is always reachable; this tries every way to split
 * `target` between linked pairs and lone players (there are at most as many
 * ways as there are linked pairs, so this is cheap) and keeps whichever
 * split covers the most total priority — i.e. is biased toward including
 * whoever has played the fewest games.
 */
function selectPlayingUnits(units: Unit[], target: number): { playing: Unit[]; benched: Unit[] } {
  const n = units.length;
  const twos = units.map((u, index) => ({ u, index })).filter((x) => x.u.playerIds.length === 2);
  const ones = units.map((u, index) => ({ u, index })).filter((x) => x.u.playerIds.length === 1);

  let bestPairCount = 0;
  let bestScore = -Infinity;
  for (let pairCount = 0; pairCount <= twos.length; pairCount++) {
    const singleCount = target - 2 * pairCount;
    if (singleCount < 0 || singleCount > ones.length) continue;
    const selected = [...twos.slice(0, pairCount), ...ones.slice(0, singleCount)];
    const score = selected.reduce((sum, x) => sum + (n - x.index), 0);
    if (score > bestScore) {
      bestScore = score;
      bestPairCount = pairCount;
    }
  }

  const singleCount = target - 2 * bestPairCount;
  const selectedIndexes = new Set(
    [...twos.slice(0, bestPairCount), ...ones.slice(0, singleCount)].map((x) => x.index),
  );
  const playing = units.filter((_, index) => selectedIndexes.has(index));
  const benched = units.filter((_, index) => !selectedIndexes.has(index));
  return { playing, benched };
}

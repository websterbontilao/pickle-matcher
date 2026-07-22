import type { Match, Player, SessionState } from "@/lib/schemas";
import { buildPairHistory } from "./pairHistory";
import { getSchedulableUnits } from "./units";
import { formBestDoublesSplit } from "./pairing";
import { buildSitOut, isForcedPlay, isForcedRest, REST_REASON, sortPlayersByPriority, WAITING_REASON } from "./restRules";
import type { MatchGenerationResult, Unit } from "./types";

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

function reasonFor(player: Player): string {
  return isForcedRest(player) ? REST_REASON : WAITING_REASON;
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
  const busy = busyPlayerIds(state);
  const eligible = state.players.filter((p) => p.active && !busy.has(p.id));
  const history = buildPairHistory(state.matches);

  if (state.settings.format === "singles") {
    return generateSinglesMatch(courtId, sequence, eligible, now);
  }
  return generateDoublesMatch(courtId, sequence, eligible, history, now);
}

function generateSinglesMatch(
  courtId: string,
  sequence: number,
  eligible: Player[],
  now: () => number,
): MatchGenerationResult {
  const target = 2;
  const { playing, resting } = splitByRest(eligible, target);

  if (playing.length < target) {
    return { match: null, restedSitOuts: [], restedPlayerIds: [] };
  }

  const match = buildMatch(courtId, sequence, [playing[0].id], [playing[1].id], now);
  return {
    match,
    restedSitOuts: resting.map((p) => buildSitOut(p, sequence, reasonFor(p))),
    restedPlayerIds: resting.map((p) => p.id),
  };
}

/**
 * Splits `eligible` (already priority-sorted candidates) into who plays
 * this cycle and who rests. Reorders the priority list so anyone on a
 * forced-play streak (sat out too many cycles in a row) comes first —
 * guaranteed a spot — anyone on a forced-rest streak (played too many in a
 * row) comes last — only included if there's no one else to fill the
 * match — and everyone else keeps their normal games-played priority in
 * between. Taking the front `target` off this reordered list then
 * naturally reproduces the existing soft-fallback behavior for forced
 * rest, while making forced play a hard guarantee (as long as it's
 * feasible to fit them all).
 */
function splitByRest(eligible: Player[], target: number): { playing: Player[]; resting: Player[] } {
  const sorted = sortPlayersByPriority(eligible);
  const forcedPlay = sorted.filter(isForcedPlay);
  const forcedRest = sorted.filter((p) => isForcedRest(p) && !isForcedPlay(p));
  const normal = sorted.filter((p) => !isForcedPlay(p) && !isForcedRest(p));
  const ordered = [...forcedPlay, ...normal, ...forcedRest];

  const playing = ordered.slice(0, target);
  const playingIds = new Set(playing.map((p) => p.id));
  const resting = sorted.filter((p) => !playingIds.has(p.id));
  return { playing, resting };
}

/** Same idea as splitByRest but at the Unit level, so a linked pair rests
 * or plays together, and forced-play is guaranteed by slot count rather
 * than headcount. */
function splitUnitsByRest(units: Unit[], playersById: Map<string, Player>, target: number): { playing: Unit[]; benched: Unit[] } {
  const isForcedPlayUnit = (u: Unit) => u.playerIds.some((id) => isForcedPlay(playersById.get(id)!));
  const isForcedRestUnit = (u: Unit) => u.playerIds.some((id) => isForcedRest(playersById.get(id)!));

  const forcedPlay = units.filter(isForcedPlayUnit);
  const forcedPlaySlots = forcedPlay.reduce((sum, u) => sum + u.playerIds.length, 0);

  if (forcedPlaySlots >= target) {
    // Rare: the guarantee-play group alone already fills (or overflows)
    // the match. Fall back to the normal exact-fit selection, scoped to
    // just that pool.
    return selectPlayingUnits(forcedPlay, target);
  }

  const remainder = units.filter((u) => !forcedPlay.includes(u));
  const forcedRestRemainder = remainder.filter(isForcedRestUnit);
  const normalRemainder = remainder.filter((u) => !isForcedRestUnit(u));
  const remainingTarget = target - forcedPlaySlots;
  const normalSlots = normalRemainder.reduce((sum, u) => sum + u.playerIds.length, 0);
  const pool = normalSlots >= remainingTarget ? normalRemainder : remainder;

  const { playing: morePlaying, benched } = selectPlayingUnits(pool, remainingTarget);
  const allBenched = normalSlots >= remainingTarget ? [...benched, ...forcedRestRemainder] : benched;
  return { playing: [...forcedPlay, ...morePlaying], benched: allBenched };
}

function generateDoublesMatch(
  courtId: string,
  sequence: number,
  eligible: Player[],
  history: ReturnType<typeof buildPairHistory>,
  now: () => number,
): MatchGenerationResult {
  const target = 4;
  const playersById = new Map(eligible.map((p) => [p.id, p]));
  const units = getSchedulableUnits(eligible);
  const totalSlots = units.reduce((sum, u) => sum + u.playerIds.length, 0);

  if (totalSlots < target) {
    return { match: null, restedSitOuts: [], restedPlayerIds: [] };
  }

  const { playing, benched } = splitUnitsByRest(units, playersById, target);

  const { teamA, teamB } = formBestDoublesSplit(playing, history);
  const match = buildMatch(courtId, sequence, teamA, teamB, now);

  const restedPlayers = benched.flatMap((u) => u.playerIds.map((id) => playersById.get(id)!));
  return {
    match,
    restedSitOuts: restedPlayers.map((p) => buildSitOut(p, sequence, reasonFor(p))),
    restedPlayerIds: restedPlayers.map((p) => p.id),
  };
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

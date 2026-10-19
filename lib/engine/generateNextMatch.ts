import type { Match, PlannedMatch, Player, SessionState } from "@/lib/schemas";
import { buildPairHistory } from "./pairHistory";
import { getSchedulableUnits, getSoloUnits, rankUnits } from "./units";
import { formBestDoublesSplit } from "./pairing";
import { ratingLookup } from "./balance";
import { buildSitOut, computeStreakThreshold, isForcedRest, REST_REASON, WAITING_REASON } from "./restRules";
import type { MatchGenerationResult, RankedUnit, RuleConflict, Unit } from "./types";

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

/** Everyone free to be seated right now, ranked — newcomers, then forced
 * play, then normal priority, then forced rest — before any reordering to
 * avoid a repeat foursome. */
function rankedQueue(state: SessionState): RankedUnit[] {
  const busy = busyPlayerIds(state);
  const eligible = state.players.filter((p) => p.active && !busy.has(p.id));
  const units = state.settings.format === "singles" ? getSoloUnits(eligible) : getSchedulableUnits(eligible);
  const playersById = new Map(eligible.map((p) => [p.id, p]));
  return rankUnits(units, playersById, streakThreshold(state));
}

/** Everyone free to be seated right now (active and not in any undecided
 * current match), grouped into units for the session's format and in the
 * exact order the scheduler will consider them — newcomers, then forced
 * play, then normal priority, then forced rest — with anyone swapped in to
 * avoid a repeat foursome moved up into the next match. This is what the
 * Next Up preview renders, so it always matches what actually happens. */
export function nextUpQueue(state: SessionState): RankedUnit[] {
  const queue = rankedQueue(state);
  if (state.plannedMatches.length > 0) return queue;
  const pick = pickLineup(state, queue);
  return pick?.swapped ? [...pick.playing, ...pick.benched] : queue;
}

/** The fewest of each court's recent matches a doubles lineup is checked
 * against. */
export const MIN_REPEAT_LOOKBACK = 2;

/** How many of each court's most recent matches a doubles lineup is checked
 * against — the same four players aren't put together again while they're
 * within this window on any court. Long enough to cover one full rotation
 * of the pool (e.g. 3 matches for 12 players on one court), so groups that
 * would otherwise cycle back as the same block get scrambled. */
export function repeatLookback(state: SessionState): number {
  const activePlayerCount = state.players.filter((p) => p.active).length;
  return Math.max(MIN_REPEAT_LOOKBACK, Math.ceil(activePlayerCount / (4 * Math.max(1, state.courts.length))));
}

/** How many player slots are swapped out of the queue's pick to avoid a
 * repeat foursome, so the group really gets reshuffled rather than coming
 * back as three of the same four. Fewer only when that's all that works. */
export const REPEAT_SWAPS = 2;

function lineupKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

function recentLineups(matches: Match[], lookback: number): Set<string> {
  const byCourt = new Map<string, Match[]>();
  for (const match of matches) byCourt.set(match.courtId, [...(byCourt.get(match.courtId) ?? []), match]);
  return new Set(
    [...byCourt.values()].flatMap((courtMatches) =>
      courtMatches
        .sort((a, b) => b.roundNumber - a.roundNumber)
        .slice(0, lookback)
        .map((m) => lineupKey([...m.teamA, ...m.teamB])),
    ),
  );
}

/** Who plays and who sits out of the next match, or null if there aren't
 * enough free players. In doubles, if the queue's pick is a foursome that
 * played together within the last `repeatLookback` matches of any court, up to
 * `REPEAT_SWAPS` slots (or fewer, if that's all that works) are swapped for
 * other waiting players. Newcomers are never swapped out. Swapping out a
 * guaranteed player or swapping in a resting one bends a fairness rule, so
 * it's only done when no swap without that works — which is the usual case when the courts take
 * the whole pool in turns (e.g. 8 players on one court: everyone waiting
 * just played, everyone seated just sat out). If no swap avoids a repeat,
 * the repeat stands. */
function pickLineup(
  state: SessionState,
  queue: RankedUnit[],
): { playing: RankedUnit[]; benched: RankedUnit[]; swapped: boolean } | null {
  const target = state.settings.format === "singles" ? 2 : 4;
  const totalSlots = queue.reduce((sum, u) => sum + u.playerIds.length, 0);
  if (totalSlots < target) return null;

  const { playing, benched } = splitUnitsByRest(queue, target);
  if (target !== 4) return { playing, benched, swapped: false };
  const recent = recentLineups(state.matches, repeatLookback(state));
  const key = (units: Unit[]) => lineupKey(units.flatMap((u) => u.playerIds));
  if (!recent.has(key(playing))) return { playing, benched, swapped: false };

  const index = new Map(queue.map((u, i) => [u, i]));
  const outs = unitSubsets(
    playing.filter((u) => u.tier !== "newcomer"),
    REPEAT_SWAPS,
  );
  const ins = unitSubsets(
    benched.filter((u) => u.tier === "normal" || u.tier === "resting"),
    REPEAT_SWAPS,
  );
  const slots = (units: Unit[]) => units.reduce((sum, u) => sum + u.playerIds.length, 0);
  const indexSum = (units: RankedUnit[]) => units.reduce((sum, u) => sum + index.get(u)!, 0);

  // A swap that bends no fairness rule (resting players pulled in,
  // guaranteed players benched) first; then the most slots swapped, up to
  // REPEAT_SWAPS; then the fewest rules bent; then the swap that pulls in
  // players nearest the front of the queue in place of the ones nearest
  // the back.
  const rank = (c: { out: RankedUnit[]; in: RankedUnit[]; slots: number; cost: number }) => {
    const bent = slots(c.in.filter((u) => u.tier === "resting")) + slots(c.out.filter((u) => u.tier === "guaranteed"));
    return [bent > 0 ? 1 : 0, -c.slots, bent, c.cost];
  };
  const better = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
  let best: { out: RankedUnit[]; in: RankedUnit[]; slots: number; cost: number } | null = null;
  for (const out of outs) {
    for (const add of ins) {
      if (slots(out) !== slots(add)) continue;
      const candidate = { out, in: add, slots: slots(out), cost: indexSum(add) - indexSum(out) };
      if (best && better(rank(candidate), rank(best)) >= 0) continue;
      const lineup = [...playing.filter((u) => !out.includes(u)), ...add];
      if (!recent.has(key(lineup))) best = candidate;
    }
  }
  if (!best) return { playing, benched, swapped: false };

  const byQueueOrder = (a: RankedUnit, b: RankedUnit) => index.get(a)! - index.get(b)!;
  const chosen = best;
  return {
    playing: [...playing.filter((u) => !chosen.out.includes(u)), ...chosen.in].sort(byQueueOrder),
    benched: [...benched.filter((u) => !chosen.in.includes(u)), ...chosen.out].sort(byQueueOrder),
    swapped: true,
  };
}

/** Every non-empty combination of units covering at most `maxSlots` player
 * slots. */
function unitSubsets<U extends Unit>(units: U[], maxSlots: number): U[][] {
  const subsets: U[][] = [];
  const walk = (start: number, picked: U[], used: number) => {
    if (picked.length > 0) subsets.push(picked);
    for (let i = start; i < units.length; i++) {
      const next = used + units[i].playerIds.length;
      if (next <= maxSlots) walk(i + 1, [...picked, units[i]], next);
    }
  };
  walk(0, [], 0);
  return subsets;
}

/**
 * Pure, per-court match generation: given the current state and a specific
 * court, decides whether enough free (active, not currently playing
 * elsewhere) players exist to seat a new match there, and if so, builds it.
 * Courts advance independently — this never looks at what any other court
 * is doing beyond who they're currently holding onto (via busyPlayerIds).
 * A planned match, if any, is seated before anything is calculated.
 */
export function generateNextMatchForCourt(
  state: SessionState,
  courtId: string,
  deps: GenerateMatchDeps = {},
): MatchGenerationResult {
  const now = deps.now ?? Date.now;
  const sequence = state.matchSequence + 1;
  if (state.plannedMatches.length > 0) {
    return generatePlannedMatch(state, state.plannedMatches[0], courtId, sequence, now);
  }
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const threshold = streakThreshold(state);
  const pick = pickLineup(state, rankedQueue(state));

  if (!pick) {
    return { match: null, restedSitOuts: [], restedPlayerIds: [] };
  }

  const { playing, benched } = pick;
  const { teamA, teamB } =
    state.settings.format === "singles"
      ? { teamA: playing[0].playerIds, teamB: playing[1].playerIds }
      : formBestDoublesSplit(playing, buildPairHistory(state.matches), ratingLookup(state.players));
  const match = buildMatch(courtId, sequence, teamA, teamB, now);

  const restedPlayers = benched.flatMap((u) => u.playerIds.map((id) => playersById.get(id)!));
  return {
    match,
    restedSitOuts: restedPlayers.map((p) => buildSitOut(p, sequence, reasonFor(p, threshold))),
    restedPlayerIds: restedPlayers.map((p) => p.id),
  };
}

/**
 * Seats the next planned match as locked in, overriding newcomer priority
 * and fairness rules (conflicts with the latter are reported, not
 * enforced). Any planned player who isn't free right now — gone inactive,
 * or seated elsewhere — has their slot refilled from the front of the
 * queue, preferring players not committed to a later plan; the rest of
 * the plan stands. Returns no match if there aren't enough free players
 * to fill it at all.
 */
function generatePlannedMatch(
  state: SessionState,
  plan: PlannedMatch,
  courtId: string,
  sequence: number,
  now: () => number,
): MatchGenerationResult {
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const threshold = streakThreshold(state);
  const queue = nextUpQueue(state);
  const free = new Set(queue.flatMap((u) => u.playerIds));
  const planIds = new Set([...plan.teamA, ...plan.teamB]);
  const laterPlanIds = new Set(state.plannedMatches.slice(1).flatMap((m) => [...m.teamA, ...m.teamB]));

  const refillOrder = queue.flatMap((u) => u.playerIds).filter((id) => !planIds.has(id));
  const refills = [
    ...refillOrder.filter((id) => !laterPlanIds.has(id)),
    ...refillOrder.filter((id) => laterPlanIds.has(id)),
  ];
  const fill = (id: string) => (free.has(id) ? id : refills.shift());
  const teamA = plan.teamA.map(fill);
  const teamB = plan.teamB.map(fill);
  if ([...teamA, ...teamB].some((id) => id === undefined)) {
    return { match: null, restedSitOuts: [], restedPlayerIds: [] };
  }

  const match = buildMatch(courtId, sequence, teamA as string[], teamB as string[], now);
  const playingIds = new Set([...match.teamA, ...match.teamB]);
  const restedPlayers = [...free].filter((id) => !playingIds.has(id)).map((id) => playersById.get(id)!);
  const target = state.settings.format === "singles" ? 2 : 4;

  return {
    match,
    restedSitOuts: restedPlayers.map((p) => buildSitOut(p, sequence, reasonFor(p, threshold))),
    restedPlayerIds: restedPlayers.map((p) => p.id),
    plannedMatchId: plan.id,
    // Newcomer priority isn't a fairness rule (a newcomer stuck behind
    // plans gets its own notice), so judge against the pick without them.
    ruleConflicts: ruleConflicts(queue, splitUnitsByRest(queue.filter((u) => !u.newcomer), target).playing, playingIds),
  };
}

/** Fairness rules a hand-picked lineup goes against, judged against what
 * the scheduler would have picked itself — so a resting player it would
 * have seated anyway isn't flagged: a resting player seated in place of
 * someone the scheduler preferred, or a guaranteed player the scheduler
 * would have seated but the plan leaves out. */
function ruleConflicts(queue: RankedUnit[], schedulerPick: Unit[], playingIds: Set<string>): RuleConflict[] {
  const picked = new Set(schedulerPick.flatMap((u) => u.playerIds));
  return queue.flatMap((u) =>
    u.playerIds.flatMap((id): RuleConflict[] => {
      if (u.tier === "resting" && playingIds.has(id) && !picked.has(id)) return [{ playerId: id, rule: "resting" }];
      if (u.tier === "guaranteed" && !playingIds.has(id) && picked.has(id)) return [{ playerId: id, rule: "guaranteed" }];
      return [];
    }),
  );
}

/** Splits the ranked queue into who plays this cycle and who sits out.
 * Newcomer and forced-play units are guaranteed a spot (newcomers first if
 * they can't all fit); forced-rest units only play if there aren't enough
 * normal-tier players to fill the match. Works at the Unit level, so a
 * linked pair rests or plays together, and the guarantee is by slot count
 * rather than headcount. */
function splitUnitsByRest<U extends RankedUnit>(queue: U[], target: number): { playing: U[]; benched: U[] } {
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
function selectPlayingUnits<U extends Unit>(units: U[], target: number): { playing: U[]; benched: U[] } {
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

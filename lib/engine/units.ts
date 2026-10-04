import type { Player } from "@/lib/schemas";
import { isForcedPlay, isForcedRest, rankedGames } from "./restRules";
import type { QueueTier, RankedUnit, Unit } from "./types";

function soloUnit(player: Player): Unit {
  return {
    playerIds: [player.id],
    rankedGames: rankedGames(player),
    queuePosition: player.queuePosition,
    newcomer: player.newcomer,
  };
}

/** Groups active players into schedulable Units: a mutually-linked active
 * pair becomes one 2-slot unit (so linking is enforced structurally, not by
 * a scoring heuristic); everyone else is a 1-slot unit. */
export function getSchedulableUnits(players: Player[]): Unit[] {
  const active = players.filter((p) => p.active);
  const byId = new Map(active.map((p) => [p.id, p]));
  const consumed = new Set<string>();
  const units: Unit[] = [];

  for (const player of active) {
    if (consumed.has(player.id)) continue;
    const linkedId = player.linkedPlayerId;
    const linked = linkedId ? byId.get(linkedId) : undefined;
    const isMutual = linked && linked.linkedPlayerId === player.id;

    if (isMutual && linked && !consumed.has(linked.id)) {
      consumed.add(player.id);
      consumed.add(linked.id);
      units.push({
        playerIds: [player.id, linked.id],
        rankedGames: rankedGames(player) + rankedGames(linked),
        queuePosition: Math.min(player.queuePosition, linked.queuePosition),
        newcomer: player.newcomer || linked.newcomer,
      });
    } else {
      consumed.add(player.id);
      units.push(soloUnit(player));
    }
  }

  return sortByPriority(units);
}

/** Singles ignores links — every active player is their own 1-slot unit. */
export function getSoloUnits(players: Player[]): Unit[] {
  return sortByPriority(players.filter((p) => p.active).map(soloUnit));
}

/** Fewer (ranked) games played first, then queue position, then a
 * deterministic id-based tie-break so tests are reproducible. */
export function sortByPriority(units: Unit[]): Unit[] {
  return [...units].sort((a, b) => {
    if (a.rankedGames !== b.rankedGames) return a.rankedGames - b.rankedGames;
    if (a.queuePosition !== b.queuePosition) return a.queuePosition - b.queuePosition;
    return a.playerIds.join(",").localeCompare(b.playerIds.join(","));
  });
}

const TIER_ORDER: QueueTier[] = ["newcomer", "guaranteed", "normal", "resting"];

function tierFor(unit: Unit, playersById: Map<string, Player>, threshold: number): QueueTier {
  if (unit.newcomer) return "newcomer";
  const players = unit.playerIds.map((id) => playersById.get(id)!);
  if (players.some((p) => isForcedPlay(p, threshold))) return "guaranteed";
  if (players.some((p) => isForcedRest(p, threshold))) return "resting";
  return "normal";
}

/**
 * The real queue order, shared by the scheduler and the Next Up preview so
 * the two can never disagree: newcomers first (one-match priority), then
 * anyone on a forced-play streak, then everyone else by normal priority,
 * then anyone on a forced-rest streak. Within each tier the
 * fewest-games/queue-position order from `sortByPriority` is kept.
 */
export function rankUnits(units: Unit[], playersById: Map<string, Player>, threshold: number): RankedUnit[] {
  const ranked = sortByPriority(units).map((u) => ({ ...u, tier: tierFor(u, playersById, threshold) }));
  return TIER_ORDER.flatMap((tier) => ranked.filter((u) => u.tier === tier));
}

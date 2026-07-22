import type { Player } from "@/lib/schemas";
import type { Unit } from "./types";

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
        gamesPlayed: player.gamesPlayed + linked.gamesPlayed,
        joinedAt: Math.min(player.joinedAt, linked.joinedAt),
      });
    } else {
      consumed.add(player.id);
      units.push({
        playerIds: [player.id],
        gamesPlayed: player.gamesPlayed,
        joinedAt: player.joinedAt,
      });
    }
  }

  return sortByPriority(units);
}

/** Fewer games played first, then whoever joined earliest, then a
 * deterministic id-based tie-break so tests are reproducible. */
export function sortByPriority(units: Unit[]): Unit[] {
  return [...units].sort((a, b) => {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.playerIds.join(",").localeCompare(b.playerIds.join(","));
  });
}

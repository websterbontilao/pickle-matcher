import { Scale } from "lucide-react";
import { imbalanceCause, ratingLookup, unevenTeams, type ImbalanceCause } from "@/lib/engine/balance";
import type { Player } from "@/lib/schemas";

/** "Uneven teams: 3.5 vs 2.75" when a match's sides differ by 0.5 or more
 * in average skill rating — however the match came about. A heads-up for
 * the organizer, never a block. Renders nothing for a fair match. */
function causeText(cause: ImbalanceCause, players: Player[]): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  const label = (id: string) => `${byId.get(id)?.name ?? "Unknown"} (${(byId.get(id)?.skillRating ?? 0).toFixed(1)})`;
  const list = (ids: string[]) => {
    const names = ids.map(label);
    return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  };
  const verb = (ids: string[]) => (ids.length === 1 ? "is" : "are");
  switch (cause.kind) {
    case "singles":
      return cause.playerIds.map(label).join(" vs ");
    case "stacked":
      return `${list(cause.playerIds)} are on the same team`;
    case "spread":
      return `${list(cause.strongIds)} ${verb(cause.strongIds)} much stronger than ${list(cause.weakIds)}`;
    case "above":
      return `${list(cause.playerIds)} ${verb(cause.playerIds)} rated well above the others`;
    case "below":
      return `${list(cause.playerIds)} ${verb(cause.playerIds)} rated well below the others`;
  }
}

export function UnevenNote({ match, players }: { match: { teamA: string[]; teamB: string[] }; players: Player[] }) {
  const ratingOf = ratingLookup(players);
  const uneven = unevenTeams(match, ratingOf);
  if (!uneven) return null;
  // Same look as the rating chips ("3.0"), with two decimals only when needed ("2.75").
  const format = (n: number) => (Number.isInteger(n * 2) ? n.toFixed(1) : n.toFixed(2));
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <Scale className="mt-px size-3.5 shrink-0" />
      <span>
        {match.teamA.length > 1 ? (
          <>
            Uneven teams ({format(uneven.teamA)} vs {format(uneven.teamB)}): {causeText(imbalanceCause(match, ratingOf), players)}
          </>
        ) : (
          <>Uneven match: {causeText(imbalanceCause(match, ratingOf), players)}</>
        )}
      </span>
    </p>
  );
}

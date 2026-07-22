import { Trophy } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatClock } from "@/lib/utils/duration";
import { cn } from "@/lib/utils";
import type { Court, Match, Player } from "@/lib/schemas";

function nameFor(id: string, players: Player[]): string {
  return players.find((p) => p.id === id)?.name ?? "Unknown";
}

function TeamCell({ ids, players, winner }: { ids: string[]; players: Player[]; winner: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1", winner && "font-semibold")}>
      {winner && <Trophy className="size-3.5 shrink-0" />}
      {ids.map((id) => nameFor(id, players)).join(" & ")}
    </span>
  );
}

export function MatchHistoryRow({ match, court, players }: { match: Match; court: Court | undefined; players: Player[] }) {
  const duration = match.startedAt !== null ? formatClock(match.timestamp - match.startedAt) : "—";

  return (
    <TableRow>
      <TableCell className="py-1.5 text-muted-foreground">{court?.name ?? "Unknown court"}</TableCell>
      <TableCell className="py-1.5">
        <div className="flex flex-col gap-0.5">
          <TeamCell ids={match.teamA} players={players} winner={match.winner === "A"} />
          <TeamCell ids={match.teamB} players={players} winner={match.winner === "B"} />
        </div>
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">{duration}</TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
        {new Date(match.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </TableCell>
    </TableRow>
  );
}

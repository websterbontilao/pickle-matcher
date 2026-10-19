"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MatchHistoryRow } from "./MatchHistoryRow";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { matchHistory } from "@/lib/mutations/rounds";
import { formatTimeOfDay } from "@/lib/utils/duration";
import type { Match, Player } from "@/lib/schemas";

type HistoryEntry = { kind: "match"; match: Match; at: number } | { kind: "removed"; player: Player; at: number };

export function MatchHistoryList() {
  const { state } = useSessionState();
  // Recorded matches and player removals, most recent first.
  const entries: HistoryEntry[] = [
    ...matchHistory(state).map((match) => ({ kind: "match" as const, match, at: match.timestamp })),
    ...state.players
      .filter((p) => p.removedAt !== undefined)
      .map((player) => ({ kind: "removed" as const, player, at: player.removedAt! })),
  ].sort((a, b) => b.at - a.at);

  if (entries.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches recorded yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Court</TableHead>
          <TableHead>Match</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead className="text-right">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) =>
          entry.kind === "match" ? (
            <MatchHistoryRow
              key={entry.match.id}
              match={entry.match}
              court={state.courts.find((c) => c.id === entry.match.courtId)}
              players={state.players}
            />
          ) : (
            <TableRow key={`removed-${entry.player.id}`}>
              <TableCell className="py-1.5 text-muted-foreground">—</TableCell>
              <TableCell colSpan={2} className="py-1.5 text-muted-foreground italic">
                {entry.player.name} left the session
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                {formatTimeOfDay(entry.at)}
              </TableCell>
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}

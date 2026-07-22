"use client";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MatchHistoryRow } from "./MatchHistoryRow";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { matchHistory } from "@/lib/mutations/rounds";

export function MatchHistoryList() {
  const { state } = useSessionState();
  const matches = matchHistory(state);

  if (matches.length === 0) {
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
        {matches.map((match) => (
          <MatchHistoryRow
            key={match.id}
            match={match}
            court={state.courts.find((c) => c.id === match.courtId)}
            players={state.players}
          />
        ))}
      </TableBody>
    </Table>
  );
}

"use client";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlayerRow } from "./PlayerRow";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { busyPlayerIds } from "@/lib/mutations/rounds";

export function PlayerList() {
  const { state } = useSessionState();
  const players = state.players;

  if (players.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">No players yet. Add one to start.</p>;
  }

  const busy = busyPlayerIds(state);
  const sorted = [...players].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Record</TableHead>
          <TableHead className="text-right">Win %</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            allPlayers={players}
            isPlaying={busy.has(player.id)}
            matches={state.matches}
          />
        ))}
      </TableBody>
    </Table>
  );
}

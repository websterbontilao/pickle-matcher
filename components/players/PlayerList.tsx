"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlayerRow } from "./PlayerRow";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { busyPlayerIds } from "@/lib/mutations/rounds";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PLAYER_SORT,
  defaultDirection,
  sortPlayers,
  type PlayerSort,
  type PlayerSortKey,
} from "@/lib/utils/playerSort";

const COLUMNS: { key: PlayerSortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "games", label: "Games", align: "right" },
  { key: "record", label: "Record", align: "right" },
  { key: "winRate", label: "Win %", align: "right" },
  { key: "time", label: "Time", align: "right" },
  { key: "added", label: "Added", align: "right" },
];

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  sort: PlayerSort;
  onSort: (key: PlayerSortKey) => void;
}) {
  const active = sort.key === column.key;
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(column.align === "right" && "text-right")}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          "inline-flex items-center gap-0.5 whitespace-nowrap hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {column.label}
        {active && <Arrow className="size-3" />}
      </button>
    </TableHead>
  );
}

export function PlayerList() {
  const { state } = useSessionState();
  const [sort, setSort] = useState<PlayerSort>(DEFAULT_PLAYER_SORT);
  const players = state.players;

  if (players.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">No players yet. Add one to start.</p>;
  }

  const busy = busyPlayerIds(state);
  const sorted = sortPlayers(players, sort, state.matches);

  // Tapping the active column flips it; a new column starts in its natural direction.
  const handleSort = (key: PlayerSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDirection(key) },
    );

  return (
    // Tighter cell padding on phones so all seven columns, including the
    // actions menu, fit without sideways scrolling.
    <Table className="[&_td]:px-1 [&_th]:px-1 sm:[&_td]:px-2 sm:[&_th]:px-2 [&_td:first-child]:pl-3 [&_th:first-child]:pl-3">
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <SortHeader key={column.key} column={column} sort={sort} onSort={handleSort} />
          ))}
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
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

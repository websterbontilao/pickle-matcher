"use client";

import { useState } from "react";
import { Link2, Link2Off, MoreHorizontal, Pencil, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLinkPlayers, useUnlinkPlayers } from "@/lib/hooks/usePlayerMutations";
import type { Player } from "@/lib/schemas";
import { EditPlayerDialog } from "./EditPlayerDialog";
import { RemovePlayerConfirmDialog } from "./RemovePlayerConfirmDialog";

const byName = (a: Player, b: Player) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** One "⋯" menu per row for link/unlink, edit, and remove — keeps the
 * Players table narrow enough for a phone. */
export function PlayerActionsMenu({
  player,
  allPlayers,
  isPlaying,
}: {
  player: Player;
  allPlayers: Player[];
  isPlaying: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const linkPlayers = useLinkPlayers();
  const unlinkPlayers = useUnlinkPlayers();

  const partner = player.linkedPlayerId ? allPlayers.find((p) => p.id === player.linkedPlayerId) : undefined;
  const linkCandidates = allPlayers.filter((p) => p.id !== player.id && p.active).sort(byName);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${player.name}`} />}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        {/* Flat rather than a nested submenu: a side-opening submenu from
            the screen's right edge has nowhere to go on a phone. */}
        <DropdownMenuContent align="end" className="max-h-80 min-w-44 overflow-y-auto">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Edit name
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={isPlaying} onClick={() => setRemoveOpen(true)}>
            <UserMinus />
            {isPlaying ? "Remove (in a match)" : "Remove"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {partner ? (
            <DropdownMenuItem onClick={() => unlinkPlayers.mutate({ id: player.id })}>
              <Link2Off />
              Unlink from {partner.name}
            </DropdownMenuItem>
          ) : linkCandidates.length === 0 ? (
            <DropdownMenuItem disabled>
              <Link2 />
              No one to link with
            </DropdownMenuItem>
          ) : (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Link2 className="size-3.5" />
                Link with
              </DropdownMenuLabel>
              {linkCandidates.map((c) => (
                <DropdownMenuItem key={c.id} className="pl-6" onClick={() => linkPlayers.mutate({ aId: player.id, bId: c.id })}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditPlayerDialog player={player} open={editOpen} onOpenChange={setEditOpen} />
      <RemovePlayerConfirmDialog player={player} open={removeOpen} onOpenChange={setRemoveOpen} />
    </>
  );
}

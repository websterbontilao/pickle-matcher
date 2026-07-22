"use client";

import { Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLinkPlayers, useUnlinkPlayers } from "@/lib/hooks/usePlayerMutations";
import type { Player } from "@/lib/schemas";

export function LinkPlayerControl({ player, allPlayers }: { player: Player; allPlayers: Player[] }) {
  const linkPlayers = useLinkPlayers();
  const unlinkPlayers = useUnlinkPlayers();

  if (player.linkedPlayerId) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-primary"
        title="Unlink"
        onClick={() => unlinkPlayers.mutate({ id: player.id })}
      >
        <Link2Off className="size-3.5" />
      </Button>
    );
  }

  const candidates = allPlayers.filter((p) => p.id !== player.id && p.active);

  if (candidates.length === 0) {
    return (
      <Button variant="ghost" size="icon" className="size-7" disabled title="No one to link with">
        <Link2 className="size-3.5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" title="Link with..." />}>
        <Link2 className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {candidates.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => linkPlayers.mutate({ aId: player.id, bId: c.id })}>
            Link with {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

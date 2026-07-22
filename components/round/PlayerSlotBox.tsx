"use client";

import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Player } from "@/lib/schemas";

export function PlayerSlotBox({
  player,
  swappable,
  candidates,
  onSwap,
}: {
  player: Player;
  swappable: boolean;
  candidates: Player[];
  onSwap: (inPlayerId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-sm">
      <span className="truncate">{player.name}</span>
      {swappable && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-6 shrink-0" />}>
            <ArrowLeftRight className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {candidates.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No one else available to swap</div>
            ) : (
              candidates.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => onSwap(c.id)}>
                  Swap in {c.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

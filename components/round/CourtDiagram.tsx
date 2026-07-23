import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Renders a court shape sideways (net running vertically down the
 * middle, like a real court viewed from the side you'd stand on) — left
 * half is one team, right half the other, each with 1 or 2 player slots
 * stacked top/bottom for their actual left/right service-box position,
 * with the kitchen (non-volley zone) shown as its own strip next to the
 * net on each side. */
export function CourtDiagram({
  teamASlots,
  teamBSlots,
  teamAHighlighted,
  teamBHighlighted,
}: {
  teamASlots: ReactNode[];
  teamBSlots: ReactNode[];
  teamAHighlighted?: boolean;
  teamBHighlighted?: boolean;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border-2 border-foreground/15">
      <CourtHalf slots={teamASlots} highlighted={teamAHighlighted} />
      <KitchenStrip highlighted={teamAHighlighted} />
      <div className="w-1 shrink-0 bg-foreground/15" />
      <KitchenStrip highlighted={teamBHighlighted} />
      <CourtHalf slots={teamBSlots} highlighted={teamBHighlighted} />
    </div>
  );
}

function KitchenStrip({ highlighted }: { highlighted?: boolean }) {
  return (
    <div
      className={cn(
        "w-7 shrink-0 border-x border-dashed border-foreground/15 bg-foreground/3",
        highlighted && "bg-primary/10",
      )}
    />
  );
}

function CourtHalf({ slots, highlighted }: { slots: ReactNode[]; highlighted?: boolean }) {
  if (slots.length <= 1) {
    return (
      <div className={cn("flex flex-1 items-center justify-center px-3 py-6", highlighted && "bg-primary/10")}>
        {slots[0] ?? <span className="text-sm text-muted-foreground">—</span>}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-1 flex-col divide-y divide-foreground/10", highlighted && "bg-primary/10")}>
      <div className="flex flex-1 items-center justify-center px-3 py-3">{slots[0]}</div>
      <div className="flex flex-1 items-center justify-center px-3 py-3">{slots[1]}</div>
    </div>
  );
}

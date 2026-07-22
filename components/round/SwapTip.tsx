"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function SwapTip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-3 mt-2 text-xs text-muted-foreground">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        How do swaps work?
      </button>
      {open && (
        <p className="mt-1 pl-4">
          Before a court&apos;s match starts, tap the swap icon next to a player to switch them with anyone else
          who&apos;s currently free.
        </p>
      )}
    </div>
  );
}

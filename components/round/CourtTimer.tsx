"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { formatClock } from "@/lib/utils/duration";

/** Live-ticking elapsed time since a match started. Freezes at the final
 * duration once `decidedAt` is set (a decided match's clock stops). */
export function CourtTimer({ startedAt, decidedAt }: { startedAt: number; decidedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (decidedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [decidedAt]);

  const elapsedMs = (decidedAt ?? now) - startedAt;

  return (
    <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
      <Timer className="size-3" />
      {formatClock(elapsedMs)}
    </span>
  );
}

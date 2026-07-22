"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourtRow } from "./CourtRow";
import { useCourts, useSessionState } from "@/lib/hooks/useSessionState";
import { useAddCourt } from "@/lib/hooks/useCourtMutations";
import { anyMatchStarted, hasSessionStarted } from "@/lib/mutations/settings";

export function CourtList() {
  const courts = useCourts();
  const addCourt = useAddCourt();
  const { state } = useSessionState();
  const locked = hasSessionStarted(state);

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">Courts</h2>
        {locked ? (
          <span className="text-xs text-muted-foreground">
            {anyMatchStarted(state) ? "Locked once the session starts" : "Locked — use Stop session on Round to edit"}
          </span>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addCourt.mutate()}>
            <Plus className="size-3.5" />
            Add court
          </Button>
        )}
      </div>
      <div className="border-t">
        {courts.map((court) => (
          <CourtRow key={court.id} court={court} canRemove={!locked && courts.length > 1} />
        ))}
      </div>
    </div>
  );
}

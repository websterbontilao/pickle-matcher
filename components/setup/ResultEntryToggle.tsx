"use client";

import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/hooks/useSessionState";
import { useSetResultEntry } from "@/lib/hooks/useSettingsMutations";

const OPTIONS = [
  { value: "winner", label: "Pick the winner" },
  { value: "score", label: "Enter the score" },
] as const;

/** How match results get recorded. Unlike format, never locked — switching
 * only affects results recorded from then on. */
export function ResultEntryToggle() {
  const settings = useSettings();
  const setResultEntry = useSetResultEntry();

  return (
    <div className="px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Winner decided by</h2>
        <span className="text-xs text-muted-foreground">
          {settings.resultEntry === "score" ? "Higher score wins" : "Tap the winning team"}
        </span>
      </div>
      <div className="flex rounded-md border p-0.5">
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setResultEntry.mutate({ resultEntry: value })}
            className={cn(
              "flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors",
              settings.resultEntry === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

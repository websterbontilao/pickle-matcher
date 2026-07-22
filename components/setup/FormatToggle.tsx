"use client";

import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/hooks/useSessionState";
import { useSetFormat } from "@/lib/hooks/useSettingsMutations";
import { anyMatchStarted, hasSessionStarted } from "@/lib/mutations/settings";
import { useSessionState } from "@/lib/hooks/useSessionState";

export function FormatToggle() {
  const settings = useSettings();
  const { state } = useSessionState();
  const locked = hasSessionStarted(state);
  const setFormat = useSetFormat();

  return (
    <div className="px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Format</h2>
        {locked && (
          <span className="text-xs text-muted-foreground">
            {anyMatchStarted(state) ? "Locked once the session starts" : "Locked — use Stop session on Round to edit"}
          </span>
        )}
      </div>
      <div className="flex rounded-md border p-0.5">
        {(["singles", "doubles"] as const).map((format) => (
          <button
            key={format}
            type="button"
            disabled={locked}
            onClick={() => setFormat.mutate({ format })}
            className={cn(
              "flex-1 rounded-sm py-1.5 text-sm font-medium capitalize transition-colors",
              settings.format === format ? "bg-foreground text-background" : "text-muted-foreground",
              locked && settings.format !== format && "opacity-40",
              !locked && settings.format !== format && "hover:bg-muted",
            )}
          >
            {format}
          </button>
        ))}
      </div>
    </div>
  );
}

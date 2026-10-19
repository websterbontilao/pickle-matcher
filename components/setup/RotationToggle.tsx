"use client";

import { cn } from "@/lib/utils";
import { useSessionState, useSettings } from "@/lib/hooks/useSessionState";
import { anyMatchStarted, hasSessionStarted } from "@/lib/mutations/settings";
import { useSetRotation, useSetStackNewcomers } from "@/lib/hooks/useSettingsMutations";

const ROTATIONS = [
  { value: "casual", label: "Casual rotation", hint: "Evens out games, rests and skill" },
  { value: "stack", label: "Paddle stack", hint: "4 off, 4 on · winners vs winners" },
] as const;

const NEWCOMER_OPTIONS = [
  { value: "back", label: "Join the stack" },
  { value: "next", label: "Play next match" },
] as const;

function Segmented<T extends string>({
  options,
  value,
  onChange,
  locked = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  locked?: boolean;
}) {
  return (
    <div className="flex rounded-md border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={locked}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors",
            value === option.value ? "bg-foreground text-background" : "text-muted-foreground",
            locked && value !== option.value && "opacity-40",
            !locked && value !== option.value && "hover:bg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** How players are picked for each match. Locked once the session starts,
 * like format; the newcomer choice stays changeable. */
export function RotationToggle() {
  const settings = useSettings();
  const { state } = useSessionState();
  const locked = hasSessionStarted(state);
  const setRotation = useSetRotation();
  const setStackNewcomers = useSetStackNewcomers();
  const rotation = settings.rotation ?? "casual";

  return (
    <div className="space-y-2 px-3 py-2">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Rotation</h2>
          <span className="text-xs text-muted-foreground">
            {!locked
              ? ROTATIONS.find((r) => r.value === rotation)!.hint
              : anyMatchStarted(state)
                ? "Locked once the session starts"
                : "Locked — use Stop session on Round to edit"}
          </span>
        </div>
        <Segmented
          options={ROTATIONS}
          value={rotation}
          locked={locked}
          onChange={(value) => setRotation.mutate({ rotation: value })}
        />
      </div>
      {rotation === "stack" && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-medium">New players</h3>
            <span className="text-xs text-muted-foreground">When someone is added mid-session</span>
          </div>
          <Segmented
            options={NEWCOMER_OPTIONS}
            value={settings.stackNewcomers ?? "back"}
            onChange={(value) => setStackNewcomers.mutate({ stackNewcomers: value })}
          />
        </div>
      )}
    </div>
  );
}

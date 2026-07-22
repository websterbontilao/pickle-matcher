import { z } from "zod";
import { PlayerSchema } from "./player";
import { CourtSchema } from "./court";
import { MatchSchema } from "./match";
import { SessionSettingsSchema } from "./settings";
import { SitOutSchema } from "./sitOut";

export const SessionStateSchema = z.object({
  players: z.array(PlayerSchema),
  courts: z.array(CourtSchema),
  matches: z.array(MatchSchema),
  settings: SessionSettingsSchema,
  sitOuts: z.array(SitOutSchema),
  /** Monotonic counter, incremented every time any court generates a match.
   * Stamped onto each new Match's roundNumber and each new SitOut's round —
   * courts advance independently, so this is just a shared ordering clock,
   * not a synchronized round boundary. */
  matchSequence: z.number().int().nonnegative().default(0),
  /** Explicit one-time gate, set via "Start session". Locks format/court
   * configuration and is required before courts will auto-fill with
   * matches — without this, adding players/courts during Setup would
   * otherwise silently "start" the session as a side effect. */
  sessionStarted: z.boolean().default(false),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const EMPTY_SESSION_STATE: SessionState = {
  players: [],
  courts: [{ id: "court-1", name: "Court 1" }],
  matches: [],
  settings: { format: "doubles", courtCount: 1 },
  sitOuts: [],
  matchSequence: 0,
  sessionStarted: false,
};

import { z } from "zod";

/**
 * Sit-out log entry. Only produced by the singles odd-player-count edge case.
 * Kept as an append-only log on SessionState (not a field on Player) since it
 * is the one piece of scheduling history not derivable from `matches` — a
 * sitting-out player has no Match record for that round.
 */
export const SitOutSchema = z.object({
  round: z.number().int().positive(),
  playerId: z.string(),
  reason: z.string(),
});

export type SitOut = z.infer<typeof SitOutSchema>;

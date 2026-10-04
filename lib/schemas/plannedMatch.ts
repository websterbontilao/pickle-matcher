import { z } from "zod";

/** A forecast match the organizer locked in by swapping players on the
 * Upcoming tab. Has no court — it's seated on whichever court opens next,
 * ahead of any calculated match (see `generateNextMatchForCourt`). */
export const PlannedMatchSchema = z.object({
  id: z.string(),
  teamA: z.array(z.string()).min(1).max(2),
  teamB: z.array(z.string()).min(1).max(2),
});

export type PlannedMatch = z.infer<typeof PlannedMatchSchema>;

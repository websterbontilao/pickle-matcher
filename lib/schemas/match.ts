import { z } from "zod";

export const MatchSchema = z.object({
  id: z.string(),
  /** Global sequence number assigned when this match was generated (not a
   * synchronized "round" across courts — each court advances independently,
   * this is just a monotonic ordering/display counter). */
  roundNumber: z.number().int().positive(),
  courtId: z.string(),
  teamA: z.array(z.string()).min(1).max(2),
  teamB: z.array(z.string()).min(1).max(2),
  winner: z.union([z.literal("A"), z.literal("B"), z.null()]),
  /** Set once the court's "Start match" action is tapped; null while the
   * match is still in the pre-start swap window. Powers the live timer. */
  startedAt: z.number().nullable().default(null),
  /** Last-updated time — set when the match is generated, and again when a
   * result is recorded/changed. Used with startedAt to compute a decided
   * match's final duration. */
  timestamp: z.number(),
});

export type Match = z.infer<typeof MatchSchema>;

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
  /** Points per side, when the result was recorded by score. Absent when
   * the winner was simply picked (or for matches from before scores). */
  score: z.object({ a: z.number().int().nonnegative(), b: z.number().int().nonnegative() }).optional(),
});

export type Match = z.infer<typeof MatchSchema>;

import { z } from "zod";

export const SessionSettingsSchema = z.object({
  format: z.union([z.literal("singles"), z.literal("doubles")]),
  courtCount: z.number().int().positive(),
  /** How a match's result is recorded: tap the winning team, or enter
   * both teams' scores (higher score wins). Changeable any time — it only
   * affects results recorded from then on. */
  resultEntry: z.union([z.literal("winner"), z.literal("score")]).default("winner"),
});

export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

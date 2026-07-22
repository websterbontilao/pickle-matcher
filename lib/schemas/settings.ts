import { z } from "zod";

export const SessionSettingsSchema = z.object({
  format: z.union([z.literal("singles"), z.literal("doubles")]),
  courtCount: z.number().int().positive(),
});

export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

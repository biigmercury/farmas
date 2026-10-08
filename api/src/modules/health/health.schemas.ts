import { z } from "zod";

export const assessSchema = z.object({
  symptoms: z
    .string()
    .trim()
    .min(3, "Describe the symptoms make I fit assess am.")
    .max(3000, "Symptoms too long."),
  numberAffected: z.coerce
    .number({ message: "numberAffected must be a number." })
    .int()
    .min(1)
    .max(1_000_000)
    .default(1),
  mortality: z.coerce
    .number({ message: "mortality must be a number." })
    .int()
    .min(0)
    .max(1_000_000)
    .default(0),
  species: z.string().trim().max(30).optional(),
  total: z.coerce.number().int().min(1).max(1_000_000).optional(),
  onset: z.enum(["today", "few-days", "week-plus"]).optional(),
  drinking: z.enum(["normal", "less"]).optional(),
  vaccinated: z.enum(["yes", "no", "unsure"]).optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AssessInput = z.infer<typeof assessSchema>;

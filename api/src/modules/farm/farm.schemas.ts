import { z } from "zod";

export const createFarmSchema = z.object({
  name: z.string().trim().min(2, "Farm name too short.").max(80, "Farm name too long."),
  location: z.string().trim().max(120).optional(),
  farmType: z.string().trim().max(60).optional(),
  size: z.string().trim().max(60).optional(),
});

export const farmParamsSchema = z.object({
  farmId: z.string().trim().min(1, "farmId is required."),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const alertActionSchema = z.object({
  status: z.enum(["ACTIVE", "RESOLVED"]),
});

export const taskActionSchema = z.object({
  status: z.enum(["PENDING", "DONE"]),
});

export const addLivestockSchema = z.object({
  type: z.enum(["POULTRY", "GOAT", "SHEEP", "CATTLE", "PIG", "RABBIT", "FISH"]),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1.").max(1_000_000),
  name: z.string().trim().max(80).optional(),
  breed: z.string().trim().max(60).optional(),
});

export type AddLivestockInput = z.infer<typeof addLivestockSchema>;
export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

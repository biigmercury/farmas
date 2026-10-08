import { z } from "zod";

export const aiMessageSchema = z.object({
  text: z.string().trim().min(1, "Enter a message.").max(2000, "Message too long."),
  /** AGENT records things on the farm (with confirmation). CHAT only answers questions. */
  mode: z.enum(["AGENT", "CHAT"]).default("AGENT"),
  /** Continue an earlier conversation. Omit to start a new one. */
  sessionId: z.string().min(1).max(40).optional(),
  language: z.enum(["auto", "english", "pidgin"]).default("auto"),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  locationDenied: z.boolean().optional(),
});

export const confirmActionSchema = z.object({
  confirmed: z.boolean({ message: "confirmed must be true or false." }),
});

export const sessionParamsSchema = z.object({
  farmId: z.string().min(1).max(40),
  sessionId: z.string().min(1).max(40),
});

export type AiMessageInput = z.infer<typeof aiMessageSchema>;
export type ConfirmActionInput = z.infer<typeof confirmActionSchema>;

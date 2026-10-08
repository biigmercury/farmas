import { z } from "zod";

export const aiMessageSchema = z.object({
  text: z.string().trim().min(1, "Enter a message.").max(2000, "Message too long."),
});

export const confirmActionSchema = z.object({
  confirmed: z.boolean({ message: "confirmed must be true or false." }),
});

export type AiMessageInput = z.infer<typeof aiMessageSchema>;
export type ConfirmActionInput = z.infer<typeof confirmActionSchema>;

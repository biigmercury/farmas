import { z } from "zod";
import { normalizePhone } from "../../utils/phone";

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Enter a valid email address.")
  .max(160, "Email too long.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Enter a valid email address.");

const phoneField = z
  .string()
  .trim()
  .min(7, "Enter a valid Nigerian phone number.")
  .max(20, "Phone number too long.")
  .refine((value) => normalizePhone(value) !== null, "Enter a valid Nigerian phone number.")
  .transform((value) => normalizePhone(value) as string);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email: emailField,
  phone: phoneField,
  password: z
    .string()
    .min(8, "Password suppose reach at least 8 characters.")
    .max(128, "Password too long."),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or phone number."),
  password: z.string().min(1, "Enter your password."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

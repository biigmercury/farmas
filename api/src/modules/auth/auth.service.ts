import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { signToken } from "../../middlewares/auth.middleware";
import { ApiError } from "../../utils/apiError";
import { normalizePhone } from "../../utils/phone";
import type { LoginInput, RegisterInput } from "./auth.schemas";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function register(input: RegisterInput): Promise<{ user: PublicUser; token: string }> {
  const phone = normalizePhone(input.phone) ?? input.phone;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { phone }] },
    select: { id: true, email: true, phone: true },
  });

  if (existing) {
    throw ApiError.conflict(
      existing.email === input.email
        ? "This email don already dey use."
        : "This phone number don already dey use."
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, phone, passwordHash },
  });

  return { user: toPublicUser(user), token: signToken(user.id) };
}

export async function login(input: LoginInput): Promise<{ user: PublicUser; token: string }> {
  const normalizedPhone = normalizePhone(input.identifier);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.identifier.toLowerCase() },
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    },
  });

  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw ApiError.unauthorized("Email/phone or password no correct.");
  }

  return { user: toPublicUser(user), token: signToken(user.id) };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("Account no dey find.");
  return toPublicUser(user);
}

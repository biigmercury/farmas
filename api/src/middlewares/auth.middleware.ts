import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

export interface JwtPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== "string") {
      throw ApiError.unauthorized("Invalid session token.");
    }
    return payload.sub;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized("Your session don expire. Abeg log in again.");
  }
}

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token. Log in first.");
  }

  const userId = verifyToken(header.slice(7));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, phone: true, role: true },
  });

  if (!user) {
    throw ApiError.unauthorized("This account no exist again.");
  }

  req.user = { id: user.id, name: user.name, phone: user.phone, role: user.role };
  next();
});

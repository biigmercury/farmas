import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/** Same error shape as every other API error, so the app can show the message as is. */
function limiter(opts: { windowMs: number; limit: number; message: string; perUser?: boolean; skipSuccessfulRequests?: boolean }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccessfulRequests ?? false,
    // Per logged-in farmer when we know who it is, otherwise per network address.
    keyGenerator: (req: Request) => (opts.perUser && req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? "")),
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { message: opts.message, code: "RATE_LIMITED" } });
    },
  });
}

/** Wrong-password guessing: 10 failed logins per 15 minutes per address. Successful logins do not count. */
export const loginLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

/** Mass sign-ups: 10 new accounts per hour per address. */
export const registerLimiter = limiter({
  windowMs: 60 * 60_000,
  limit: 10,
  message: "Too many sign-ups from this connection. Please try again later.",
});

/** Every chat message costs money (AI calls), so each farmer gets a sensible ceiling. */
export const aiLimiter = limiter({
  windowMs: 60_000,
  limit: 30,
  perUser: true,
  message: "You are sending messages very fast. Please wait a moment and try again.",
});

/** Health checks can include photos and are the most expensive call. */
export const healthLimiter = limiter({
  windowMs: 60_000,
  limit: 10,
  perUser: true,
  message: "Too many health checks in a short time. Please wait a minute and try again.",
});

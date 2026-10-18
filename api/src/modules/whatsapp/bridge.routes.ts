import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/apiError";
import { asyncHandler } from "../../utils/asyncHandler";

// Used only by the WhatsApp bridge (a small program run by the team). It collects the messages the app wants sent,
// such as reminders, and reports back when each was sent. Protected by a shared secret, not by a farmer login.

export const bridgeRoutes = Router();

const requireBridgeKey: RequestHandler = (req, _res, next) => {
  const expected = env.WHATSAPP_BRIDGE_KEY;
  if (expected.length < 16) return next(ApiError.serviceUnavailable("The WhatsApp bridge is not switched on."));
  const given = String(req.header("x-bridge-key") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return next(new ApiError(401, "Wrong bridge key."));
  next();
};

bridgeRoutes.use(requireBridgeKey);

bridgeRoutes.get(
  "/outbox",
  asyncHandler(async (_req, res) => {
    const messages = await prisma.outboundMessage.findMany({
      where: { sentAt: null },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { id: true, phone: true, text: true },
    });
    res.json({ success: true, data: { messages } });
  })
);

bridgeRoutes.post(
  "/outbox/:id/sent",
  asyncHandler(async (req, res) => {
    await prisma.outboundMessage.updateMany({ where: { id: req.params.id, sentAt: null }, data: { sentAt: new Date() } });
    res.json({ success: true, data: { ok: true } });
  })
);

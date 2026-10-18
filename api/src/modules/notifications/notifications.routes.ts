import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate.middleware";
import { ApiError } from "../../utils/apiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { listNotifications, markAllRead, markRead } from "./reminders.service";
import { publicKey, pushEnabled, removeSubscription, saveSubscription } from "./push.service";

/** Mounted under /api/farms/:farmId, so the login and farm-ownership checks already ran. */
export const notificationRoutes = Router({ mergeParams: true });

notificationRoutes.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listNotifications(req.user!.id, req.params.farmId) });
  })
);

notificationRoutes.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    await markAllRead(req.user!.id, req.params.farmId);
    res.json({ success: true, data: { ok: true } });
  })
);

notificationRoutes.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    await markRead(req.user!.id, req.params.farmId, req.params.id);
    res.json({ success: true, data: { ok: true } });
  })
);

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }),
});

/** Tells the app whether phone push is available, and the public key the browser needs to subscribe. */
notificationRoutes.get(
  "/push/key",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { enabled: pushEnabled(), publicKey: publicKey() } });
  })
);

notificationRoutes.post(
  "/push/subscribe",
  validate(subscribeSchema),
  asyncHandler(async (req, res) => {
    if (!pushEnabled()) throw ApiError.serviceUnavailable("Phone notifications are not switched on for this server yet.");
    await saveSubscription(req.user!.id, req.body);
    res.status(201).json({ success: true, data: { ok: true } });
  })
);

notificationRoutes.post(
  "/push/unsubscribe",
  validate(z.object({ endpoint: z.string().url().max(1000) })),
  asyncHandler(async (req, res) => {
    await removeSubscription(req.user!.id, req.body.endpoint);
    res.json({ success: true, data: { ok: true } });
  })
);

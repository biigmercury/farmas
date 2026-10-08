import crypto from "node:crypto";
import { Router } from "express";
import type { Request } from "express";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { handleWebhook } from "./whatsapp.service";

export const whatsappRoutes = Router();

/**
 * Is this call really from WhatsApp? Meta signs the request body with our app secret (HMAC-SHA256) and puts the
 * result in X-Hub-Signature-256. Without this check anyone could post a fake message "from" a farmer's phone and
 * get records written to that farmer's farm.
 *
 * With no secret configured, unsigned calls are accepted only in local development, never in production.
 */
export function isSignatureValid(req: Request): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret) return env.NODE_ENV !== "production";

  const header = req.get("x-hub-signature-256") ?? "";
  if (!header.startsWith("sha256=") || !req.rawBody) return false;

  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice("sha256=".length), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

whatsappRoutes.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info("WhatsApp webhook verified");
    res.status(200).send(typeof challenge === "string" ? challenge : "");
    return;
  }

  logger.warn({ mode }, "WhatsApp webhook verification failed");
  res.sendStatus(403);
});

whatsappRoutes.post("/whatsapp", (req, res) => {
  if (!isSignatureValid(req)) {
    logger.warn({ ip: req.ip }, "WhatsApp webhook rejected: missing or wrong signature");
    res.sendStatus(403);
    return;
  }
  res.sendStatus(200);
  void handleWebhook(req.body).catch((err) => {
    logger.error({ err }, "WhatsApp webhook processing failed");
  });
});

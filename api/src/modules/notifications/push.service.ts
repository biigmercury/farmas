import webpush from "web-push";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";

// Phone push notifications (Web Push). The farmer taps "Turn on notifications" once; after that a reminder can pop up
// on the phone even when the app is closed. Needs the VAPID keys in the environment. Without them the app's bell still works.

let ready = false;
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    ready = true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Push notifications are off: bad VAPID keys");
  }
}

export const pushEnabled = (): boolean => ready;
export const publicKey = (): string => (ready ? env.VAPID_PUBLIC_KEY : "");

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(userId: string, sub: BrowserSubscription): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

/** Send a notification to every phone and browser this farmer turned notifications on for. */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!ready) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12 }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404 / 410 mean the phone no longer wants these (app removed, permission revoked): forget it.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        } else {
          logger.warn({ status, userId }, "Push notification failed");
        }
      }
    })
  );
  return sent;
}

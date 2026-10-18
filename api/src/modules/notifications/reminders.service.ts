import type { TaskCategory } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";
import { lagosDateTime } from "../../utils/time";
import { sendPush } from "./push.service";

// A reminder is a Task with a date and time. When that time comes, the farmer gets it three ways: in the app's bell,
// as a phone push notification, and as a WhatsApp message (collected by the WhatsApp bridge).

const HOUR_MS = 60 * 60 * 1000;
/** Only reminders that fell due recently are sent. Old, forgotten ones are left alone instead of arriving all at once. */
const SEND_WINDOW_MS = 6 * HOUR_MS;
const CHECK_EVERY_MS = 60_000;

export interface NewReminder {
  title: string;
  dueAt: Date;
  kind?: "VACCINATION" | "GENERAL";
  note?: string;
}

export async function createReminder(farmId: string, input: NewReminder) {
  const category: TaskCategory = input.kind === "VACCINATION" ? "VACCINATION" : "GENERAL";
  return prisma.task.create({
    data: { farmId, title: input.title.slice(0, 120), description: input.note?.slice(0, 300), dueDate: input.dueAt, category },
  });
}

/** Tell the farmer that one reminder is due. Returns true if this call sent it (false if it was already sent). */
async function sendReminder(task: { id: string; farmId: string; title: string; dueDate: Date }): Promise<boolean> {
  // Claim it first: if two checks overlap, only one of them gets to send.
  const claimed = await prisma.task.updateMany({
    where: { id: task.id, notifiedAt: null },
    data: { notifiedAt: new Date() },
  });
  if (claimed.count !== 1) return false;

  const farm = await prisma.farm.findUnique({
    where: { id: task.farmId },
    select: { ownerId: true, name: true, owner: { select: { phone: true } } },
  });
  if (!farm) return true;

  const when = lagosDateTime(task.dueDate);
  const body = `${task.title} (${when})`;

  await prisma.notification.create({
    data: { farmId: task.farmId, userId: farm.ownerId, taskId: task.id, title: "Reminder", body },
  });
  await sendPush(farm.ownerId, { title: "FarmAs reminder", body, url: "/app/tasks" });
  if (farm.owner.phone) {
    await prisma.outboundMessage.create({
      data: { phone: farm.owner.phone, text: `FarmAs reminder: ${task.title}\n${when}` },
    });
  }
  return true;
}

/** Send every reminder that has just come due. Called once a minute. */
export async function runDueReminders(now = new Date()): Promise<number> {
  const due = await prisma.task.findMany({
    where: {
      status: "PENDING",
      notifiedAt: null,
      dueDate: { lte: now, gte: new Date(now.getTime() - SEND_WINDOW_MS) },
    },
    select: { id: true, farmId: true, title: true, dueDate: true },
    take: 100,
  });
  let sent = 0;
  for (const task of due) {
    try {
      if (await sendReminder(task)) sent += 1;
    } catch (err) {
      logger.error({ err, taskId: task.id }, "Failed to send a reminder");
    }
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;

/** Start the once-a-minute check. The service stays awake because the keep-alive pings call it every few minutes. */
export function startReminderScheduler(): void {
  if (timer) return;
  const tick = () => {
    runDueReminders().catch((err) => logger.error({ err }, "Reminder check failed"));
  };
  timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref();
  setTimeout(tick, 5_000).unref();
  logger.info("Reminder scheduler started");
}

// ------------------------------------------------------------------------------------ the bell

export async function listNotifications(userId: string, farmId: string) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, farmId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, title: true, body: true, readAt: true, createdAt: true, taskId: true },
    }),
    prisma.notification.count({ where: { userId, farmId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(userId: string, farmId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id, userId, farmId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string, farmId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, farmId, readAt: null }, data: { readAt: new Date() } });
}

import axios from "axios";
import { env } from "../../config/env";
import { mlClient, type UploadLike } from "../../config/mlClient";
import { prisma } from "../../config/prisma";
import { isAffirmative, isNegative, truncate } from "../../utils/format";
import { logger } from "../../utils/logger";
import { normalizePhone } from "../../utils/phone";
import { confirmAction, getPendingAction, processInput } from "../ai/nlu.service";

interface WaTextMessage {
  id?: string;
  from: string;
  type: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string };
}

const graphBase = () => `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}`;
const graphAuth = () => ({ Authorization: `Bearer ${env.WHATSAPP_TOKEN}` });

export function extractMessages(body: unknown): WaTextMessage[] {
  const root = body as { entry?: unknown };
  if (!Array.isArray(root?.entry)) return [];

  const messages: WaTextMessage[] = [];
  for (const entry of root.entry as Array<{ changes?: unknown }>) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes as Array<{ value?: { messages?: unknown } }>) {
      const value = change?.value;
      if (!value || !Array.isArray(value.messages)) continue;
      for (const message of value.messages as WaTextMessage[]) {
        if (message && typeof message.from === "string" && typeof message.type === "string") {
          messages.push(message);
        }
      }
    }
  }
  return messages;
}

export async function sendText(to: string, text: string): Promise<boolean> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn({ to, text: truncate(text, 120) }, "WhatsApp reply skipped - credentials missing");
    return false;
  }

  const recipient = to.replace(/\D/g, "");
  const res = await axios.post(
    `${graphBase()}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: recipient,
      type: "text",
      text: { body: truncate(text, 4096) },
    },
    {
      headers: { ...graphAuth(), "Content-Type": "application/json" },
      timeout: 20_000,
    }
  );
  logger.debug({ to: recipient, status: res.status }, "WhatsApp reply sent");
  return true;
}

async function downloadWhatsAppMedia(mediaId: string): Promise<UploadLike> {
  const meta = await axios.get(`${graphBase()}/${mediaId}`, {
    headers: graphAuth(),
    timeout: 15_000,
  });

  const url: string | undefined = meta.data?.url;
  if (!url) throw new Error("WhatsApp media URL missing");

  const file = await axios.get<ArrayBuffer>(url, {
    headers: graphAuth(),
    responseType: "arraybuffer",
    timeout: 30_000,
  });

  const mimetype: string = meta.data?.mime_type ?? "audio/ogg";
  const extension = mimetype.includes("mp4")
    ? "mp4"
    : mimetype.includes("mpeg") || mimetype.includes("mp3")
      ? "mp3"
      : "ogg";

  return {
    buffer: Buffer.from(file.data),
    mimetype,
    originalname: `voice-note.${extension}`,
  };
}

async function handleMessage(message: WaTextMessage): Promise<void> {
  const normalized = normalizePhone(message.from);
  if (!normalized) {
    logger.warn({ from: message.from }, "Could not normalize WhatsApp sender");
    return;
  }

  let text = "";

  if (message.type === "text") {
    text = message.text?.body?.trim() ?? "";
  } else if (message.type === "audio" && message.audio?.id) {
    try {
      const audio = await downloadWhatsAppMedia(message.audio.id);
      text = await mlClient.transcribe(audio);
    } catch (err) {
      logger.error({ err, mediaId: message.audio.id }, "Voice note transcription failed");
      await sendText(message.from, "I no fit hear that voice note. Abeg type the message instead.");
      return;
    }
  } else {
    await sendText(
      message.from,
      "Right now I sabi text and voice note only. Abeg type your message."
    );
    return;
  }

  text = text.trim();
  if (!text) return;

  const user = await prisma.user.findFirst({ where: { phone: normalized } });
  if (!user) {
    await sendText(
      message.from,
      "You never register for FarmAs. Download the app, create your account, then we go fit talk here."
    );
    return;
  }

  const farm = await prisma.farm.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!farm) {
    await sendText(
      message.from,
      "I no see any farm wey dey your account yet. Open the app create your farm first."
    );
    return;
  }

  const pending = await getPendingAction(farm.id);
  if (pending) {
    if (isAffirmative(text)) {
      const reply = await confirmAction(pending.id, farm.id, true);
      await sendText(message.from, reply);
      return;
    }
    if (isNegative(text)) {
      const reply = await confirmAction(pending.id, farm.id, false);
      await sendText(message.from, reply);
      return;
    }
  }

  const reply = await processInput({
    farmId: farm.id,
    userId: user.id,
    text,
    channel: "WHATSAPP",
  });
  await sendText(message.from, reply);
}

export async function handleWebhook(body: unknown): Promise<void> {
  const messages = extractMessages(body);
  for (const message of messages) {
    try {
      await handleMessage(message);
    } catch (err) {
      logger.error(
        { err, from: message.from, type: message.type },
        "WhatsApp message handling failed"
      );
      await sendText(
        message.from,
        "Something wey no suppose break don break. Abeg try again small small time."
      ).catch(() => undefined);
    }
  }
}

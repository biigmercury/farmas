import { Router } from "express";
import { mlClient, type ChatTurn } from "../../config/mlClient";
import { prisma } from "../../config/prisma";
import { audioUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { ApiError } from "../../utils/apiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { aiMessageSchema, confirmActionSchema, sessionParamsSchema, speakSchema } from "./ai.schemas";
import { processChat } from "./chat.service";
import { confirmAction, getPendingAction, getPendingView, processInputDetailed } from "./nlu.service";
import type { SpokenLanguage } from "../../config/mlClient";

export const aiRoutes = Router({ mergeParams: true });

/** How many earlier messages the AI gets as memory for a follow-up. */
const MEMORY_MESSAGES = 8;

async function loadSession(farmId: string, userId: string, sessionId: string) {
  const session = await prisma.chatSession.findFirst({ where: { id: sessionId, farmId, userId } });
  if (!session) throw ApiError.notFound("I could not find that conversation.");
  return session;
}

async function historyOf(sessionId: string): Promise<ChatTurn[]> {
  const rows = await prisma.aiConversation.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: MEMORY_MESSAGES,
    select: { message: true, response: true },
  });
  return rows
    .reverse()
    .flatMap<ChatTurn>((row) => [
      { role: "user", content: row.message },
      { role: "assistant", content: row.response },
    ]);
}

aiRoutes.post(
  "/messages",
  validate(aiMessageSchema),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const user = req.user!;
    const body = req.body as {
      text: string;
      mode: "AGENT" | "CHAT";
      sessionId?: string;
      language: "auto" | "english" | "pidgin";
      location?: { lat: number; lng: number };
      locationDenied?: boolean;
    };

    // Continue the farmer's conversation, or start a new one named after the first message.
    const session = body.sessionId
      ? await loadSession(farmId, user.id, body.sessionId)
      : await prisma.chatSession.create({
          data: { farmId, userId: user.id, mode: body.mode, title: body.text.slice(0, 60) },
        });
    const history = await historyOf(session.id);

    if (session.mode === "CHAT") {
      const result = await processChat({
        farmId,
        userId: user.id,
        text: body.text,
        sessionId: session.id,
        language: body.language,
        history,
        location: body.location,
        locationDenied: body.locationDenied,
      });
      await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
      res.json({
        success: true,
        data: {
          response: result.reply,
          replyLanguage: result.replyLang ?? "english",
          pending: null,
          sessionId: session.id,
          mode: session.mode,
          vets: result.vets ?? null,
          searchUrl: result.searchUrl ?? null,
          needsLocation: Boolean(result.needsLocation),
        },
      });
      return;
    }

    const { reply: response, replyLang } = await processInputDetailed({
      farmId,
      userId: user.id,
      text: body.text,
      channel: "APP",
      sessionId: session.id,
      language: body.language,
      history,
    });
    await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

    // If this message created a "save this?" proposal, hand it back so the app can show Yes / No buttons.
    const pending = await getPendingView(farmId, body.language === "auto" ? undefined : body.language);
    res.json({
      success: true,
      data: {
        response,
        replyLanguage: replyLang,
        sessionId: session.id,
        mode: session.mode,
        pending,
      },
    });
  })
);

aiRoutes.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const sessions = await prisma.chatSession.findMany({
      where: { farmId, userId: req.user!.id },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { id: true, title: true, mode: true, updatedAt: true, _count: { select: { messages: true } } },
    });
    res.json({
      success: true,
      data: {
        sessions: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          mode: s.mode,
          updatedAt: s.updatedAt,
          messageCount: s._count.messages,
        })),
      },
    });
  })
);

aiRoutes.get(
  "/sessions/:sessionId",
  validate(sessionParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const { farmId, sessionId } = req.params;
    const user = req.user!;
    const session = await loadSession(farmId, user.id, sessionId);
    const messages = await prisma.aiConversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, message: true, response: true, createdAt: true },
    });

    // A "save this?" question can only still be open on the conversation the farmer used last.
    let pending: { id: string; summary: string; intent: string } | null = null;
    if (session.mode === "AGENT") {
      const latest = await prisma.chatSession.findFirst({
        where: { farmId, userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      pending = latest?.id === session.id ? await getPendingView(farmId) : null;
    }

    res.json({
      success: true,
      data: {
        session: { id: session.id, title: session.title, mode: session.mode },
        messages,
        pending,
      },
    });
  })
);

aiRoutes.delete(
  "/sessions/:sessionId",
  validate(sessionParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const { farmId, sessionId } = req.params;
    await loadSession(farmId, req.user!.id, sessionId);
    await prisma.chatSession.delete({ where: { id: sessionId } });
    res.json({ success: true, data: { deleted: true } });
  })
);

/** Voice: the app records audio, we turn it into text, and the farmer checks it before sending. */
aiRoutes.post(
  "/transcribe",
  audioUpload.single("audio"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("Please record something first.");
    const wanted = String(req.body?.language ?? "");
    const language = (["yoruba", "igbo", "hausa", "fulani", "pidgin", "english"] as const).find((l) => l === wanted);
    const text = await mlClient.transcribe(
      {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname || "voice.webm",
      },
      language as SpokenLanguage | undefined
    );
    res.json({ success: true, data: { text } });
  })
);

/** Read a reply aloud, for farmers who cannot read or prefer to listen. */
aiRoutes.post(
  "/speak",
  validate(speakSchema),
  asyncHandler(async (req, res) => {
    const { text, language, format } = req.body as { text: string; language: SpokenLanguage; format: "mp3" | "opus" };
    const audio = await mlClient.speak(text, language, format);
    res.setHeader("Content-Type", format === "opus" ? "audio/ogg" : "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  })
);

aiRoutes.get(
  "/actions/pending",
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const action = await getPendingAction(farmId);

    res.json({
      success: true,
      data: {
        action: action
          ? {
              id: action.id,
              actionTaken: action.actionTaken,
              detectedIntent: action.detectedIntent,
              confidence: action.confidence,
              confirmationStatus: action.confirmationStatus,
              createdAt: action.createdAt,
            }
          : null,
      },
    });
  })
);

aiRoutes.post(
  "/actions/:actionId/confirm",
  validate(confirmActionSchema),
  asyncHandler(async (req, res) => {
    const { farmId, actionId } = req.params;
    const { confirmed } = req.body as { confirmed: boolean };

    const response = await confirmAction(actionId, farmId, confirmed);
    res.json({ success: true, data: { response } });
  })
);

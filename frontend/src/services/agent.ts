import { api, backendConfigured } from "@/lib/api";
import { getFarmId } from "@/lib/session";
import type { ChatLanguage, ChatMode, ChatReply, SessionSummary, StoredMessage, VetVM } from "@/lib/types";

// Chat with FarmAs AI. Contract: api/docs/API.md (AI Farm Companion).
//
// Two modes share one conversation list:
//   AGENT: understands "I sold 5 goats for 80k", asks "Should I save this?", then changes the farm records.
//   CHAT:  only answers questions (animal care, feeding, where the nearest vet is). Never changes records.
// If a configured server fails, the error is shown: we never hide an outage behind made-up answers.

type MessageResponse = {
  response: string;
  pending: { id: string; summary: string } | null;
  sessionId?: string;
  vets?: VetVM[] | null;
  searchUrl?: string | null;
  needsLocation?: boolean;
};

export type SendOptions = {
  mode: ChatMode;
  sessionId?: string;
  language: ChatLanguage;
  location?: { lat: number; lng: number };
  locationDenied?: boolean;
};

export async function sendToAgent(text: string, opts: SendOptions): Promise<ChatReply> {
  if (!backendConfigured) return demoReply(text, opts.mode);
  const r = await api<MessageResponse>(`/api/farms/${getFarmId()}/ai/messages`, {
    method: "POST",
    body: JSON.stringify({
      text,
      mode: opts.mode,
      language: opts.language,
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts.location ? { location: opts.location } : {}),
      ...(opts.locationDenied ? { locationDenied: true } : {}),
    }),
  });
  return {
    text: r.response,
    pending: r.pending,
    sessionId: r.sessionId,
    vets: r.vets,
    searchUrl: r.searchUrl,
    needsLocation: r.needsLocation,
  };
}

export async function confirmAction(actionId: string, confirmed: boolean): Promise<string> {
  if (!backendConfigured) {
    return confirmed
      ? "Confirmed. (Demo mode: nothing is stored until a server is connected.)"
      : "Okay, I did not save it.";
  }
  const r = await api<{ response: string }>(`/api/farms/${getFarmId()}/ai/actions/${actionId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmed }),
  });
  return r.response;
}

export async function listSessions(): Promise<SessionSummary[]> {
  if (!backendConfigured) return [];
  const r = await api<{ sessions: SessionSummary[] }>(`/api/farms/${getFarmId()}/ai/sessions`);
  return r.sessions;
}

export async function openSession(id: string): Promise<{
  mode: ChatMode;
  messages: StoredMessage[];
  pending: { id: string; summary: string } | null;
}> {
  const r = await api<{
    session: { mode: ChatMode };
    messages: { id: string; message: string; response: string }[];
    pending: { id: string; summary: string } | null;
  }>(`/api/farms/${getFarmId()}/ai/sessions/${id}`);
  return {
    mode: r.session.mode,
    messages: r.messages.flatMap<StoredMessage>((m) => [
      { id: `${m.id}-q`, who: "you", text: m.message },
      { id: `${m.id}-a`, who: "farmas", text: m.response },
    ]),
    pending: r.pending,
  };
}

export async function removeSession(id: string): Promise<void> {
  if (!backendConfigured) return;
  await api(`/api/farms/${getFarmId()}/ai/sessions/${id}`, { method: "DELETE" });
}

/** Turn a voice recording into text. The farmer checks it before sending. */
export async function transcribeAudio(blob: Blob): Promise<string> {
  if (!backendConfigured) throw new Error("Voice needs the server to be connected.");
  const type = blob.type || "audio/webm";
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const body = new FormData();
  body.append("audio", blob, `voice.${ext}`);
  const r = await api<{ text: string }>(
    `/api/farms/${getFarmId()}/ai/transcribe`,
    { method: "POST", body },
    { timeoutMs: 90_000 },
  );
  return r.text;
}

/** True when replies come from the built-in demo parser, not a server. */
export const isDemoAgent = !backendConfigured;

// ---------------------------------------------------------------------------------------------
// Demo parser (used only when no backend is configured)

const amountRe = /(?:₦|n)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|million)?/gi;

function toNaira(raw: string): number | null {
  let best: number | null = null;
  for (const m of raw.matchAll(amountRe)) {
    let n = Number(m[1].replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    if (unit === "k" || unit === "thousand") n *= 1_000;
    if (unit === "m" || unit === "million") n *= 1_000_000;
    if (unit || n >= 1000) best = n;
  }
  return best;
}

function demoReply(message: string, mode: ChatMode): ChatReply {
  if (mode === "CHAT") {
    return { text: "Demo mode: the chatbot needs the FarmAs server to answer questions.", pending: null };
  }
  const lower = message.toLowerCase();
  const amount = toNaira(message);
  const qty = lower.match(/(\d+)\s*(broilers?|birds?|chicks?|goats?|sheep|pigs?|rabbits?|cows?)/);
  const q = qty ? ` · ${qty[1]} ${qty[2]}` : "";

  if (/(sold|sell|sale)/.test(lower) && amount)
    return { text: "I understood this as a sale. Should I save it?", pending: { id: "demo", summary: `Sale${q} · ₦${amount.toLocaleString("en-NG")}` } };
  if (/(bought|buy|purchase|spent|spend)/.test(lower) && amount)
    return {
      text: "I understood this as a purchase. Should I save it?",
      pending: { id: "demo", summary: `${/feed/.test(lower) ? "Feed expense" : "Purchase"}${q} · ₦${amount.toLocaleString("en-NG")}` },
    };
  return { text: "I couldn't turn that into a farm record yet. Try: “I bought 100 broilers for 300k.”", pending: null };
}

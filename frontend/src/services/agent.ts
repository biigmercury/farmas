import { api, backendConfigured } from "@/lib/api";
import { getFarmId } from "@/lib/session";
import type { ChatReply } from "@/lib/types";

// Chat with FarmAs AI. Contract: api/docs/API.md (AI Farm Companion).
//
// Flow: send text -> the API understands it (the AI service) -> for "record this" messages it replies with a question and
// a pending action; the farmer taps Yes/No -> confirmAction saves (or drops) it. Questions are answered from
// the real stored records. If a configured server fails, the error is shown: we never hide an outage behind
// made-up answers.

type MessageResponse = { response: string; pending: { id: string; summary: string } | null };

export async function sendToAgent(text: string): Promise<ChatReply> {
  if (!backendConfigured) return demoReply(text);
  const r = await api<MessageResponse>(`/api/farms/${getFarmId()}/ai/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return { text: r.response, pending: r.pending };
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

function demoReply(message: string): ChatReply {
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

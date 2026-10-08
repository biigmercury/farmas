"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { VetCards } from "@/components/vets";
import { useRecorder } from "@/hooks/use-recorder";
import { ApiError } from "@/lib/api";
import { GeoError, getPosition } from "@/lib/geo";
import type { ChatLanguage, ChatMode, SessionSummary, VetVM } from "@/lib/types";
import {
  confirmAction,
  isDemoAgent,
  listSessions,
  openSession,
  removeSession,
  sendToAgent,
  transcribeAudio,
} from "@/services/agent";

type Msg = {
  id: string;
  who: "you" | "farmas";
  text: string;
  pending?: { id: string; summary: string };
  resolved?: boolean;
  vets?: VetVM[];
  searchUrl?: string;
};

const GREETING: Record<ChatMode, string> = {
  AGENT: "Hello! Tell me what happened on your farm today, and I will record it for you.",
  CHAT: "Hello! Ask me anything about your animals, feeding or farm. I can also find the nearest vet.",
};

const MODE_HELP: Record<ChatMode, string> = {
  AGENT: "Records sales, expenses, animals and health problems for you. It always asks before saving.",
  CHAT: "Answers questions about animal care, feeding and diseases, and finds the nearest vet. It never changes your records.",
};

const PROMPTS: Record<ChatMode, string[]> = {
  AGENT: ["I sold 10 birds for 75k", "3 goats died", "I bought 20 broilers for 60k", "How much did I spend this month?"],
  CHAT: ["Where is the nearest vet?", "My goat is coughing, what should I do?", "How much feed does a broiler need?", "What are signs of Newcastle disease?"],
};

const LANGS: { key: ChatLanguage; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "english", label: "English" },
  { key: "pidgin", label: "Pidgin" },
];

const LANG_KEY = "farmas.chatLanguage";

function readLanguage(): ChatLanguage {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "english" || v === "pidgin" ? v : "auto";
  } catch {
    return "auto";
  }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function AiChat() {
  const [mode, setMode] = useState<ChatMode>("AGENT");
  const [language, setLanguage] = useState<ChatLanguage>(() => (typeof window === "undefined" ? "auto" : readLanguage()));
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<Msg[]>([{ id: "hello", who: "farmas", text: GREETING.AGENT }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const rec = useRecorder();

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const push = (m: Omit<Msg, "id">) => setMsgs((p) => [...p, { ...m, id: `m${nextId.current++}` }]);
  const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  function chooseLanguage(l: ChatLanguage) {
    setLanguage(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // storage blocked: the choice just won't be remembered
    }
  }

  function newChat(nextMode: ChatMode = mode) {
    rec.cancel();
    setMode(nextMode);
    setSessionId(undefined);
    setMsgs([{ id: "hello", who: "farmas", text: GREETING[nextMode] }]);
    setInput("");
    setNotice("");
    setShowHistory(false);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setNotice("");
    // A new message cancels any older "save this?" question (the server does the same).
    setMsgs((p) => p.map((m) => (m.pending && !m.resolved ? { ...m, resolved: true } : m)));
    push({ who: "you", text: t });
    setBusy(true);
    try {
      let r = await sendToAgent(t, { mode, sessionId, language });
      let sid = r.sessionId ?? sessionId;
      setSessionId(sid);

      // Asking for the nearest vet: ask the phone for its location once, then send the same question again with it.
      if (r.needsLocation) {
        push({ who: "farmas", text: r.text });
        try {
          const location = await getPosition();
          r = await sendToAgent(t, { mode, sessionId: sid, language, location });
        } catch (e) {
          if (!(e instanceof GeoError)) throw e;
          r = await sendToAgent(t, { mode, sessionId: sid, language, locationDenied: true });
        }
        sid = r.sessionId ?? sid;
        setSessionId(sid);
      }

      push({
        who: "farmas",
        text: r.text,
        pending: r.pending ?? undefined,
        vets: r.vets ?? undefined,
        searchUrl: r.searchUrl ?? undefined,
      });
    } catch (e) {
      push({ who: "farmas", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(msg: Msg, ok: boolean) {
    if (!msg.pending || busy) return;
    setMsgs((p) => p.map((m) => (m.id === msg.id ? { ...m, resolved: true } : m)));
    push({ who: "you", text: ok ? "Yes, save it" : "No" });
    setBusy(true);
    try {
      push({ who: "farmas", text: await confirmAction(msg.pending.id, ok) });
    } catch (e) {
      push({ who: "farmas", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  // ---- voice: record, turn into text, let the farmer check it, then send
  async function toggleMic() {
    setNotice("");
    if (rec.state === "recording") {
      const blob = await rec.stop();
      if (!blob || blob.size < 1200) {
        setNotice("I did not hear anything. Hold the phone closer and try again.");
        return;
      }
      setTranscribing(true);
      try {
        const text = await transcribeAudio(blob);
        setInput((cur) => (cur ? `${cur} ${text}` : text));
        setNotice("Check the words, fix anything that is wrong, then tap Send.");
        document.getElementById("msg")?.focus();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "I could not turn that into text. Please try again.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    try {
      await rec.start();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "I could not start the microphone.");
    }
  }

  // ---- history
  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    setHistoryError("");
    try {
      setSessions(await listSessions());
    } catch (e) {
      setHistoryError(errorText(e));
    }
  }

  async function reopen(id: string) {
    setBusy(true);
    setHistoryError("");
    try {
      const s = await openSession(id);
      rec.cancel();
      setMode(s.mode);
      setSessionId(id);
      setMsgs([
        { id: "hello", who: "farmas", text: GREETING[s.mode] },
        ...s.messages.map<Msg>((m) => ({ id: m.id, who: m.who, text: m.text, resolved: true })),
      ]);
      if (s.pending) {
        setMsgs((p) => {
          const last = p[p.length - 1];
          return p.map((m) => (m === last ? { ...m, pending: s.pending ?? undefined, resolved: false } : m));
        });
      }
      setShowHistory(false);
    } catch (e) {
      setHistoryError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    try {
      await removeSession(id);
      setSessions((cur) => cur?.filter((s) => s.id !== id) ?? null);
      if (id === sessionId) newChat();
    } catch (e) {
      setHistoryError(errorText(e));
    }
  }

  const recording = rec.state === "recording";

  return (
    <div className="mx-auto flex h-[calc(100dvh-10.5rem)] w-full max-w-4xl flex-col lg:h-[calc(100dvh-4rem)]">
      <div className="mb-3 space-y-2 lg:space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="h-display text-2xl lg:text-5xl">FarmAs AI</h1>
            <p className="label mt-1 hidden opacity-70 lg:block">Your farm companion</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void toggleHistory()}
              aria-pressed={showHistory}
              className={`label min-h-11 rounded-full border border-forest px-4 ${showHistory ? "bg-forest text-lime" : "bg-white"}`}
            >
              History
            </button>
            <button type="button" onClick={() => newChat()} className="label min-h-11 rounded-full border border-forest bg-lime px-4">
              New chat
            </button>
          </div>
        </div>

        {isDemoAgent && (
          <p className="inline-block rounded-full bg-lime px-4 py-1.5 text-sm">
            Demo mode: no server connected, so nothing is saved.
          </p>
        )}

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Mode" className="flex rounded-full border border-forest bg-white p-1">
            {(["AGENT", "CHAT"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => m !== mode && newChat(m)}
                className={`label min-h-10 rounded-full px-4 ${mode === m ? "bg-forest text-lime" : ""}`}
              >
                {m === "AGENT" ? "Agent" : "Chatbot"}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2">
            <span className="label hidden sm:inline">Reply in</span>
            <span className="sr-only sm:hidden">Reply language</span>
            <select
              value={language}
              onChange={(e) => chooseLanguage(e.target.value as ChatLanguage)}
              className="label min-h-11 rounded-full border border-forest/40 bg-white px-4"
            >
              {LANGS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hidden text-sm text-forest/75 md:block">{MODE_HELP[mode]}</p>
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto rounded-2xl border border-forest/10 bg-white p-4" aria-label="Past conversations">
          <p className="label mb-3">Past conversations</p>
          {historyError && (
            <p role="alert" className="mb-3 text-sm font-bold text-critical">
              {historyError}
            </p>
          )}
          {sessions === null && !historyError && <p className="text-forest/70">Loading…</p>}
          {sessions?.length === 0 && <p className="text-forest/75">No conversations yet. Say hello to start one.</p>}
          <ul className="divide-y divide-forest/10">
            {sessions?.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <button type="button" onClick={() => void reopen(s.id)} className="min-h-14 min-w-0 flex-1 py-2 text-left">
                  <span className="block truncate font-bold">{s.title}</span>
                  <span className="mt-0.5 block text-sm text-forest/70">
                    {s.mode === "AGENT" ? "Agent" : "Chatbot"} · {when(s.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation: ${s.title}`}
                  onClick={() => void drop(s.id)}
                  className="label min-h-11 shrink-0 px-3 text-critical underline underline-offset-4"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 lg:max-w-[70%] ${
                  m.who === "you" ? "bg-forest text-lime" : "border border-forest/10 bg-white"
                }`}
              >
                <p className="whitespace-pre-line">{m.text}</p>
                {m.vets && m.vets.length > 0 && <VetCards vets={m.vets} searchUrl={m.searchUrl} />}
                {m.vets && m.vets.length === 0 && m.searchUrl && (
                  <a
                    href={m.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label mt-3 inline-flex min-h-11 items-center rounded-full border border-forest bg-lime px-4"
                  >
                    Search on Google Maps
                  </a>
                )}
                {m.pending && (
                  <div className="mt-3 rounded-xl bg-lime p-3">
                    <p className="font-mono text-sm">{m.pending.summary}</p>
                    {!m.resolved && (
                      <div className="mt-3 flex gap-2">
                        <Button variant="forest" className="!min-h-11 flex-1" disabled={busy} onClick={() => void resolve(m, true)}>
                          Yes, save
                        </Button>
                        <Button variant="outline" className="!min-h-11 flex-1" disabled={busy} onClick={() => void resolve(m, false)}>
                          No
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="label opacity-60">FarmAs AI is thinking…</p>}
          <div ref={end} />
        </div>
      )}

      {!showHistory && (
        <>
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2">
            {PROMPTS[mode].map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="label min-h-11 shrink-0 rounded-full border border-forest/30 bg-white px-4"
              >
                {q}
              </button>
            ))}
          </div>

          {(notice || transcribing) && (
            <p role="status" className="mb-2 rounded-xl bg-lime px-4 py-2 text-sm">
              {transcribing ? "Turning your voice into words…" : notice}
            </p>
          )}

          {recording ? (
            <div className="flex items-center gap-2 rounded-full border border-critical bg-white p-2 pl-5" role="status">
              <span className="size-3 shrink-0 animate-pulse rounded-full bg-critical" aria-hidden="true" />
              <span className="flex-1 font-mono">Recording {clock(rec.seconds)}</span>
              <button type="button" onClick={rec.cancel} className="label min-h-11 rounded-full px-4 underline underline-offset-4">
                Cancel
              </button>
              <button type="button" onClick={() => void toggleMic()} className="label min-h-11 rounded-full bg-forest px-5 text-lime">
                Stop
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-center gap-2"
            >
              <label htmlFor="msg" className="sr-only">
                Message FarmAs AI
              </label>
              <input
                id="msg"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === "AGENT" ? "Tell FarmAs AI what happened…" : "Ask FarmAs AI a question…"}
                maxLength={2000}
                className="min-h-12 min-w-0 flex-1 rounded-full border border-forest/20 bg-white px-5"
              />
              <button
                type="button"
                onClick={() => void toggleMic()}
                disabled={transcribing || busy || !rec.supported}
                aria-label="Record a voice note"
                title={rec.supported ? "Record a voice note" : "Voice is not supported in this browser"}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-lime text-forest disabled:opacity-40"
              >
                <MicIcon />
              </button>
              <button type="submit" disabled={busy || transcribing} className="label min-h-12 shrink-0 rounded-full bg-forest px-5 text-lime disabled:opacity-50">
                Send
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

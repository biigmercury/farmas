"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { quickActions } from "@/lib/demo-data";
import { confirmAction, isDemoAgent, sendToAgent } from "@/services/agent";

type Msg = {
  id: number;
  who: "you" | "farmas";
  text: string;
  pending?: { id: string; summary: string };
  resolved?: boolean;
};

export default function AiChat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, who: "farmas", text: "Hello! Tell me what happened on your farm today." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const push = (m: Omit<Msg, "id">) => setMsgs((p) => [...p, { ...m, id: nextId.current++ }]);
  const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    // A new message cancels any older "save this?" question (the server does the same).
    setMsgs((p) => p.map((m) => (m.pending && !m.resolved ? { ...m, resolved: true } : m)));
    push({ who: "you", text: t });
    setBusy(true);
    try {
      const r = await sendToAgent(t);
      push({ who: "farmas", text: r.text, pending: r.pending ?? undefined });
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

  return (
    <div className="mx-auto flex h-[calc(100dvh-10.5rem)] w-full max-w-4xl flex-col lg:h-[calc(100dvh-4rem)]">
      <div className="mb-3">
        <h1 className="h-display text-3xl lg:text-5xl">FarmAs AI</h1>
        <p className="label mt-2 opacity-70">Your farm companion</p>
        {isDemoAgent && (
          <p className="mt-3 inline-block rounded-full bg-lime px-4 py-1.5 text-sm">
            Demo mode: no server connected, so nothing is saved.
          </p>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 lg:max-w-[70%] ${
                m.who === "you" ? "bg-forest text-lime" : "border border-forest/10 bg-white"
              }`}
            >
              <p className="whitespace-pre-line">{m.text}</p>
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

      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2">
        {quickActions.map((q) => (
          <button
            key={q}
            onClick={() => setInput(q)}
            className="label min-h-11 shrink-0 rounded-full border border-forest/30 bg-white px-4"
          >
            {q}
          </button>
        ))}
      </div>

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
          placeholder="Tell FarmAs AI what happened…"
          maxLength={2000}
          className="min-h-12 min-w-0 flex-1 rounded-full border border-forest/20 bg-white px-5"
        />
        <button
          type="button"
          aria-label="Record voice note (coming soon)"
          title="Voice coming soon"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-lime text-forest"
        >
          🎤
        </button>
        <button type="submit" disabled={busy} className="label min-h-12 shrink-0 rounded-full bg-forest px-5 text-lime disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}

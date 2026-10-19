"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEMO_URL, FARM_QUESTIONS, LANGUAGES, THOUGHT_QUESTIONS, TRIED, UI,
  type Question, type SurveyLang,
} from "@/lib/survey-content";
import { ApiError } from "@/lib/api";
import { submitSurvey } from "@/services/survey";

type Answer = string | number | string[];
type Draft = {
  lang: SurveyLang; step: number; consent: boolean; tried: string;
  answers: Record<string, Answer>; name: string; phone: string; contactOk: boolean; nameOk: boolean;
};

const DRAFT_KEY = "farmas-survey-draft";
const SENT_KEY = "farmas-survey-sent";
const LAST_STEP = 4;

const EMPTY: Draft = {
  lang: "en", step: 0, consent: false, tried: "", answers: {}, name: "", phone: "", contactOk: false, nameOk: false,
};

function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    // no saved draft
  }
  return EMPTY;
}

const choiceBase =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors";

export default function SurveyPage() {
  const [d, setD] = useState<Draft>(EMPTY);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const trap = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  // Restore a half-finished survey, so a farmer who closes the tab does not start again.
  useEffect(() => {
    // Browser storage can only be read after the page loads, so this has to run in an effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      if (localStorage.getItem(SENT_KEY)) setDone(true);
    } catch {
      // storage blocked
    }
    setD(readDraft());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready || done) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      // storage blocked: the survey still works, it just will not be remembered
    }
  }, [d, ready, done]);

  const L = d.lang;
  const t = (x: Record<SurveyLang, string>) => x[L];
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));
  const setAnswer = (id: string, v: Answer | undefined) =>
    setD((p) => {
      const answers = { ...p.answers };
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete answers[id];
      else answers[id] = v;
      return { ...p, answers };
    });

  function go(step: number) {
    setError("");
    set({ step });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      await submitSurvey({
        language: L,
        ...(d.tried ? { tried: d.tried } : {}),
        consent: true,
        answers: d.answers,
        ...(d.name.trim() ? { name: d.name.trim() } : {}),
        ...(d.phone.trim() ? { phone: d.phone.trim() } : {}),
        contactOk: d.contactOk,
        nameOk: d.nameOk,
        website: trap.current?.value ?? "",
      });
      try {
        localStorage.setItem(SENT_KEY, "1");
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? e.message : t(UI.failed));
    } finally {
      setBusy(false);
    }
  }

  function renderQuestion(q: Question) {
    const val = d.answers[q.id];
    return (
      <fieldset key={q.id} className="space-y-3">
        <legend className="text-base font-medium">{t(q.label)}</legend>
        {q.hint && <p className="text-sm opacity-70">{t(q.hint)}</p>}

        {q.kind === "text" && (
          <textarea
            value={typeof val === "string" ? val : ""}
            onChange={(e) => setAnswer(q.id, e.target.value.slice(0, 1000))}
            rows={4}
            className="w-full rounded-2xl border border-forest/20 bg-white p-3 text-base"
          />
        )}

        {q.kind === "scale" && (
          <div>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={val === n}
                  onClick={() => setAnswer(q.id, val === n ? undefined : n)}
                  className={`min-h-12 rounded-2xl border text-lg font-medium ${val === n ? "border-forest bg-lime" : "border-forest/20 bg-white"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs opacity-70">
              <span>{q.low && t(q.low)}</span>
              <span>{q.high && t(q.high)}</span>
            </div>
          </div>
        )}

        {(q.kind === "single" || q.kind === "multi") && (
          <div className="space-y-2">
            {q.options?.map((opt) => {
              const chosen = q.kind === "multi" ? Array.isArray(val) && val.includes(opt.v) : val === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  role={q.kind === "multi" ? "checkbox" : "radio"}
                  aria-checked={chosen}
                  onClick={() => {
                    if (q.kind === "multi") {
                      const cur = Array.isArray(val) ? val : [];
                      setAnswer(q.id, chosen ? cur.filter((x) => x !== opt.v) : [...cur, opt.v]);
                    } else {
                      setAnswer(q.id, chosen ? undefined : opt.v);
                    }
                  }}
                  className={`${choiceBase} ${chosen ? "border-forest bg-lime" : "border-forest/20 bg-white"}`}
                >
                  <span
                    aria-hidden
                    className={`flex size-5 shrink-0 items-center justify-center border border-forest ${q.kind === "multi" ? "rounded" : "rounded-full"} ${chosen ? "bg-forest text-lime" : "bg-white"}`}
                  >
                    {chosen && <span className="text-xs leading-none">✓</span>}
                  </span>
                  <span>{opt.t[L]}</span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
    );
  }

  if (!ready) return <main className="min-h-dvh" />;

  const shell = "mx-auto w-full max-w-xl px-4 py-6";

  if (done) {
    const link = typeof window !== "undefined" ? `${window.location.origin}/survey` : "";
    return (
      <main className={shell}>
        <div className="rounded-3xl border border-forest/10 bg-white p-6 text-center">
          <h1 className="h-display text-2xl">{t(UI.thanksTitle)}</h1>
          <p className="mt-3">{t(UI.thanks)}</p>
          <p className="mt-6 text-sm opacity-80">{t(UI.share)}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
            className="label mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-forest bg-lime px-5 py-2"
          >
            {copied ? t(UI.copied) : t(UI.copy)}
          </button>
        </div>
      </main>
    );
  }

  const step = d.step;
  const names = UI.stepNames[L];

  return (
    <main className={shell}>
      <div ref={top} className="scroll-mt-4" />
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="label">FarmAs</span>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">{t(UI.language)}</span>
          <select
            value={L}
            onChange={(e) => set({ lang: e.target.value as SurveyLang })}
            className="min-h-10 rounded-full border border-forest/30 bg-white px-3"
          >
            {LANGUAGES.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="label mb-2">
        {t(UI.stepOf)} {step + 1} {t(UI.of)} {names.length}: {names[step]}
      </p>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-forest/10" aria-hidden>
        <div className="h-full bg-forest transition-all" style={{ width: `${((step + 1) / names.length) * 100}%` }} />
      </div>

      <div className="rounded-3xl border border-forest/10 bg-white/60 p-5">
        {step === 0 && (
          <div className="space-y-5">
            <h1 className="h-display text-2xl">{t(UI.welcomeTitle)}</h1>
            <p>{t(UI.welcome)}</p>
            <label className={`${choiceBase} ${d.consent ? "border-forest bg-lime" : "border-forest/20 bg-white"}`}>
              <input
                type="checkbox"
                checked={d.consent}
                onChange={(e) => set({ consent: e.target.checked })}
                className="size-5 shrink-0 accent-forest"
              />
              <span className="text-sm">{t(UI.consent)}</span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="h-display text-xl">{t(UI.tryTitle)}</h2>
            <p>{t(UI.tryIntro)}</p>
            <ol className="list-decimal space-y-2 pl-5">
              {UI.trySteps[L].map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="label inline-flex min-h-12 w-full items-center justify-center rounded-full border border-forest bg-lime px-5 py-2"
            >
              {t(UI.openDemo)} ↗
            </a>
            <p className="text-sm opacity-70">{t(UI.slowNote)}</p>
            <fieldset className="space-y-2">
              <legend className="font-medium">{t(UI.triedQ)}</legend>
              {TRIED.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  role="radio"
                  aria-checked={d.tried === opt.v}
                  onClick={() => set({ tried: d.tried === opt.v ? "" : opt.v })}
                  className={`${choiceBase} ${d.tried === opt.v ? "border-forest bg-lime" : "border-forest/20 bg-white"}`}
                >
                  {opt.t[L]}
                </button>
              ))}
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-7">
            <h2 className="h-display text-xl">{t(UI.farmTitle)}</h2>
            <p className="text-sm opacity-70">{t(UI.skipNote)}</p>
            {FARM_QUESTIONS.map(renderQuestion)}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-7">
            <h2 className="h-display text-xl">{t(UI.thoughtsTitle)}</h2>
            <p className="text-sm opacity-70">{t(UI.skipNote)}</p>
            {THOUGHT_QUESTIONS.map(renderQuestion)}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="h-display text-xl">{t(UI.finishTitle)}</h2>
            <p>{t(UI.finishIntro)}</p>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t(UI.name)}</span>
              <input
                value={d.name}
                maxLength={60}
                autoComplete="given-name"
                onChange={(e) => set({ name: e.target.value })}
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-3 text-base"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t(UI.phone)}</span>
              <input
                value={d.phone}
                maxLength={24}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                onChange={(e) => set({ phone: e.target.value })}
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-3 text-base"
              />
            </label>
            {([["contactOk", UI.contactOk], ["nameOk", UI.nameOk]] as const).map(([k, text]) => (
              <label key={k} className={`${choiceBase} ${d[k] ? "border-forest bg-lime" : "border-forest/20 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={d[k]}
                  onChange={(e) => set({ [k]: e.target.checked } as Partial<Draft>)}
                  className="size-5 shrink-0 accent-forest"
                />
                <span className="text-sm">{t(text)}</span>
              </label>
            ))}
            {/* Trap for bots: people never see or fill this box. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input ref={trap} name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>
            {!d.consent && <p role="alert" className="text-sm text-critical">{t(UI.needConsent)}</p>}
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-2xl border border-critical/40 bg-white p-3 text-sm">{error}</p>}
      </div>

      <div className="mt-5 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => go(step - 1)}
            className="label min-h-12 flex-1 rounded-full border border-forest px-5 py-2"
          >
            {t(UI.back)}
          </button>
        )}
        {step < LAST_STEP ? (
          <button
            type="button"
            disabled={step === 0 && !d.consent}
            onClick={() => go(step + 1)}
            className="label min-h-12 flex-1 rounded-full border border-forest bg-lime px-5 py-2 disabled:opacity-40"
          >
            {t(UI.next)}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !d.consent}
            onClick={() => void send()}
            className="label min-h-12 flex-1 rounded-full border border-forest bg-lime px-5 py-2 disabled:opacity-40"
          >
            {busy ? t(UI.sending) : t(UI.send)}
          </button>
        )}
      </div>
    </main>
  );
}

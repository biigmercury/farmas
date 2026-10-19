"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { FARM_QUESTIONS, THOUGHT_QUESTIONS, TRIED, type Question } from "@/lib/survey-content";
import { downloadSurveyCsv, loadSurveyResults, type SurveyResults } from "@/services/survey";

// Team-only page. The key is typed here and sent to the server; it is never stored in the page address.

const QUESTIONS: Question[] = [...FARM_QUESTIONS, ...THOUGHT_QUESTIONS].filter((q) => q.kind !== "text");
const LANG_NAMES: Record<string, string> = { en: "English", pg: "Pidgin", yo: "Yoruba" };

function label(q: Question, v: string): string {
  if (q.kind === "scale") return `${v} / 5`;
  return q.options?.find((o) => o.v === v)?.t.en ?? v;
}

/** Counts for a question, in the order the choices appear in the survey. */
function rows(q: Question, counts: Record<string, number> = {}) {
  const order = q.kind === "scale" ? ["1", "2", "3", "4", "5"] : (q.options ?? []).map((o) => o.v);
  return order.map((v) => ({ v, n: counts[v] ?? 0 }));
}

function pitchLines(r: SurveyResults): string[] {
  const c = r.choices;
  const n = (q: string, ...keys: string[]) => keys.reduce((s, k) => s + (c[q]?.[k] ?? 0), 0);
  const of = (q: string) => r.answered[q] ?? 0;
  const lines: string[] = [];
  const add = (q: string, count: number, text: string) => {
    if (of(q) > 0) lines.push(`${count} of ${of(q)} ${text}`);
  };
  add("q4", n("q4", "nothing", "notebook"), "farmers keep no records or only a paper notebook.");
  add("q5", n("q5", "no"), "farmers do not know last month's profit or loss.");
  add("q6", n("q6", "11_50", "over_50"), "farmers lost more than 10 animals to sickness in the past year.");
  add("q8", n("q8", "very_hard", "sometimes_hard"), "farmers say reaching a vet quickly is hard.");
  add("q9b", n("q9b", "daily", "sometimes"), "farmers already use WhatsApp.");
  add("q10", n("q10", "talk", "both"), "farmers would like to talk to their phone.");
  add("q12", n("q12", "4", "5"), "farmers rated FarmAs 4 or 5 out of 5 for usefulness.");
  add("q12b", n("q12b", "4", "5"), "farmers rated FarmAs 4 or 5 out of 5 for ease of use.");
  add("q12d", n("q12d", "yes", "with_vet"), "farmers would trust the AI's advice on a sick animal.");
  return lines;
}

export default function SurveyResultsPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<SurveyResults | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    setError("");
    try {
      setData(await loadSurveyResults(key.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="h-display text-2xl">Survey results</h1>
        <p className="mt-2 text-sm opacity-70">Team only. Enter the results key.</p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void open();
          }}
        >
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            aria-label="Results key"
            className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-3 text-base"
          />
          {error && <p role="alert" className="text-sm text-critical">{error}</p>}
          <button
            type="submit"
            disabled={busy || key.trim().length < 8}
            className="label min-h-12 w-full rounded-full border border-forest bg-lime px-5 py-2 disabled:opacity-40"
          >
            {busy ? "Opening…" : "Open results"}
          </button>
        </form>
      </main>
    );
  }

  const triedCounts = data.choices.tried ?? {};
  const lines = pitchLines(data);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-display text-2xl">Survey results</h1>
          <p className="text-sm opacity-70">
            {data.total} {data.total === 1 ? "farmer has" : "farmers have"} answered.{" "}
            {Object.entries(data.choices.language ?? {}).map(([k, v]) => `${LANG_NAMES[k] ?? k}: ${v}`).join(", ")}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void open()} className="label min-h-11 rounded-full border border-forest px-4">
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void downloadSurveyCsv(key.trim()).catch((e) => setError(e instanceof Error ? e.message : "Download failed."))}
            className="label min-h-11 rounded-full border border-forest bg-lime px-4"
          >
            Download spreadsheet
          </button>
        </div>
      </header>
      {error && <p role="alert" className="text-sm text-critical">{error}</p>}

      {lines.length > 0 && (
        <section className="rounded-2xl border border-forest/10 bg-white p-4">
          <h2 className="label mb-2">Lines for the pitch</h2>
          <ul className="list-disc space-y-1 pl-5">
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-forest/10 bg-white p-4">
        <h2 className="font-medium">Did they try the demo first?</h2>
        <Bars items={TRIED.map((o) => ({ name: o.t.en, n: triedCounts[o.v] ?? 0 }))} total={data.total} />
      </section>

      {QUESTIONS.map((q) => {
        const items = rows(q, data.choices[q.id]).map((r) => ({ name: label(q, r.v), n: r.n }));
        return (
          <section key={q.id} className="rounded-2xl border border-forest/10 bg-white p-4">
            <h2 className="font-medium">{q.label.en}</h2>
            <p className="text-xs opacity-60">{data.answered[q.id] ?? 0} answered</p>
            <Bars items={items} total={data.answered[q.id] ?? 0} />
          </section>
        );
      })}

      <section className="space-y-3">
        <h2 className="h-display text-xl">In their own words</h2>
        {data.written.length === 0 && <p className="text-sm opacity-70">Nothing written yet.</p>}
        {data.written.map((w) => (
          <article key={w.id} className="rounded-2xl border border-forest/10 bg-white p-4 text-sm">
            <p className="label mb-2">{w.name ?? "Anonymous"} · {new Date(w.at).toLocaleDateString()}</p>
            {w.q15 && <p><strong>Worry:</strong> {w.q15}</p>}
            {w.q16 && <p className="mt-1"><strong>One thing it should do:</strong> {w.q16}</p>}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="h-display text-xl">Happy to be contacted</h2>
        {data.contacts.length === 0 && <p className="text-sm opacity-70">Nobody yet.</p>}
        <ul className="space-y-2">
          {data.contacts.map((c) => (
            <li key={c.id} className="rounded-2xl border border-forest/10 bg-white p-3 text-sm">
              {c.name ?? "No name"} · {c.phone ?? "No phone"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Bars({ items, total }: { items: { name: string; n: number }[]; total: number }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((it) => (
        <li key={it.name}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{it.name}</span>
            <span className="tabular-nums">{it.n}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-forest/10">
            <div className="h-full bg-forest" style={{ width: `${total ? (it.n / total) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

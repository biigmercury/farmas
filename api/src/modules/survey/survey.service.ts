import { prisma } from "../../config/prisma";
import { CHOICES, SCALES, TEXTS, type SurveySubmit } from "./survey.schemas";

export async function saveResponse(input: SurveySubmit): Promise<string> {
  const row = await prisma.surveyResponse.create({
    data: {
      language: input.language,
      tried: input.tried,
      answers: input.answers as object,
      name: input.name || null,
      phone: input.phone || null,
      contactOk: Boolean(input.contactOk),
      nameOk: Boolean(input.nameOk),
    },
    select: { id: true },
  });
  return row.id;
}

type Answers = Record<string, unknown>;

/** Counts for every question, plus the written answers, so the team can fill in the tally sheet and pick quotes. */
export async function getResults() {
  const rows = await prisma.surveyResponse.findMany({ orderBy: { createdAt: "desc" } });
  const choices: Record<string, Record<string, number>> = {};
  const answered: Record<string, number> = {};

  const bump = (key: string, value: string) => {
    (choices[key] ??= {})[value] = (choices[key][value] ?? 0) + 1;
  };

  for (const row of rows) {
    const a = row.answers as Answers;
    for (const key of Object.keys(CHOICES)) {
      const v = a[key];
      if (Array.isArray(v) && v.length > 0) {
        answered[key] = (answered[key] ?? 0) + 1;
        for (const item of v) bump(key, String(item));
      } else if (typeof v === "string" && v) {
        answered[key] = (answered[key] ?? 0) + 1;
        bump(key, v);
      }
    }
    for (const key of SCALES) {
      const v = a[key];
      if (typeof v === "number") {
        answered[key] = (answered[key] ?? 0) + 1;
        bump(key, String(v));
      }
    }
    if (row.tried) bump("tried", row.tried);
    bump("language", row.language);
  }

  const written = rows
    .filter((r) => TEXTS.some((k) => typeof (r.answers as Answers)[k] === "string" && (r.answers as Answers)[k]))
    .map((r) => {
      const a = r.answers as Answers;
      return {
        id: r.id,
        at: r.createdAt,
        q15: (a.q15 as string | undefined) ?? "",
        q16: (a.q16 as string | undefined) ?? "",
        // Only show a name when the farmer said we may use it
        name: r.nameOk ? r.name : null,
        contactOk: r.contactOk,
      };
    });

  const contacts = rows
    .filter((r) => r.contactOk && (r.name || r.phone))
    .map((r) => ({ id: r.id, at: r.createdAt, name: r.name, phone: r.phone }));

  return { total: rows.length, answered, choices, written, contacts };
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  // Stop a spreadsheet from running a cell that starts like a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Everything as a spreadsheet (CSV): one row per farmer. */
export async function getCsv(): Promise<string> {
  const rows = await prisma.surveyResponse.findMany({ orderBy: { createdAt: "asc" } });
  const keys = [...Object.keys(CHOICES), ...SCALES, ...TEXTS].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const header = ["submitted_at", "language", "tried_demo", ...keys, "name", "phone", "ok_to_contact", "ok_to_use_name"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const a = r.answers as Answers;
    lines.push(
      [r.createdAt.toISOString(), r.language, r.tried, ...keys.map((k) => a[k]), r.name, r.phone, r.contactOk, r.nameOk]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

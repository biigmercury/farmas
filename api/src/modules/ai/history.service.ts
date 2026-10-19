import type { LivestockType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { NluEntities } from "../../config/mlClient";
import { naira } from "../../utils/format";
import { animals, t, type Lang } from "../../utils/lang";
import { DAY_MS, lagosDateLong, lagosDayAfter, lagosDayStart } from "../../utils/time";
import { parseLivestockType } from "../farm/inventory.service";

// Looking back: what happened on the farm in the past, and what the farmer and the AI said before.
// Everything here is read from stored records and saved chats, never made up.

interface Range {
  gte: Date;
  lt: Date;
  label: string;
  /** True when the farmer named the period; false when we picked a default. */
  given: boolean;
}

function resolveRange(entities: NluEntities, fallbackDays: number): Range {
  const start = entities.period_start ? lagosDayStart(entities.period_start) : null;
  const after = entities.period_end ? lagosDayAfter(entities.period_end) : null;
  if (start || after) {
    const gte = start ?? new Date((after as Date).getTime() - DAY_MS);
    const lt = after ?? new Date(gte.getTime() + DAY_MS);
    const first = lagosDateLong(gte);
    const last = lagosDateLong(new Date(lt.getTime() - 1));
    return { gte, lt, label: first === last ? first : `${first} to ${last}`, given: true };
  }
  const lt = new Date(Date.now() + 1);
  return { gte: new Date(lt.getTime() - fallbackDays * DAY_MS), lt, label: `the last ${fallbackDays} days`, given: false };
}

const s = (n: number) => (n === 1 ? "" : "s");
const MAX_ROWS = 6;

function more(total: number, shown: number, lang: Lang): string {
  return total > shown ? t(lang, ` (and ${total - shown} more)`, ` (and ${total - shown} more)`) : "";
}

async function deaths(farmId: string, range: Range, type: LivestockType | undefined, lang: Lang): Promise<string> {
  const rows = await prisma.livestockMovement.findMany({
    where: { farmId, reason: "DEATH", createdAt: { gte: range.gte, lt: range.lt }, ...(type ? { livestockType: type } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0)
    return t(lang, `I have no deaths recorded for ${range.label}.`, `I no see any death wey enter for ${range.label}.`);
  const total = rows.reduce((sum, r) => sum + Math.abs(r.change), 0);
  const lines = rows
    .slice(0, MAX_ROWS)
    .map((r) => `- ${lagosDateLong(r.createdAt)}: ${animals(r.livestockType, Math.abs(r.change))}${r.note ? ` (${r.note})` : ""}`);
  return [
    t(lang, `${total} animal${s(total)} died in ${range.label}:`, `${total} animal${s(total)} die for ${range.label}:`),
    ...lines,
  ].join("\n") + more(rows.length, MAX_ROWS, lang);
}

async function health(farmId: string, range: Range, lang: Lang): Promise<string> {
  const rows = await prisma.healthRecord.findMany({
    where: { farmId, createdAt: { gte: range.gte, lt: range.lt } },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0)
    return t(lang, `I have no health problems recorded for ${range.label}.`, `I no see any health problem for ${range.label}.`);
  const lines = rows
    .slice(0, MAX_ROWS)
    .map((r) => `- ${lagosDateLong(r.createdAt)}: ${r.symptoms.slice(0, 90)} (${t(lang, `${r.numberAffected} affected, ${r.mortality} died, risk ${r.riskLevel}`, `${r.numberAffected} dey sick, ${r.mortality} don die, risk ${r.riskLevel}`)})`);
  return [t(lang, `Health problems in ${range.label}:`, `Health wahala for ${range.label}:`), ...lines].join("\n") + more(rows.length, MAX_ROWS, lang);
}

async function animalChanges(farmId: string, range: Range, type: LivestockType | undefined, lang: Lang): Promise<string> {
  const rows = await prisma.livestockMovement.findMany({
    where: { farmId, createdAt: { gte: range.gte, lt: range.lt }, ...(type ? { livestockType: type } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0)
    return t(lang, `I have no animal changes recorded for ${range.label}.`, `I no see any animal change for ${range.label}.`);
  const word: Record<string, string> = {
    PURCHASE: t(lang, "bought", "you buy"),
    ADDED: t(lang, "added", "you add"),
    SALE: t(lang, "sold", "you sell"),
    DEATH: t(lang, "died", "die"),
    LOST: t(lang, "lost or stolen", "lost or thief carry"),
    CONSUMED: t(lang, "eaten at home", "una chop for house"),
    ADJUSTMENT: t(lang, "adjusted", "we adjust"),
  };
  const lines = rows
    .slice(0, MAX_ROWS)
    .map((r) => `- ${lagosDateLong(r.createdAt)}: ${animals(r.livestockType, Math.abs(r.change))} ${word[r.reason] ?? r.reason.toLowerCase()}`);
  return [t(lang, `Animal changes in ${range.label}:`, `Animal changes for ${range.label}:`), ...lines].join("\n") + more(rows.length, MAX_ROWS, lang);
}

async function sales(farmId: string, range: Range, type: LivestockType | undefined, lang: Lang): Promise<string> {
  const where: Prisma.SaleWhereInput = { farmId, date: { gte: range.gte, lt: range.lt }, ...(type ? { livestockType: type } : {}) };
  const [rows, agg] = await Promise.all([
    prisma.sale.findMany({ where, orderBy: { date: "desc" }, take: MAX_ROWS }),
    prisma.sale.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  if (agg._count._all === 0)
    return t(lang, `I have no sales recorded for ${range.label}.`, `I no see any sale for ${range.label}.`);
  const lines = rows.map(
    (r) => `- ${lagosDateLong(r.date)}: ${animals(r.livestockType, r.quantity)} for ${naira(Number(r.amount))}${r.buyer ? ` to ${r.buyer}` : ""}`
  );
  return [
    t(
      lang,
      `${agg._count._all} sale${s(agg._count._all)} in ${range.label}, ${naira(Number(agg._sum.amount ?? 0))} in total:`,
      `${agg._count._all} sale${s(agg._count._all)} for ${range.label}, ${naira(Number(agg._sum.amount ?? 0))} in total:`
    ),
    ...lines,
  ].join("\n") + more(agg._count._all, rows.length, lang);
}

async function expenses(farmId: string, range: Range, lang: Lang): Promise<string> {
  const where: Prisma.ExpenseWhereInput = { farmId, date: { gte: range.gte, lt: range.lt } };
  const [groups, agg] = await Promise.all([
    prisma.expense.groupBy({ by: ["category"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  if (agg._count._all === 0)
    return t(lang, `I have no expenses recorded for ${range.label}.`, `I no see any expense for ${range.label}.`);
  const parts = groups
    .sort((a, b) => Number(b._sum.amount ?? 0) - Number(a._sum.amount ?? 0))
    .slice(0, MAX_ROWS)
    .map((g) => `${g.category.replace(/_/g, " ").toLowerCase()} ${naira(Number(g._sum.amount ?? 0))}`);
  return t(
    lang,
    `You spent ${naira(Number(agg._sum.amount ?? 0))} in ${range.label} (${agg._count._all} expense${s(agg._count._all)}): ${parts.join(", ")}.`,
    `You spend ${naira(Number(agg._sum.amount ?? 0))} for ${range.label} (${agg._count._all} expense${s(agg._count._all)}): ${parts.join(", ")}.`
  );
}

async function tasks(farmId: string, range: Range, lang: Lang): Promise<string> {
  if (!range.given) {
    // "When did I last vaccinate?" / "what is coming up?": the latest done and the next waiting.
    const [lastDone, next] = await Promise.all([
      prisma.task.findFirst({ where: { farmId, status: "DONE" }, orderBy: { dueDate: "desc" } }),
      prisma.task.findFirst({ where: { farmId, status: "PENDING", dueDate: { gte: new Date() } }, orderBy: { dueDate: "asc" } }),
    ]);
    const parts: string[] = [];
    if (lastDone) parts.push(t(lang, `Last task you finished: ${lastDone.title} (${lagosDateLong(lastDone.dueDate)}).`, `Last task wey you finish: ${lastDone.title} (${lagosDateLong(lastDone.dueDate)}).`));
    if (next) parts.push(t(lang, `Next one waiting: ${next.title} on ${lagosDateLong(next.dueDate)}.`, `Next one wey dey wait: ${next.title} on ${lagosDateLong(next.dueDate)}.`));
    return parts.length ? parts.join("\n") : t(lang, "I have no tasks or reminders recorded yet.", "I no see any task or reminder yet.");
  }
  const rows = await prisma.task.findMany({
    where: { farmId, dueDate: { gte: range.gte, lt: range.lt } },
    orderBy: { dueDate: "asc" },
  });
  if (rows.length === 0)
    return t(lang, `I have no tasks or reminders for ${range.label}.`, `I no see any task or reminder for ${range.label}.`);
  const lines = rows.slice(0, MAX_ROWS).map((r) => `- ${lagosDateLong(r.dueDate)}: ${r.title} (${r.status === "DONE" ? t(lang, "done", "don do") : t(lang, "waiting", "dey wait")})`);
  return [t(lang, `Tasks and reminders for ${range.label}:`, `Tasks and reminders for ${range.label}:`), ...lines].join("\n") + more(rows.length, MAX_ROWS, lang);
}

async function overview(farmId: string, range: Range, lang: Lang): Promise<string> {
  const [saleAgg, expAgg, deathRows, moveRows] = await Promise.all([
    prisma.sale.aggregate({ where: { farmId, date: { gte: range.gte, lt: range.lt } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.aggregate({ where: { farmId, date: { gte: range.gte, lt: range.lt } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.livestockMovement.aggregate({ where: { farmId, reason: "DEATH", createdAt: { gte: range.gte, lt: range.lt } }, _sum: { change: true } }),
    prisma.livestockMovement.count({ where: { farmId, createdAt: { gte: range.gte, lt: range.lt } } }),
  ]);
  return [
    t(lang, `Here is ${range.label}:`, `Na so ${range.label} be:`),
    `- ${t(lang, "Sales", "Sales")}: ${naira(Number(saleAgg._sum.amount ?? 0))} (${saleAgg._count._all})`,
    `- ${t(lang, "Expenses", "Expenses")}: ${naira(Number(expAgg._sum.amount ?? 0))} (${expAgg._count._all})`,
    `- ${t(lang, "Animals that died", "Animals wey die")}: ${Math.abs(deathRows._sum.change ?? 0)}`,
    `- ${t(lang, "Animal changes", "Animal changes")}: ${moveRows}`,
  ].join("\n");
}

/** "What happened on the farm?" answered from the stored records. */
export async function answerHistory(farmId: string, entities: NluEntities, lang: Lang): Promise<string> {
  const topic = entities.history_topic ?? "ALL";
  const type = parseLivestockType(entities.livestock_type);
  const range = resolveRange(entities, 30);
  switch (topic) {
    case "DEATHS":
      return deaths(farmId, range, type, lang);
    case "HEALTH":
      return health(farmId, range, lang);
    case "ANIMALS":
      return animalChanges(farmId, range, type, lang);
    case "SALES":
      return sales(farmId, range, type, lang);
    case "EXPENSES":
      return expenses(farmId, range, lang);
    case "TASKS":
      return tasks(farmId, range, lang);
    default:
      return overview(farmId, range, lang);
  }
}

const clip = (text: string, n = 150) => (text.length > n ? `${text.slice(0, n).trimEnd()}…` : text);

/** "What did I tell you about the sick goats?" answered from this farmer's saved chats. */
export async function searchConversations(
  farmId: string,
  userId: string,
  entities: NluEntities,
  lang: Lang
): Promise<string> {
  const terms = (entities.search_terms ?? []).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 4);
  if (terms.length === 0) {
    return t(
      lang,
      "What should I look for? For example: \"What did I tell you about the sick goats?\"",
      "Wetin I go look for? For example: \"Wetin I tell you about the sick goats?\""
    );
  }
  const range = resolveRange(entities, 90);
  const rows = await prisma.aiConversation.findMany({
    where: {
      farmId,
      userId,
      createdAt: { gte: range.gte, lt: range.lt },
      OR: terms.flatMap((term) => [
        { message: { contains: term, mode: "insensitive" as const } },
        { response: { contains: term, mode: "insensitive" as const } },
      ]),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { message: true, response: true, createdAt: true },
  });
  if (rows.length === 0) {
    return t(
      lang,
      `I could not find any earlier chat about "${terms.join(" ")}" in ${range.label}.`,
      `I no see any old chat about "${terms.join(" ")}" for ${range.label}.`
    );
  }
  const lines = rows.map(
    (r) =>
      `- ${lagosDateLong(r.createdAt)}: ${t(lang, "you said", "you talk say")} "${clip(r.message)}", ${t(lang, "I replied", "I reply")} "${clip(r.response)}"`
  );
  return [t(lang, `Here is what I found about "${terms.join(" ")}":`, `Na wetin I see about "${terms.join(" ")}":`), ...lines].join("\n");
}

import type { LivestockType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  MlServiceError,
  mlClient,
  type NluEntities,
  type NluIntent,
  type NluResult,
} from "../../config/mlClient";
import { ApiError } from "../../utils/apiError";
import { logger } from "../../utils/logger";
import { isAffirmative, isNegative, naira } from "../../utils/format";
import { DEFAULT_LANG, animals, t, type Lang } from "../../utils/lang";
import { evaluateFarm } from "../farm/alertEngine.service";
import { assessAndRecord } from "../health/health.service";
import { runQuery } from "./query.service";

const MIN_CREATE_CONFIDENCE = 0.6;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIVESTOCK_TYPES: LivestockType[] = ["POULTRY", "GOAT", "SHEEP", "CATTLE", "PIG", "RABBIT", "FISH"];

const LIVESTOCK_ALIASES: Array<[RegExp, LivestockType]> = [
  [/broiler|chicken|layer|poultry|bird|fowl|egg/, "POULTRY"],
  [/goat|ender|meat/, "GOAT"],
  [/sheep|ram|ewe/, "SHEEP"],
  [/cow|cattle|fulani|ox|bullock/, "CATTLE"],
  [/pig|hog|boar/, "PIG"],
  [/rabbit|bunny/, "RABBIT"],
  [/fish|catfish|tilapia|clarias/, "FISH"],
];

const ACTION_LABELS: Record<string, string> = {
  CREATE_EXPENSE: "Expense",
  CREATE_SALE: "Sale",
  CREATE_LIVESTOCK: "Livestock intake",
  CREATE_FEED_RECORD: "Feed record",
  CREATE_HEALTH_RECORD: "Health record",
};

const EXAMPLES: Record<string, string> = {
  CREATE_EXPENSE: "I spend 50k on feed today",
  CREATE_SALE: "I sell 20 broilers for 200k",
  CREATE_LIVESTOCK: "I buy 100 broilers for 300k",
  CREATE_FEED_RECORD: "I give dem 5 bags feed for 45k",
  CREATE_HEALTH_RECORD: "300 birds don kpai since morning",
  QUERY_EXPENSES: "How much I spend this month?",
  QUERY_PROFIT: "How much profit I make?",
  QUERY_SALES: "How much I don sell?",
  QUERY_LIVESTOCK: "How many animals I get?",
};

function unknownReply(lang: Lang): string {
  return lang === "pidgin"
    ? [
        "I no understand wetin you mean yet. You fit try things like:",
        '- "How much I spend this month?"',
        '- "I buy 100 broilers for 300k"',
        '- "My birds dey cough and no dey eat"',
      ].join("\n")
    : [
        "I did not understand that yet. You can try things like:",
        '- "How much did I spend this month?"',
        '- "I bought 100 broilers for 300k"',
        '- "My birds are coughing and not eating"',
      ].join("\n");
}

export interface ProcessInputOptions {
  farmId: string;
  userId: string;
  text: string;
  channel: "APP" | "WHATSAPP";
}

interface FarmContext {
  livestock: Array<{ type: LivestockType; quantity: number }>;
  batches: Array<{ id: string; name: string; livestockType: LivestockType; quantity: number }>;
  mlContext: Record<string, unknown>;
}

export interface ResolvedAction {
  intent: NluIntent;
  lang: Lang;
  date: string;
  amount?: number;
  category?: string;
  description?: string;
  quantity?: number;
  livestockType?: LivestockType;
  feedType?: string;
  buyer?: string;
  name?: string;
  symptoms?: string[];
  numberAffected?: number;
  mortality?: number;
}

async function buildFarmContext(farmId: string): Promise<FarmContext> {
  const [batches, livestock, recentExpense, recentSale] = await Promise.all([
    prisma.batch.findMany({
      where: { farmId, status: "ACTIVE" },
      select: { id: true, name: true, livestockType: true, quantity: true },
      orderBy: { purchaseDate: "desc" },
    }),
    prisma.livestock.findMany({
      where: { farmId, status: "ACTIVE" },
      select: { type: true, quantity: true, breed: true, age: true },
    }),
    prisma.expense.findFirst({
      where: { farmId },
      orderBy: { date: "desc" },
      select: { category: true, amount: true, date: true, description: true },
    }),
    prisma.sale.findFirst({
      where: { farmId },
      orderBy: { date: "desc" },
      select: { livestockType: true, quantity: true, amount: true, buyer: true, date: true },
    }),
  ]);

  return {
    livestock,
    batches,
    mlContext: {
      currency: "NGN",
      current_date: new Date().toISOString(),
      livestock,
      batches,
      recent_expense: recentExpense ?? null,
      recent_sale: recentSale ?? null,
    },
  };
}

function parseHumanDate(raw?: string): Date | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (text === "today") return new Date();
  if (text === "yesterday") return new Date(Date.now() - DAY_MS);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function matchLivestockAlias(text: string): LivestockType | undefined {
  const lower = text.toLowerCase();
  for (const [pattern, type] of LIVESTOCK_ALIASES) {
    if (pattern.test(lower)) return type;
  }
  return undefined;
}

function resolveLivestockType(
  entities: NluEntities,
  context: FarmContext
): LivestockType | undefined {
  const raw = entities.livestock_type?.trim();
  if (raw) {
    const direct = LIVESTOCK_TYPES.find(
      (type) => type.toLowerCase() === raw.toLowerCase() || type.toLowerCase().startsWith(raw.toLowerCase())
    );
    if (direct) return direct;
    const aliased = matchLivestockAlias(raw);
    if (aliased) return aliased;
  }

  const haystack = [entities.description, entities.category].filter(Boolean).join(" ");
  if (haystack) {
    const aliased = matchLivestockAlias(haystack);
    if (aliased) return aliased;
  }

  const active = context.livestock.filter((row) => row.quantity > 0);
  if (active.length === 1) return active[0].type;
  return undefined;
}

function normalizeCategory(raw?: string): string {
  if (!raw) return "OTHER";
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "OTHER";
}

export function resolveAction(
  intent: NluIntent,
  entities: NluEntities,
  context: FarmContext,
  rawInput: string,
  lang: Lang = DEFAULT_LANG
): ResolvedAction {
  const date = parseHumanDate(entities.date) ?? new Date();
  const base: ResolvedAction = { intent, lang, date: date.toISOString() };

  switch (intent) {
    case "CREATE_EXPENSE":
      return {
        ...base,
        amount: entities.amount,
        category: normalizeCategory(entities.category),
        description: entities.description,
        livestockType: resolveLivestockType(entities, context),
      };
    case "CREATE_SALE": {
      const livestockType = resolveLivestockType(entities, context);
      const description = entities.description;
      const buyer =
        description && !matchLivestockAlias(description) ? description : undefined;
      return {
        ...base,
        quantity: entities.quantity,
        amount: entities.amount,
        livestockType,
        buyer,
        description,
      };
    }
    case "CREATE_LIVESTOCK":
      return {
        ...base,
        quantity: entities.quantity,
        amount: entities.amount,
        livestockType: resolveLivestockType(entities, context),
        name: entities.description,
      };
    case "CREATE_FEED_RECORD":
      return {
        ...base,
        quantity: entities.quantity,
        amount: entities.amount,
        feedType: entities.description || entities.category || "General feed",
        livestockType: resolveLivestockType(entities, context),
      };
    case "CREATE_HEALTH_RECORD":
      {
        const deaths = entities.deaths && entities.deaths > 0 ? Math.round(entities.deaths) : 0;
        const affected = entities.quantity && entities.quantity > 0 ? Math.round(entities.quantity) : 0;
        return {
          ...base,
          symptoms: entities.symptoms?.length ? entities.symptoms : [rawInput],
          // Dead animals were affected too, so never report fewer affected than dead.
          numberAffected: Math.max(affected, deaths, 1),
          mortality: deaths,
          livestockType: resolveLivestockType(entities, context),
        };
      }
    default:
      return base;
  }
}

function findMissing(data: ResolvedAction): string[] {
  const lang = data.lang;
  const missing: string[] = [];
  const amountOk = typeof data.amount === "number" && data.amount > 0;
  const quantityOk = typeof data.quantity === "number" && data.quantity > 0;
  const animalType = t(lang, "the type of animal (e.g. broilers, goats)", "wetin be the animal type (e.g. broilers, goats)");

  switch (data.intent) {
    case "CREATE_EXPENSE":
      if (!amountOk) missing.push(t(lang, "the amount you spent", "the amount wey you spend"));
      break;
    case "CREATE_SALE":
      if (!quantityOk) missing.push(t(lang, "how many animals you sold", "how many animals you sell"));
      if (!amountOk) missing.push(t(lang, "how much money you made", "how much money you make"));
      if (!data.livestockType) missing.push(animalType);
      break;
    case "CREATE_LIVESTOCK":
      if (!quantityOk) missing.push(t(lang, "how many animals you bought", "how many animals you buy"));
      if (!data.livestockType) missing.push(animalType);
      break;
    case "CREATE_FEED_RECORD":
      if (!quantityOk && !amountOk)
        missing.push(t(lang, "how many units of feed, or how much it cost", "how many feed units you give dem, or how much e cost"));
      break;
    case "CREATE_HEALTH_RECORD":
      if (!data.symptoms?.length) missing.push(t(lang, "the symptoms", "wetin be the symptoms"));
      break;
    default:
      break;
  }
  return missing;
}

function askForMissing(intent: NluIntent, missing: string[], lang: Lang): string {
  const example = EXAMPLES[intent] ?? "I spend 50k on feed today";
  return t(
    lang,
    `I still need ${missing.join("; ")}. Please add it to your message. Example: "${example}".`,
    `I still dey need ${missing.join("; ")}. Abeg add am to your message. Example: "${example}".`
  );
}

export function summarizeAction(data: ResolvedAction): string {
  const date = formatDate(data.date);
  const category = (data.category ?? "OTHER").toLowerCase().replace(/_/g, " ");

  switch (data.intent) {
    case "CREATE_EXPENSE": {
      const extra =
        data.description && data.description.toLowerCase() !== category ? ` (${data.description})` : "";
      return `you spent ${naira(data.amount ?? 0)} on ${category}${extra} on ${date}`;
    }
    case "CREATE_SALE":
      return `you sold ${animals(data.livestockType, data.quantity ?? 0)} for ${naira(data.amount ?? 0)}${
        data.buyer ? ` to ${data.buyer}` : ""
      } on ${date}`;
    case "CREATE_LIVESTOCK":
      return `you bought ${animals(data.livestockType, data.quantity ?? 0)}${
        data.amount && data.amount > 0 ? ` for ${naira(data.amount)}` : ""
      }${data.name ? ` (${data.name})` : ""} on ${date}`;
    case "CREATE_FEED_RECORD":
      return `you used ${data.quantity ?? 0} unit(s) of ${data.feedType ?? "feed"}${
        data.amount && data.amount > 0 ? ` worth ${naira(data.amount)}` : ""
      } on ${date}`;
    case "CREATE_HEALTH_RECORD":
      return `you reported ${data.numberAffected ?? 1} animal(s) affected${
        data.mortality ? ` (${data.mortality} dead)` : ""
      }: ${data.symptoms?.join("; ") ?? "symptoms unclear"}`;
    default:
      return "you want to record something";
  }
}

async function createPendingAction(
  farmId: string,
  rawInput: string,
  nlu: NluResult,
  resolved: ResolvedAction
): Promise<string> {
  const summary = summarizeAction(resolved);
  const label = ACTION_LABELS[nlu.intent] ?? nlu.intent;

  await prisma.aiActionLog.updateMany({
    where: { farmId, confirmationStatus: "PENDING" },
    data: { confirmationStatus: "REJECTED" },
  });

  await prisma.aiActionLog.create({
    data: {
      farmId,
      rawInput,
      detectedIntent: nlu.intent,
      extractedEntities: resolved as unknown as Prisma.InputJsonValue,
      confidence: nlu.confidence,
      actionTaken: `Create ${label}: ${summary}`,
      confirmationStatus: "PENDING",
    },
  });

  return t(
    resolved.lang,
    `I understood that ${summary}. Should I save this? Reply "yes" to confirm, or "no" to cancel.`,
    `I understood say ${summary}. Should I save this? Reply "yes" to confirm, or "no" to cancel.`
  );
}

async function routeInput(opts: ProcessInputOptions, text: string): Promise<string> {
  const context = await buildFarmContext(opts.farmId);
  const nlu = await mlClient.extract(text, context.mlContext);
  const lang: Lang = nlu.language ?? DEFAULT_LANG;

  if (nlu.intent.startsWith("QUERY_")) {
    return runQuery(opts.farmId, nlu.intent, nlu.entities, lang);
  }

  if (nlu.intent.startsWith("CREATE_")) {
    if (nlu.confidence < MIN_CREATE_CONFIDENCE) {
      const example = EXAMPLES[nlu.intent] ?? EXAMPLES.CREATE_EXPENSE;
      const pct = Math.round(nlu.confidence * 100);
      return t(
        lang,
        `I'm not sure what you mean (${pct}% sure), and I don't want to record it wrongly. Please say it again, e.g. "${example}".`,
        `I no too sure about wetin you mean (${pct}% sure), so I no wan enter am wrong. Abeg say am again, e.g. "${example}".`
      );
    }

    const resolved = resolveAction(nlu.intent, nlu.entities, context, text, lang);
    const missing = findMissing(resolved);
    if (missing.length > 0) {
      return askForMissing(nlu.intent, missing, lang);
    }
    return createPendingAction(opts.farmId, text, nlu, resolved);
  }

  return unknownReply(lang);
}

export async function processInput(opts: ProcessInputOptions): Promise<string> {
  const text = opts.text.trim();
  if (!text) return "I did not catch anything. Please type your message again.";

  let reply: string;
  try {
    // A plain "yes" or "no" answers the open "save this?" question. No AI call needed (cheaper and faster).
    const pending = await getPendingAction(opts.farmId);
    if (pending && (isAffirmative(text) || isNegative(text))) {
      reply = await confirmAction(pending.id, opts.farmId, isAffirmative(text));
    } else {
      reply = await routeInput(opts, text);
    }
  } catch (err) {
    if (err instanceof MlServiceError) {
      reply = err.message;
    } else {
      throw err;
    }
  }

  try {
    await prisma.aiConversation.create({
      data: {
        userId: opts.userId,
        farmId: opts.farmId,
        channel: opts.channel,
        message: opts.text,
        response: reply,
      },
    });
  } catch (err) {
    logger.error({ err, farmId: opts.farmId }, "Failed to persist AI conversation");
  }

  return reply;
}

export async function getPendingAction(farmId: string) {
  return prisma.aiActionLog.findFirst({
    where: { farmId, confirmationStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

async function findBatchId(farmId: string, livestockType?: LivestockType): Promise<string | null> {
  if (!livestockType) return null;
  const batch = await prisma.batch.findFirst({
    where: { farmId, livestockType, status: "ACTIVE" },
    orderBy: { purchaseDate: "desc" },
    select: { id: true },
  });
  return batch?.id ?? null;
}

async function adjustInventory(
  tx: Prisma.TransactionClient,
  farmId: string,
  type: LivestockType,
  delta: number
): Promise<void> {
  const row = await tx.livestock.findFirst({
    where: { farmId, type, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  if (!row) {
    if (delta > 0) {
      await tx.livestock.create({ data: { farmId, type, quantity: delta } });
    }
    return;
  }

  await tx.livestock.update({
    where: { id: row.id },
    data: { quantity: Math.max(0, row.quantity + delta) },
  });
}

async function executeAction(
  farmId: string,
  data: ResolvedAction
): Promise<{ id: string; message: string }> {
  const date = new Date(data.date);

  switch (data.intent) {
    case "CREATE_EXPENSE": {
      const category = data.category ?? "OTHER";
      const expense = await prisma.expense.create({
        data: {
          farmId,
          batchId: await findBatchId(farmId, data.livestockType),
          category,
          amount: data.amount ?? 0,
          currency: "NGN",
          description: data.description,
          date,
        },
      });
      return {
        id: expense.id,
        message: t(
          data.lang,
          `Done! I saved the expense of ${naira(data.amount ?? 0)} for ${category.toLowerCase().replace(/_/g, " ")}.`,
          `Done! I don save the expense of ${naira(data.amount ?? 0)} for ${category.toLowerCase().replace(/_/g, " ")}.`
        ),
      };
    }

    case "CREATE_SALE": {
      const type = data.livestockType;
      if (!type) throw new Error("Sale resolved without livestock type");
      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            farmId,
            batchId: await findBatchId(farmId, type),
            livestockType: type,
            quantity: data.quantity ?? 0,
            amount: data.amount ?? 0,
            buyer: data.buyer,
            date,
          },
        });
        await adjustInventory(tx, farmId, type, -(data.quantity ?? 0));
        return created;
      });
      return {
        id: sale.id,
        message: t(
          data.lang,
          `Done! I recorded the sale of ${animals(type, data.quantity ?? 0)} for ${naira(data.amount ?? 0)}.`,
          `Done! I don record the sale of ${animals(type, data.quantity ?? 0)} for ${naira(data.amount ?? 0)}.`
        ),
      };
    }

    case "CREATE_LIVESTOCK": {
      const type = data.livestockType;
      if (!type) throw new Error("Livestock intake resolved without type");
      const quantity = data.quantity ?? 0;
      const name =
        data.name?.trim() ||
        `${type.charAt(0) + type.slice(1).toLowerCase()} batch - ${date.toLocaleDateString("en-NG")}`;
      const batch = await prisma.$transaction(async (tx) => {
        const created = await tx.batch.create({
          data: {
            farmId,
            livestockType: type,
            name,
            quantity,
            purchaseDate: date,
            purchaseCost: data.amount ?? 0,
          },
        });
        await adjustInventory(tx, farmId, type, quantity);
        return created;
      });
      return {
        id: batch.id,
        message: t(
          data.lang,
          `Done! I recorded ${animals(type, quantity)} in "${name}".`,
          `Done! I don record ${animals(type, quantity)} into "${name}".`
        ),
      };
    }

    case "CREATE_FEED_RECORD": {
      const feedType = data.feedType ?? "General feed";
      const record = await prisma.feedRecord.create({
        data: {
          farmId,
          batchId: await findBatchId(farmId, data.livestockType),
          feedType,
          quantity: data.quantity ?? 0,
          cost: data.amount ?? 0,
          date,
        },
      });
      return {
        id: record.id,
        message: t(
          data.lang,
          `Done! Feed record saved: ${data.quantity ?? 0} unit(s) of ${feedType} (${naira(data.amount ?? 0)}).`,
          `Done! Feed record don enter: ${data.quantity ?? 0} unit(s) of ${feedType} (${naira(data.amount ?? 0)}).`
        ),
      };
    }

    case "CREATE_HEALTH_RECORD": {
      const result = await assessAndRecord(farmId, {
        symptoms: data.symptoms?.join("; ") ?? "Not stated",
        numberAffected: data.numberAffected ?? 1,
        mortality: data.mortality ?? 0,
        species: data.livestockType?.toLowerCase(),
      });
      return {
        id: result.record.id,
        message: `${t(data.lang, "Done! I saved the health record.", "Done! I don save the health record.")}\n\n${result.text}`,
      };
    }

    default:
      throw new Error(`Unsupported intent: ${data.intent}`);
  }
}

export async function confirmAction(
  actionLogId: string,
  farmId: string,
  isConfirmed: boolean
): Promise<string> {
  const log = await prisma.aiActionLog.findFirst({ where: { id: actionLogId, farmId } });
  if (!log) {
    throw ApiError.notFound("I could not find that action.");
  }

  const lang: Lang = (log.extractedEntities as { lang?: Lang } | null)?.lang ?? DEFAULT_LANG;

  if (log.confirmationStatus !== "PENDING") {
    switch (log.confirmationStatus) {
      case "EXECUTED":
        return t(lang, "That one was already saved. Nothing new was done.", "That one don already save before. Nothing new dey do there.");
      case "REJECTED":
        return t(lang, "You already cancelled that one. Nothing was recorded.", "You don cancel that one before. Nothing enter your record.");
      default:
        return t(lang, "That action is no longer waiting for confirmation.", "That action no dey wait for confirmation again.");
    }
  }

  if (!isConfirmed) {
    await prisma.aiActionLog.update({
      where: { id: log.id },
      data: { confirmationStatus: "REJECTED" },
    });
    return t(lang, "No problem, I cancelled it. Nothing was recorded.", "No wahala, I cancel am. Nothing don enter your record.");
  }

  const resolved = log.extractedEntities as unknown as ResolvedAction;

  try {
    await prisma.aiActionLog.update({
      where: { id: log.id },
      data: { confirmationStatus: "CONFIRMED" },
    });

    const result = await executeAction(log.farmId, resolved);

    await prisma.aiActionLog.update({
      where: { id: log.id },
      data: {
        confirmationStatus: "EXECUTED",
        actionTaken: `${log.actionTaken} [saved:${result.id}]`,
      },
    });

    await evaluateFarm(log.farmId);
    return result.message;
  } catch (err) {
    logger.error(
      { err, actionLogId: log.id, intent: log.detectedIntent },
      "Failed to execute AI action"
    );
    await prisma.aiActionLog
      .update({ where: { id: log.id }, data: { confirmationStatus: "PENDING" } })
      .catch(() => undefined);
    throw ApiError.serviceUnavailable(
      t(lang, "I can't save that right now. Please try again in a short while.", "I no fit save am now. Abeg try again in a short while.")
    );
  }
}

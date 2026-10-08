import type { LivestockType, MovementReason, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/apiError";

const DAY_MS = 24 * 60 * 60 * 1000;

export const LIVESTOCK_TYPES: LivestockType[] = ["POULTRY", "GOAT", "SHEEP", "CATTLE", "PIG", "RABBIT", "FISH"];

const ALIASES: Array<[RegExp, LivestockType]> = [
  [/broiler|chicken|layer|poultry|bird|fowl|egg/, "POULTRY"],
  [/goat/, "GOAT"],
  [/sheep|ram|ewe/, "SHEEP"],
  [/cow|cattle|fulani|ox|bullock/, "CATTLE"],
  [/pig|hog|boar/, "PIG"],
  [/rabbit|bunny/, "RABBIT"],
  [/fish|catfish|tilapia|clarias/, "FISH"],
];

/** "goat", "GOATS", "broilers" -> a LivestockType, or undefined when it is not an animal we know. */
export function parseLivestockType(raw?: string | null): LivestockType | undefined {
  const text = raw?.trim().toLowerCase();
  if (!text) return undefined;
  const direct = LIVESTOCK_TYPES.find((type) => type.toLowerCase() === text);
  if (direct) return direct;
  for (const [pattern, type] of ALIASES) if (pattern.test(text)) return type;
  return undefined;
}

/**
 * Change the number of animals of one type and write it to the movement log, in the caller's transaction.
 * Returns the change that was really applied: removing more animals than exist only goes down to zero.
 */
export async function adjustInventory(
  tx: Prisma.TransactionClient,
  farmId: string,
  type: LivestockType,
  delta: number,
  reason: MovementReason,
  note?: string
): Promise<{ applied: number; remaining: number }> {
  const row = await tx.livestock.findFirst({
    where: { farmId, type, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  let applied = 0;
  let remaining = 0;

  if (!row) {
    if (delta > 0) {
      await tx.livestock.create({ data: { farmId, type, quantity: delta } });
      applied = delta;
      remaining = delta;
    }
  } else {
    remaining = Math.max(0, row.quantity + delta);
    applied = remaining - row.quantity;
    await tx.livestock.update({ where: { id: row.id }, data: { quantity: remaining } });
  }

  if (applied !== 0) {
    await tx.livestockMovement.create({
      data: { farmId, livestockType: type, change: applied, reason, note: note?.slice(0, 200) },
    });
  }
  return { applied, remaining };
}

/** How many animals of one type the farm has right now. */
export async function countOf(farmId: string, type: LivestockType): Promise<number> {
  const agg = await prisma.livestock.aggregate({
    where: { farmId, type, status: "ACTIVE" },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

/** Take animals off the farm for a reason other than a sale (died, lost, eaten). Fails if there are not enough. */
export async function removeLivestock(
  farmId: string,
  input: { type: LivestockType; quantity: number; reason: "DEATH" | "LOST" | "CONSUMED"; note?: string }
) {
  return prisma.$transaction(async (tx) => {
    const agg = await tx.livestock.aggregate({
      where: { farmId, type: input.type, status: "ACTIVE" },
      _sum: { quantity: true },
    });
    const available = agg._sum.quantity ?? 0;
    if (input.quantity > available) {
      throw ApiError.badRequest(
        `You only have ${available} ${input.type.toLowerCase()} on record, so I cannot remove ${input.quantity}.`
      );
    }
    return adjustInventory(tx, farmId, input.type, -input.quantity, input.reason, input.note);
  });
}

export interface InventoryTypeRow {
  type: LivestockType;
  quantity: number;
  batches: Array<{ id: string; name: string; quantity: number; purchaseDate: Date; purchaseCost: number; status: string }>;
}

/** Everything the Inventory page shows: counts per animal type, the groups behind them, and the recent changes. */
export async function getInventory(farmId: string) {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [stock, batches, movements, last30] = await Promise.all([
    prisma.livestock.groupBy({
      by: ["type"],
      where: { farmId, status: "ACTIVE" },
      _sum: { quantity: true },
    }),
    prisma.batch.findMany({
      where: { farmId },
      orderBy: { purchaseDate: "desc" },
      take: 100,
      select: { id: true, name: true, livestockType: true, quantity: true, purchaseDate: true, purchaseCost: true, status: true },
    }),
    prisma.livestockMovement.findMany({
      where: { farmId },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, livestockType: true, change: true, reason: true, note: true, createdAt: true },
    }),
    prisma.livestockMovement.groupBy({
      by: ["reason"],
      where: { farmId, createdAt: { gte: since } },
      _sum: { change: true },
    }),
  ]);

  const types: InventoryTypeRow[] = stock
    .map((row) => ({
      type: row.type,
      quantity: row._sum.quantity ?? 0,
      batches: batches
        .filter((b) => b.livestockType === row.type)
        .map((b) => ({
          id: b.id,
          name: b.name,
          quantity: b.quantity,
          purchaseDate: b.purchaseDate,
          purchaseCost: Number(b.purchaseCost),
          status: b.status,
        })),
    }))
    .sort((a, b) => b.quantity - a.quantity);

  const totals = Object.fromEntries(last30.map((row) => [row.reason, row._sum.change ?? 0]));
  return {
    total: types.reduce((sum, row) => sum + row.quantity, 0),
    types,
    movements,
    last30Days: {
      added: (totals.PURCHASE ?? 0) + (totals.ADDED ?? 0),
      sold: Math.abs(totals.SALE ?? 0),
      died: Math.abs(totals.DEATH ?? 0),
      otherRemoved: Math.abs((totals.LOST ?? 0) + (totals.CONSUMED ?? 0)),
    },
  };
}

/** Deaths recorded in the last `days` days, for the dashboard's mortality alert. */
export async function getMortality(farmId: string, days = 7) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await prisma.livestockMovement.groupBy({
    by: ["livestockType"],
    where: { farmId, reason: "DEATH", createdAt: { gte: since } },
    _sum: { change: true },
  });
  const byType = rows
    .map((row) => ({ type: row.livestockType, quantity: Math.abs(row._sum.change ?? 0) }))
    .filter((row) => row.quantity > 0);
  return { days, total: byType.reduce((sum, row) => sum + row.quantity, 0), byType };
}

export type ActivityKind = "SALE" | "EXPENSE" | "PURCHASE" | "DEATH" | "REMOVED" | "ADDED";

export interface ActivityRow {
  id: string;
  at: Date;
  kind: ActivityKind;
  /** Animal type, expense category, or null */
  subject: string | null;
  quantity: number | null;
  amount: number | null;
  note: string | null;
}

/** The latest sales, expenses and animal changes in one list, newest first (dashboard Recent activity table). */
export async function getRecentActivity(farmId: string, limit = 8): Promise<ActivityRow[]> {
  const [sales, expenses, movements] = await Promise.all([
    prisma.sale.findMany({ where: { farmId }, orderBy: { date: "desc" }, take: limit }),
    prisma.expense.findMany({ where: { farmId }, orderBy: { date: "desc" }, take: limit }),
    prisma.livestockMovement.findMany({
      // Sales already show with their amount, so their movement would only repeat the row.
      where: { farmId, reason: { not: "SALE" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const rows: ActivityRow[] = [
    ...sales.map<ActivityRow>((s) => ({
      id: `sale-${s.id}`,
      at: s.date,
      kind: "SALE",
      subject: s.livestockType,
      quantity: s.quantity,
      amount: Number(s.amount),
      note: s.buyer,
    })),
    ...expenses.map<ActivityRow>((e) => ({
      id: `expense-${e.id}`,
      at: e.date,
      kind: "EXPENSE",
      subject: e.category,
      quantity: null,
      amount: Number(e.amount),
      note: e.description,
    })),
    ...movements.map<ActivityRow>((m) => ({
      id: `move-${m.id}`,
      at: m.createdAt,
      kind:
        m.reason === "DEATH" ? "DEATH" : m.reason === "PURCHASE" ? "PURCHASE" : m.reason === "ADDED" ? "ADDED" : "REMOVED",
      subject: m.livestockType,
      quantity: Math.abs(m.change),
      amount: null,
      note: m.note,
    })),
  ];

  return rows.sort((a, b) => +b.at - +a.at).slice(0, limit);
}

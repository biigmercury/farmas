import { api, backendConfigured, ApiError } from "@/lib/api";
import { getFarmId } from "@/lib/session";
import type {
  ActivityKind,
  ActivityVM,
  AlertVM,
  BatchVM,
  DashboardVM,
  FinanceVM,
  InventoryVM,
  LivestockVM,
  MoneyRow,
  MovementVM,
  Severity,
  TaskVM,
  TypeCount,
} from "@/lib/types";
import * as demo from "@/lib/demo-data";

// Everything the screens read. Contract: api/docs/API.md.
// With NEXT_PUBLIC_API_URL set these call the real API; without it they return the built-in demo farm.

const LIST = "?limit=100";

const TYPE_LABEL: Record<string, string> = {
  POULTRY: "Poultry", GOAT: "Goats", SHEEP: "Sheep", CATTLE: "Cattle", PIG: "Pigs", RABBIT: "Rabbits", FISH: "Fish",
};

const typeLabel = (t: string) => TYPE_LABEL[t] ?? t.charAt(0) + t.slice(1).toLowerCase();

// "20 birds", "1 goat", "5 sheep": what a farmer would say, not the category name ("20 poultry").
const ANIMAL_WORD: Record<string, [string, string]> = {
  POULTRY: ["bird", "birds"], GOAT: ["goat", "goats"], SHEEP: ["sheep", "sheep"], CATTLE: ["cattle", "cattle"],
  PIG: ["pig", "pigs"], RABBIT: ["rabbit", "rabbits"], FISH: ["fish", "fish"],
};
const animals = (type: string, n: number) => {
  const [one, many] = ANIMAL_WORD[type] ?? ["animal", "animals"];
  return `${n} ${n === 1 ? one : many}`;
};

/** "LABOUR_COSTS" -> "Labour costs" */
export function prettyCategory(c: string): string {
  const s = c.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function farmPath(suffix: string): string {
  const id = getFarmId();
  if (!id) throw new ApiError("Set up your farm first.");
  return `/api/farms/${id}${suffix}`;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const severity = (s: string): Severity => (s === "LOW_RISK" ? "LOW" : (s as Severity));

// ---------------------------------------------------------------------------------------------
// raw API shapes (only the fields we use)

type RawAlert = { id: string; severity: string; title: string; description?: string | null; status?: string };
type RawTask = { id: string; title: string; description?: string | null; dueDate: string; category: string; status: string };
type RawExpense = { id: string; category: string; amount: string | number; description?: string | null; date: string };
type RawSale = { id: string; livestockType: string; quantity: number; amount: string | number; buyer?: string | null; date: string };
type RawBatch = { id: string; name: string; livestockType: string; quantity: number; purchaseCost: string | number; purchaseDate: string; status: string };

const toAlert = (a: RawAlert): AlertVM => ({
  id: a.id, severity: severity(a.severity), title: a.title, detail: a.description ?? "",
});

const toTask = (t: RawTask): TaskVM => ({
  id: t.id, title: t.title, description: t.description ?? "", dueDate: t.dueDate, category: t.category, done: t.status === "DONE",
});

// ---------------------------------------------------------------------------------------------

type RawActivity = {
  id: string;
  at: string;
  kind: ActivityKind;
  subject: string | null;
  quantity: number | null;
  amount: number | null;
  note: string | null;
};

function toActivity(a: RawActivity): ActivityVM {
  const subject = a.subject ?? "";
  const n = a.quantity ?? 0;
  const title =
    a.kind === "SALE" ? `${animals(subject, n)} sold`
    : a.kind === "EXPENSE" ? `${prettyCategory(subject || "Other")} expense`
    : a.kind === "PURCHASE" ? `${animals(subject, n)} bought`
    : a.kind === "DEATH" ? `${animals(subject, n)} died`
    : a.kind === "ADDED" ? `${animals(subject, n)} added`
    : `${animals(subject, n)} removed`;
  return { id: a.id, at: a.at, kind: a.kind, title, detail: a.note ?? "", amount: a.amount };
}

export async function loadDashboard(): Promise<DashboardVM> {
  if (!backendConfigured) return demoDashboard();

  const d = await api<{
    farm: { name: string; location?: string | null };
    totalLivestock: number;
    livestockByType: { type: string; quantity: number }[];
    revenue: number;
    expenses: number;
    estimatedProfit: number;
    activeAlerts: RawAlert[];
    upcomingTasks: RawTask[];
    mortality?: { days: number; total: number; byType: { type: string; quantity: number }[] };
    activity?: RawActivity[];
  }>(farmPath("/dashboard"));

  return {
    farmName: d.farm.name,
    location: d.farm.location ?? "",
    totalLivestock: d.totalLivestock,
    livestockByType: d.livestockByType.map((x) => ({ type: x.type, label: typeLabel(x.type), qty: x.quantity })),
    revenue: d.revenue,
    expenses: d.expenses,
    profit: d.estimatedProfit,
    alerts: d.activeAlerts.map(toAlert),
    tasks: d.upcomingTasks.map(toTask),
    mortality: {
      days: d.mortality?.days ?? 7,
      total: d.mortality?.total ?? 0,
      byType: (d.mortality?.byType ?? []).map((x) => ({ type: x.type, label: typeLabel(x.type), qty: x.quantity })),
    },
    activity: (d.activity ?? []).map(toActivity),
  };
}

export async function loadLivestock(): Promise<LivestockVM> {
  if (!backendConfigured) return demoLivestock();

  const [stock, batches] = await Promise.all([
    api<{ livestock: { type: string; quantity: number; status: string }[] }>(farmPath(`/livestock${LIST}`)),
    api<{ batches: RawBatch[] }>(farmPath(`/batches${LIST}`)),
  ]);

  const counts = new Map<string, number>();
  for (const s of stock.livestock) if (s.status === "ACTIVE") counts.set(s.type, (counts.get(s.type) ?? 0) + s.quantity);
  const byType: TypeCount[] = [...counts].map(([type, qty]) => ({ type, label: typeLabel(type), qty }));

  const rows: BatchVM[] = batches.batches.map((b) => ({
    id: b.id,
    name: b.name,
    typeLabel: typeLabel(b.livestockType),
    qty: b.quantity,
    status: b.status === "ACTIVE" ? "Active" : b.status === "COMPLETED" ? "Completed" : "Archived",
    purchaseCost: num(b.purchaseCost),
    date: b.purchaseDate,
  }));
  return { byType, batches: rows };
}

export async function loadFinance(): Promise<FinanceVM> {
  if (!backendConfigured) return demoFinance();

  const [ex, sa] = await Promise.all([
    api<{ expenses: RawExpense[]; total: number; sumAmount: number }>(farmPath(`/expenses${LIST}`)),
    api<{ sales: RawSale[]; total: number; sumAmount: number }>(farmPath(`/sales${LIST}`)),
  ]);

  const byCat = new Map<string, number>();
  for (const e of ex.expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + num(e.amount));
  const breakdown = [...byCat]
    .map(([category, amount]) => ({ category: prettyCategory(category), amount }))
    .sort((a, b) => b.amount - a.amount);

  const revenue = sa.sumAmount;
  const expenses = ex.sumAmount;
  const profit = revenue - expenses;

  const expenseRows: MoneyRow[] = ex.expenses.map((e) => ({
    id: e.id, label: prettyCategory(e.category), detail: e.description ?? "", amount: num(e.amount), date: e.date,
  }));
  const salesRows: MoneyRow[] = sa.sales.map((s) => ({
    id: s.id,
    label: animals(s.livestockType, s.quantity),
    detail: s.buyer ? `Sold to ${s.buyer}` : "Sale",
    amount: num(s.amount),
    date: s.date,
  }));

  return {
    revenue,
    expenses,
    profit,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 100) : null,
    breakdown,
    sales: salesRows,
    expenseRows,
    truncated: ex.total > ex.expenses.length,
  };
}

const REASON_LABEL: Record<string, string> = {
  PURCHASE: "Bought", SALE: "Sold", DEATH: "Died", LOST: "Lost or stolen", CONSUMED: "Eaten at home", ADDED: "Added", ADJUSTMENT: "Adjusted",
};

export async function loadInventory(): Promise<InventoryVM> {
  if (!backendConfigured) return demoInventory();

  const r = await api<{
    total: number;
    types: {
      type: string;
      quantity: number;
      batches: { id: string; name: string; quantity: number; purchaseDate: string }[];
    }[];
    movements: { id: string; livestockType: string; change: number; reason: string; note: string | null; createdAt: string }[];
    last30Days: { added: number; sold: number; died: number; otherRemoved: number };
  }>(farmPath("/inventory"));

  const movements: MovementVM[] = r.movements.map((m) => ({
    id: m.id,
    label: animals(m.livestockType, Math.abs(m.change)),
    reason: REASON_LABEL[m.reason] ?? m.reason,
    note: m.note ?? "",
    at: m.createdAt,
    positive: m.change > 0,
  }));

  return {
    total: r.total,
    types: r.types.map((t) => ({
      type: t.type,
      label: typeLabel(t.type),
      qty: t.quantity,
      groups: t.batches.map((b) => ({ id: b.id, name: b.name, qty: b.quantity, date: b.purchaseDate })),
    })),
    movements,
    last30: r.last30Days,
  };
}

/** The API's animal type names, for the add/remove forms. */
export const ANIMAL_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

export async function addAnimals(input: { type: string; quantity: number; name?: string }): Promise<void> {
  if (!backendConfigured) return;
  await api(farmPath("/livestock"), {
    method: "POST",
    body: JSON.stringify({ type: input.type, quantity: input.quantity, ...(input.name ? { name: input.name } : {}) }),
  });
}

export async function removeAnimals(input: {
  type: string;
  quantity: number;
  reason: "DEATH" | "LOST" | "CONSUMED";
  note?: string;
}): Promise<{ removed: number; remaining: number }> {
  if (!backendConfigured) return { removed: input.quantity, remaining: 0 };
  return api(farmPath("/inventory/remove"), {
    method: "POST",
    body: JSON.stringify({ ...input, ...(input.note ? { note: input.note } : {}) }),
  });
}

export async function loadAlerts(): Promise<AlertVM[]> {
  if (!backendConfigured) return demo.alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, detail: a.detail }));
  const r = await api<{ alerts: RawAlert[] }>(farmPath(`/alerts${LIST}`));
  return r.alerts.filter((a) => a.status !== "RESOLVED").map(toAlert);
}

export async function resolveAlert(id: string): Promise<void> {
  if (!backendConfigured) return;
  await api(farmPath(`/alerts/${id}`), { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) });
}

export async function loadTasks(): Promise<TaskVM[]> {
  if (!backendConfigured) return demoTasks();
  const r = await api<{ tasks: RawTask[] }>(farmPath(`/tasks${LIST}`));
  return r.tasks.map(toTask);
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  if (!backendConfigured) return;
  await api(farmPath(`/tasks/${id}`), { method: "PATCH", body: JSON.stringify({ status: done ? "DONE" : "PENDING" }) });
}

// ---------------------------------------------------------------------------------------------
// Built-in demo data (no backend configured)

function demoDashboard(): DashboardVM {
  return {
    farmName: demo.farm.name,
    location: demo.farm.location,
    totalLivestock: demo.livestock.reduce((s, l) => s + l.qty, 0),
    livestockByType: demo.livestock.map((l) => ({ type: l.type.toUpperCase(), label: l.type, qty: l.qty })),
    revenue: demo.totals.revenue,
    expenses: demo.totals.expenses,
    profit: demo.totals.profit,
    alerts: demo.alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, detail: a.detail })),
    tasks: demoTasks().slice(0, 3),
    mortality: { days: 7, total: 3, byType: [{ type: "POULTRY", label: "Poultry", qty: 3 }] },
    activity: demoActivity(),
  };
}

function demoActivity(): ActivityVM[] {
  const day = 86_400_000;
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
  return [
    { id: "d1", at: at(0), kind: "SALE", title: "20 birds sold", detail: "", amount: 72_000 },
    { id: "d2", at: at(1), kind: "DEATH", title: "3 birds died", detail: "Coughing", amount: null },
    { id: "d3", at: at(2), kind: "EXPENSE", title: "Feed expense", detail: "", amount: 80_000 },
    { id: "d4", at: at(4), kind: "PURCHASE", title: "10 goats bought", detail: "", amount: null },
  ];
}

function demoInventory(): InventoryVM {
  const types = demo.livestock.map((l) => ({
    type: l.type.toUpperCase(), label: l.type, qty: l.qty, groups: [{ id: l.id, name: l.name, qty: l.qty, date: new Date().toISOString() }],
  }));
  return {
    total: types.reduce((sum, t) => sum + t.qty, 0),
    types,
    movements: [
      { id: "m1", label: "3 birds", reason: "Died", note: "Coughing", at: new Date(Date.now() - 86_400_000).toISOString(), positive: false },
      { id: "m2", label: "10 goats", reason: "Bought", note: "", at: new Date(Date.now() - 4 * 86_400_000).toISOString(), positive: true },
    ],
    last30: { added: 10, sold: 20, died: 3, otherRemoved: 0 },
  };
}

function demoLivestock(): LivestockVM {
  return {
    byType: demo.livestock.map((l) => ({ type: l.type.toUpperCase(), label: l.type, qty: l.qty })),
    batches: demo.livestock.map((l) => ({
      id: l.id, name: l.name, typeLabel: l.type, qty: l.qty,
      status: l.status === "Watch" ? "Active · watch" : "Active", purchaseCost: 0, date: new Date().toISOString(),
    })),
  };
}

function demoFinance(): FinanceVM {
  const total = demo.expenseBreakdown.reduce((s, e) => s + e.amount, 0);
  return {
    revenue: demo.totals.revenue,
    expenses: total,
    profit: demo.totals.revenue - total,
    marginPct: Math.round(((demo.totals.revenue - total) / demo.totals.revenue) * 100),
    breakdown: demo.expenseBreakdown,
    sales: [],
    expenseRows: [],
    truncated: false,
  };
}

function demoTasks(): TaskVM[] {
  const day = 86_400_000;
  const mk = (id: string, title: string, category: string, inDays: number): TaskVM => ({
    id, title, description: "", category, dueDate: new Date(Date.now() + inDays * day).toISOString(), done: false,
  });
  return [
    mk("t1", "Vaccinate Goat Herd 001", "VACCINATION", 1),
    mk("t2", "Clean broiler pens", "CLEANING", 2),
    mk("t3", "Order starter feed", "FEEDING", 4),
  ];
}

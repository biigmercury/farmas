import { api, backendConfigured, ApiError } from "@/lib/api";
import { getFarmId } from "@/lib/session";
import type {
  AlertVM,
  BatchVM,
  DashboardVM,
  FinanceVM,
  LivestockVM,
  MoneyRow,
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

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

// ---------------------------------------------------------------------------------------------

export async function loadDashboard(): Promise<DashboardVM> {
  if (!backendConfigured) return demoDashboard();

  const [d, expenses, sales] = await Promise.all([
    api<{
      farm: { name: string; location?: string | null };
      totalLivestock: number;
      livestockByType: { type: string; quantity: number }[];
      revenue: number;
      expenses: number;
      estimatedProfit: number;
      activeAlerts: RawAlert[];
      upcomingTasks: RawTask[];
    }>(farmPath("/dashboard")),
    api<{ expenses: RawExpense[] }>(farmPath(`/expenses?limit=5`)),
    api<{ sales: RawSale[] }>(farmPath(`/sales?limit=5`)),
  ]);

  // Recent activity: the latest few expenses and sales, newest first.
  const events = [
    ...expenses.expenses.map((e) => ({
      at: e.date,
      text: `${prettyCategory(e.category)} expense · ${naira(num(e.amount))}`,
    })),
    ...sales.sales.map((s) => ({
      at: s.date,
      text: `${animals(s.livestockType, s.quantity)} sold · ${naira(num(s.amount))}`,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 5)
    .map((e) => `${e.text} (${dateLabel(e.at)})`);

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
    activity: events,
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

const naira = demo.naira;

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
    activity: demo.activity,
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

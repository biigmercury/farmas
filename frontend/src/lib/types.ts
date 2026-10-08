// What the screens show. The API (or the built-in demo data) is mapped into these shapes in
// services/farm-data.ts, so pages never depend on raw API fields.

export type Severity = "INFO" | "LOW" | "WARNING" | "CRITICAL";

export type AlertVM = { id: string; severity: Severity; title: string; detail: string };

export type TaskVM = {
  id: string;
  title: string;
  description: string;
  dueDate: string; // ISO
  category: string;
  done: boolean;
};

export type TypeCount = { type: string; label: string; qty: number };

export type DashboardVM = {
  farmName: string;
  location: string;
  totalLivestock: number;
  livestockByType: TypeCount[];
  revenue: number;
  expenses: number;
  profit: number;
  alerts: AlertVM[];
  tasks: TaskVM[];
  activity: string[];
};

export type BatchVM = {
  id: string;
  name: string;
  typeLabel: string;
  qty: number;
  status: string;
  purchaseCost: number;
  date: string;
};

export type LivestockVM = { byType: TypeCount[]; batches: BatchVM[] };

export type MoneyRow = { id: string; label: string; detail: string; amount: number; date: string };

export type FinanceVM = {
  revenue: number;
  expenses: number;
  profit: number;
  /** null when there is no revenue yet (a margin would be meaningless) */
  marginPct: number | null;
  breakdown: { category: string; amount: number }[];
  sales: MoneyRow[];
  expenseRows: MoneyRow[];
  /** true when there were more records than we loaded, so the breakdown covers only the latest ones */
  truncated: boolean;
};

export type ChatReply = { text: string; pending: { id: string; summary: string } | null };

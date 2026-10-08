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

export type ActivityKind = "SALE" | "EXPENSE" | "PURCHASE" | "DEATH" | "REMOVED" | "ADDED";

/** One line of the dashboard's Recent activity table. */
export type ActivityVM = {
  id: string;
  at: string; // ISO
  kind: ActivityKind;
  /** "30 birds sold", "Feed expense", "3 goats died" */
  title: string;
  /** Buyer, note or what it was for. May be empty. */
  detail: string;
  /** Money, when the row has some (sales and expenses). */
  amount: number | null;
};

export type MortalityVM = { days: number; total: number; byType: TypeCount[] };

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
  mortality: MortalityVM;
  activity: ActivityVM[];
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

export type ChatMode = "AGENT" | "CHAT";
export type ChatLanguage = "auto" | "english" | "pidgin";

export type VetVM = {
  name: string;
  phone: string | null;
  address: string | null;
  distanceKm: number;
  directionsUrl: string;
};

export type ChatReply = {
  text: string;
  pending: { id: string; summary: string } | null;
  sessionId?: string;
  vets?: VetVM[] | null;
  searchUrl?: string | null;
  /** The app should ask the phone for its location and send the same message again. */
  needsLocation?: boolean;
};

export type SessionSummary = { id: string; title: string; mode: ChatMode; updatedAt: string; messageCount: number };

export type StoredMessage = { id: string; who: "you" | "farmas"; text: string };

export type MovementVM = { id: string; label: string; reason: string; note: string; at: string; positive: boolean };

export type InventoryVM = {
  total: number;
  types: { type: string; label: string; qty: number; groups: { id: string; name: string; qty: number; date: string }[] }[];
  movements: MovementVM[];
  last30: { added: number; sold: number; died: number; otherRemoved: number };
};

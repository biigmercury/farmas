"use client";

import Link from "next/link";
import { Button, Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { naira } from "@/lib/demo-data";
import type { ActivityKind } from "@/lib/types";
import { loadDashboard } from "@/services/farm-data";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const dueLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

const KIND_STYLE: Record<ActivityKind, string> = {
  SALE: "bg-lime",
  EXPENSE: "bg-mist",
  PURCHASE: "bg-mist",
  ADDED: "bg-mist",
  DEATH: "bg-critical/15 text-critical",
  REMOVED: "bg-warn/15 text-warn",
};

const KIND_LABEL: Record<ActivityKind, string> = {
  SALE: "Sale", EXPENSE: "Expense", PURCHASE: "Bought", ADDED: "Added", DEATH: "Death", REMOVED: "Removed",
};

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync(loadDashboard);

  if (loading) return <Loading label="Loading your farm…" />;
  if (error || !data) return <ErrorBox message={error || "Could not load your farm."} onRetry={reload} />;

  const open = data.alerts.filter((a) => a.severity === "WARNING" || a.severity === "CRITICAL").length;

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2"><Tag>{greeting()}</Tag></p>
          <h1 className="h-display text-3xl lg:text-5xl">{data.farmName}</h1>
          {data.location && <p className="mt-3 text-forest/75">{data.location}</p>}
        </div>
        <Button href="/app/ai" variant="forest" className="hidden lg:inline-flex !min-h-12 !px-7">
          Ask FarmAs AI
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Livestock" value={data.totalLivestock.toLocaleString("en-NG")} />
        <Stat label="Revenue" value={naira(data.revenue)} />
        <Stat label="Expenses" value={naira(data.expenses)} />
        <Stat label="Est. profit" value={naira(data.profit)} dark />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="space-y-5">
          {open > 0 && (
            <Link
              href="/app/alerts"
              className="flex items-center justify-between rounded-2xl border border-warn/40 bg-white p-4"
            >
              <span className="font-bold text-warn">
                ⚠ {open} health alert{open > 1 ? "s" : ""}
              </span>
              <span className="label">View</span>
            </Link>
          )}
          {data.mortality.total > 0 && (
            <Link
              href="/app/health"
              className="block rounded-2xl border border-critical/40 bg-white p-4"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-bold text-critical">
                  ⚠ {data.mortality.total.toLocaleString("en-NG")} {data.mortality.total === 1 ? "animal" : "animals"} died in
                  the last {data.mortality.days} days
                </span>
                <span className="label shrink-0">Report</span>
              </span>
              <span className="mt-1 block text-sm text-forest/75">
                {data.mortality.byType.map((t) => `${t.label} ${t.qty}`).join(" · ")}. Tap to describe what you are
                seeing and get next steps.
              </span>
            </Link>
          )}
          <Card>
            <p className="label mb-3"><Tag>Recent activity</Tag></p>
            {data.activity.length === 0 ? (
              <p className="text-forest/75">
                Nothing yet. Tell FarmAs AI what happened today, like &ldquo;I sold 20 birds for 75k&rdquo;.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="label border-b border-forest/15">
                    <th scope="col" className="py-2 pr-3 font-normal">Date</th>
                    <th scope="col" className="py-2 pr-3 font-normal">Activity</th>
                    <th scope="col" className="py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-forest/10">
                  {data.activity.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap py-3 pr-3 align-top text-sm text-forest/75">{shortDate(a.at)}</td>
                      <td className="py-3 pr-3 align-top">
                        <span className="block">{a.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`label rounded-full px-2.5 py-0.5 text-[0.65rem] ${KIND_STYLE[a.kind]}`}>
                            {KIND_LABEL[a.kind]}
                          </span>
                          {a.detail && <span className="text-sm text-forest/65">{a.detail}</span>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 text-right align-top font-mono">
                        {a.amount === null ? <span className="text-forest/40">–</span> : naira(a.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <p className="label mb-3"><Tag>Livestock</Tag></p>
            {data.livestockByType.length === 0 ? (
              <p className="text-forest/75">No animals recorded yet.</p>
            ) : (
              <ul className="divide-y divide-forest/10">
                {data.livestockByType.map((l) => (
                  <li key={l.type} className="flex items-center justify-between py-3">
                    <span>{l.label}</span>
                    <span className="font-mono">{l.qty.toLocaleString("en-NG")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="label"><Tag>Coming up</Tag></p>
              <Link href="/app/tasks" className="label min-h-11 underline underline-offset-4">
                All tasks
              </Link>
            </div>
            {data.tasks.length === 0 ? (
              <p className="text-forest/75">No upcoming tasks.</p>
            ) : (
              <ul className="space-y-3">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex justify-between gap-4">
                    <span>{t.title}</span>
                    <span className="label shrink-0 opacity-70">{dueLabel(t.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Link
        href="/app/health"
        className="flex items-center justify-between rounded-2xl border border-forest/10 bg-white p-4 lg:p-5"
      >
        <span>
          <span className="block font-bold">Check animal health</span>
          <span className="mt-1 block text-sm text-forest/75">Describe symptoms, get a risk level and next steps</span>
        </span>
        <span className="label ml-4 shrink-0">Open</span>
      </Link>

      <Button href="/app/ai" variant="forest" className="w-full !min-h-14 !text-base lg:hidden">
        Ask FarmAs AI
      </Button>
    </div>
  );
}

function Stat({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 lg:p-6 ${dark ? "bg-forest text-lime" : "bg-white border border-forest/10"}`}>
      <p className="label opacity-70">{label}</p>
      <p className="mt-2 font-mono text-xl lg:text-3xl">{value}</p>
    </div>
  );
}

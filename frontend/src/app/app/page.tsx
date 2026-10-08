"use client";

import Link from "next/link";
import { Button, Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { naira } from "@/lib/demo-data";
import { loadDashboard } from "@/services/farm-data";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const dueLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });

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
          <Card>
            <p className="label mb-3"><Tag>Recent activity</Tag></p>
            {data.activity.length === 0 ? (
              <p className="text-forest/75">
                Nothing yet. Tell FarmAs AI what happened today, like &ldquo;I sold 20 birds for 75k&rdquo;.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.activity.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="text-leaf">•</span>
                    {a}
                  </li>
                ))}
              </ul>
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

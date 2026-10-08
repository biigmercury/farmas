"use client";

import { Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { naira } from "@/lib/demo-data";
import type { MoneyRow } from "@/lib/types";
import { loadFinance } from "@/services/farm-data";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

export default function Finance() {
  const { data, loading, error, reload } = useAsync(loadFinance);

  return (
    <div className="space-y-4">
      <h1 className="h-display text-3xl lg:text-5xl">Finance</h1>

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox message={error || "Could not load your finances."} onRetry={reload} />}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-[2fr_3fr] lg:gap-6">
            <div className="rounded-2xl bg-forest p-5 text-lime lg:p-8">
              <p className="label opacity-70">{data.profit < 0 ? "Estimated loss" : "Estimated profit"}</p>
              <p className="mt-2 font-mono text-3xl">{naira(Math.abs(data.profit))}</p>
              <p className="label mt-2">
                {data.marginPct === null ? "No sales recorded yet" : `${data.marginPct}% margin`} · from recorded data
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-lime/20 pt-4">
                <div>
                  <dt className="label opacity-70">Revenue</dt>
                  <dd className="mt-1 font-mono">{naira(data.revenue)}</dd>
                </div>
                <div>
                  <dt className="label opacity-70">Expenses</dt>
                  <dd className="mt-1 font-mono">{naira(data.expenses)}</dd>
                </div>
              </dl>
            </div>

            <Card>
              <p className="label mb-4"><Tag>Expense breakdown</Tag></p>
              {data.breakdown.length === 0 ? (
                <p className="text-forest/75">No expenses yet. Tell FarmAs AI what you spent.</p>
              ) : (
                <ul className="space-y-4">
                  {data.breakdown.map((e) => {
                    const total = data.breakdown.reduce((s, x) => s + x.amount, 0);
                    const pct = total > 0 ? Math.round((e.amount / total) * 100) : 0;
                    return (
                      <li key={e.category}>
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <span>{e.category}</span>
                          <span className="font-mono">
                            {naira(e.amount)} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-mist" role="img" aria-label={`${e.category} ${pct}%`}>
                          <div className="h-2 rounded-full bg-leaf" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {data.truncated && (
                <p className="mt-4 text-sm text-forest/70">The breakdown covers your latest 100 expenses.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <Rows title="Recent sales" rows={data.sales} empty="No sales yet." />
            <Rows title="Recent expenses" rows={data.expenseRows} empty="No expenses yet." />
          </div>
        </>
      )}
    </div>
  );
}

function Rows({ title, rows, empty }: { title: string; rows: MoneyRow[]; empty: string }) {
  return (
    <Card>
      <p className="label mb-3"><Tag>{title}</Tag></p>
      {rows.length === 0 ? (
        <p className="text-forest/75">{empty}</p>
      ) : (
        <ul className="divide-y divide-forest/10">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block font-bold">{r.label}</span>
                <span className="mt-1 block text-sm text-forest/70">
                  {[r.detail, day(r.date)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 font-mono">{naira(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

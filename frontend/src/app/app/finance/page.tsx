"use client";

import { useState } from "react";
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

          <TaxEstimate revenue={data.revenue} expenses={data.expenses} profit={data.profit} />

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

/** A simple "how much tax might I owe?" estimate from the farmer's own profit. A prototype, not tax advice. */
function TaxEstimate({ revenue, expenses, profit }: { revenue: number; expenses: number; profit: number }) {
  const [rate, setRate] = useState("10");
  const [deductions, setDeductions] = useState("0");

  const pct = Math.min(100, Math.max(0, Number(rate) || 0));
  const extra = Math.max(0, Number(deductions.replace(/,/g, "")) || 0);
  const taxable = Math.max(0, profit - extra);
  const tax = Math.round((taxable * pct) / 100);
  const afterTax = profit - tax;

  return (
    <Card className="!p-5 lg:!p-6">
      <p className="label mb-1"><Tag>Tax estimate</Tag></p>
      <p className="text-forest/75">
        A quick estimate from your recorded profit. Change the rate to match your situation. Prototype only: this is not
        tax advice, so ask a tax adviser before you rely on it.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tax-rate" className="mb-2 block font-bold">Tax rate (%)</label>
          <input
            id="tax-rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
            className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
          />
          <p className="mt-1 text-sm text-forest/65">10 is only an example.</p>
        </div>
        <div>
          <label htmlFor="tax-ded" className="mb-2 block font-bold">
            Other deductions (₦) <span className="label ml-2 font-normal opacity-60">Optional</span>
          </label>
          <input
            id="tax-ded"
            inputMode="numeric"
            value={deductions}
            onChange={(e) => setDeductions(e.target.value.replace(/[^\d,]/g, "").slice(0, 14))}
            className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
          />
          <p className="mt-1 text-sm text-forest/65">Costs you did not record, taken off before tax.</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 rounded-2xl bg-mist p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Line label="Revenue" value={naira(revenue)} />
        <Line label="Expenses" value={naira(expenses)} />
        <Line label="Profit before tax" value={naira(profit)} />
        <Line label="Taxable amount" value={naira(taxable)} />
      </dl>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-forest p-4 text-lime">
          <p className="label opacity-70">Estimated tax</p>
          <p className="mt-1 font-mono text-2xl">{naira(tax)}</p>
        </div>
        <div className="rounded-2xl border border-forest/15 p-4">
          <p className="label opacity-70">Profit after tax</p>
          <p className="mt-1 font-mono text-2xl">{naira(afterTax)}</p>
        </div>
      </div>
      {profit <= 0 && (
        <p className="mt-3 text-sm text-forest/70">There is no profit on record yet, so the estimate is zero.</p>
      )}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label opacity-70">{label}</dt>
      <dd className="mt-1 font-mono">{value}</dd>
    </div>
  );
}

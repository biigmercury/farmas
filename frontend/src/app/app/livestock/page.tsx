"use client";

import { Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { naira } from "@/lib/demo-data";
import { loadLivestock } from "@/services/farm-data";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export default function Livestock() {
  const { data, loading, error, reload } = useAsync(loadLivestock);

  return (
    <div className="space-y-6">
      <h1 className="h-display text-3xl lg:text-5xl">Livestock</h1>

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox message={error || "Could not load your livestock."} onRetry={reload} />}

      {data && (
        <>
          {data.byType.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {data.byType.map((t) => (
                <li key={t.type} className="rounded-2xl border border-forest/10 bg-white p-4">
                  <p className="label opacity-70">{t.label}</p>
                  <p className="mt-2 font-mono text-2xl">{t.qty.toLocaleString("en-NG")}</p>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="label mb-3"><Tag>Batches and herds</Tag></p>
            {data.batches.length === 0 ? (
              <Card>No animals yet. Tell FarmAs AI what you bought and it will be added.</Card>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {data.batches.map((b) => (
                  <li key={b.id}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="label"><Tag>{b.typeLabel}</Tag></p>
                          <h2 className="mt-2 text-lg font-bold">{b.name}</h2>
                        </div>
                        <span className="text-right">
                          <span className="block font-mono text-2xl">{b.qty.toLocaleString("en-NG")}</span>
                          <span className="label mt-1 block opacity-60">at purchase</span>
                        </span>
                      </div>
                      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                        <span className={`label rounded-full px-3 py-1 ${b.status.startsWith("Active") ? "bg-lime" : "bg-mist"}`}>
                          {b.status}
                        </span>
                        <span className="text-forest/75">Added {day(b.date)}</span>
                        {b.purchaseCost > 0 && <span className="text-forest/75">Cost {naira(b.purchaseCost)}</span>}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

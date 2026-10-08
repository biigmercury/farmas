"use client";

import { useState } from "react";
import { Button, Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { ApiError } from "@/lib/api";
import { ANIMAL_OPTIONS, addAnimals, loadInventory, removeAnimals } from "@/services/farm-data";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

const REASONS = [
  { value: "DEATH", label: "Died" },
  { value: "LOST", label: "Lost or stolen" },
  { value: "CONSUMED", label: "Eaten at home" },
] as const;

type Panel = "none" | "add" | "remove";

export default function Inventory() {
  const { data, loading, error, reload } = useAsync(loadInventory);
  const [panel, setPanel] = useState<Panel>("none");
  const [type, setType] = useState("POULTRY");
  const [quantity, setQuantity] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("DEATH");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");

  function open(next: Panel) {
    setPanel(panel === next ? "none" : next);
    setFormError("");
    setDone("");
    setQuantity("");
    setName("");
  }

  async function submit() {
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < 1) {
      setFormError("Enter how many animals (1 or more).");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      if (panel === "add") {
        await addAnimals({ type, quantity: n, name: name.trim() || undefined });
        setDone(`Added ${n} to your inventory.`);
      } else {
        const r = await removeAnimals({ type, quantity: n, reason, note: name.trim() || undefined });
        setDone(`Removed ${r.removed}. ${r.remaining} left.`);
      }
      setQuantity("");
      setName("");
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2"><Tag>Inventory</Tag></p>
          <h1 className="h-display text-3xl lg:text-5xl">Your animals</h1>
          <p className="mt-3 max-w-2xl text-forest/80">
            Every animal you have right now. It updates when you tell FarmAs AI about a sale, a purchase or a death.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="forest" onClick={() => open("add")} aria-pressed={panel === "add"}>
            Add animals
          </Button>
          <Button type="button" variant="outline" onClick={() => open("remove")} aria-pressed={panel === "remove"}>
            Remove animals
          </Button>
        </div>
      </div>

      {panel !== "none" && (
        <Card className="!p-5">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="grid gap-4 md:grid-cols-2"
          >
            <div>
              <label htmlFor="inv-type" className="mb-2 block font-bold">Which animal?</label>
              <select
                id="inv-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
              >
                {ANIMAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="inv-qty" className="mb-2 block font-bold">How many?</label>
              <input
                id="inv-qty"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 10"
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
              />
            </div>
            {panel === "remove" && (
              <div className="md:col-span-2">
                <p className="mb-2 font-bold">What happened to them?</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Reason">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={reason === r.value}
                      onClick={() => setReason(r.value)}
                      className={`label min-h-11 rounded-full border px-4 ${reason === r.value ? "border-forest bg-lime" : "border-forest/25 bg-white"}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-forest/70">For a sale, tell FarmAs AI so the money is recorded too.</p>
              </div>
            )}
            <div className="md:col-span-2">
              <label htmlFor="inv-name" className="mb-2 block font-bold">
                {panel === "add" ? "Group name" : "Note"} <span className="label ml-2 font-normal opacity-60">Optional</span>
              </label>
              <input
                id="inv-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder={panel === "add" ? "e.g. Broilers October" : "e.g. coughing and off feed"}
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
              />
            </div>
            {formError && (
              <p role="alert" className="font-bold text-critical md:col-span-2">{formError}</p>
            )}
            {done && <p role="status" className="font-bold md:col-span-2">{done}</p>}
            <div className="md:col-span-2">
              <Button type="submit" variant="forest" disabled={busy} className="w-full md:w-auto !px-10">
                {busy ? "Saving…" : panel === "add" ? "Add to inventory" : "Remove from inventory"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox message={error || "Could not load your inventory."} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Animals now" value={data.total} dark />
            <Stat label="Added, 30 days" value={data.last30.added} />
            <Stat label="Sold, 30 days" value={data.last30.sold} />
            <Stat label="Died, 30 days" value={data.last30.died} warn={data.last30.died > 0} />
          </div>

          <div>
            <p className="label mb-3"><Tag>By animal</Tag></p>
            {data.types.length === 0 ? (
              <Card>No animals yet. Tap &ldquo;Add animals&rdquo; or tell FarmAs AI what you bought.</Card>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {data.types.map((t) => (
                  <li key={t.type}>
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-bold">{t.label}</h2>
                        <span className="font-mono text-2xl">{t.qty.toLocaleString("en-NG")}</span>
                      </div>
                      {t.groups.length > 0 && (
                        <ul className="mt-3 space-y-1 border-t border-forest/10 pt-3 text-sm text-forest/75">
                          {t.groups.slice(0, 4).map((g) => (
                            <li key={g.id} className="flex justify-between gap-3">
                              <span className="truncate">{g.name}</span>
                              <span className="shrink-0">{day(g.date)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Card>
            <p className="label mb-3"><Tag>Recent changes</Tag></p>
            {data.movements.length === 0 ? (
              <p className="text-forest/75">Nothing yet. Changes show here as you record sales, purchases and deaths.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left">
                  <thead>
                    <tr className="label border-b border-forest/15">
                      <th scope="col" className="py-2 pr-3 font-normal">Date</th>
                      <th scope="col" className="py-2 pr-3 font-normal">What</th>
                      <th scope="col" className="py-2 pr-3 font-normal">Why</th>
                      <th scope="col" className="py-2 text-right font-normal">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest/10">
                    {data.movements.slice(0, 20).map((m) => (
                      <tr key={m.id}>
                        <td className="py-3 pr-3 text-sm text-forest/75">{day(m.at)}</td>
                        <td className="py-3 pr-3">{m.label}</td>
                        <td className="py-3 pr-3 text-sm">
                          {m.reason}
                          {m.note && <span className="block text-forest/65">{m.note}</span>}
                        </td>
                        <td className={`py-3 text-right font-mono ${m.positive ? "text-leaf" : "text-warn"}`}>
                          {m.positive ? "+" : "−"}
                          {m.label.split(" ")[0]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, dark = false, warn = false }: { label: string; value: number; dark?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 lg:p-5 ${dark ? "bg-forest text-lime" : "border border-forest/10 bg-white"}`}>
      <p className="label opacity-70">{label}</p>
      <p className={`mt-2 font-mono text-2xl ${warn ? "text-warn" : ""}`}>{value.toLocaleString("en-NG")}</p>
    </div>
  );
}

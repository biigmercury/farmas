"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { ApiError } from "@/lib/api";
import type { Severity } from "@/lib/types";
import { loadAlerts, resolveAlert } from "@/services/farm-data";

const tone: Record<Severity, string> = {
  INFO: "bg-mist text-forest",
  LOW: "bg-lime text-forest",
  WARNING: "bg-warn/15 text-warn",
  CRITICAL: "bg-critical/15 text-critical",
};

export default function Alerts() {
  const { data, loading, error, reload } = useAsync(loadAlerts);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  async function resolve(id: string) {
    setBusyId(id);
    setActionError("");
    try {
      await resolveAlert(id);
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not update the alert. Please try again.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="h-display text-3xl lg:text-5xl">Alerts</h1>

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox message={error || "Could not load your alerts."} onRetry={reload} />}
      {actionError && (
        <p role="alert" className="text-sm font-bold text-critical">
          {actionError}
        </p>
      )}

      {data &&
        (data.length === 0 ? (
          <Card>All clear. FarmAs will alert you if something looks unusual.</Card>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
            {data.map((a) => (
              <li key={a.id}>
                <Card>
                  <span className={`label rounded-full px-3 py-1 ${tone[a.severity]}`}>{a.severity}</span>
                  <h2 className="mt-3 font-bold">{a.title}</h2>
                  {a.detail && <p className="mt-2 text-sm text-forest/80">{a.detail}</p>}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === a.id}
                    onClick={() => void resolve(a.id)}
                    className="mt-4"
                  >
                    {busyId === a.id ? "Saving…" : "Mark as handled"}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

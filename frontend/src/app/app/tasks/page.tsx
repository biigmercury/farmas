"use client";

import { useState } from "react";
import { Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { ApiError } from "@/lib/api";
import type { TaskVM } from "@/lib/types";
import { prettyCategory, loadTasks, setTaskDone } from "@/services/farm-data";

const due = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });

export default function Tasks() {
  const { data, loading, error, reload } = useAsync(loadTasks);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  async function toggle(t: TaskVM) {
    setBusyId(t.id);
    setActionError("");
    try {
      await setTaskDone(t.id, !t.done);
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not update the task. Please try again.");
    } finally {
      setBusyId("");
    }
  }

  const pending = (data ?? []).filter((t) => !t.done).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
  const done = (data ?? []).filter((t) => t.done);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-3xl lg:text-5xl">Tasks</h1>
        <p className="mt-3 max-w-2xl text-forest/75">
          Vaccinations, feeding, cleaning and vet visits. Tell FarmAs AI &ldquo;remind me to vaccinate the goats
          tomorrow&rdquo; to add one.
        </p>
      </div>

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox message={error || "Could not load your tasks."} onRetry={reload} />}
      {actionError && (
        <p role="alert" className="text-sm font-bold text-critical">
          {actionError}
        </p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TaskList title="To do" tasks={pending} empty="Nothing waiting. You are up to date." busyId={busyId} onToggle={toggle} />
          <TaskList title="Done" tasks={done} empty="Completed tasks will show here." busyId={busyId} onToggle={toggle} />
        </div>
      )}
    </div>
  );
}

function TaskList({
  title,
  tasks,
  empty,
  busyId,
  onToggle,
}: {
  title: string;
  tasks: TaskVM[];
  empty: string;
  busyId: string;
  onToggle: (t: TaskVM) => void;
}) {
  return (
    <Card>
      <p className="label mb-4"><Tag>{title}</Tag></p>
      {tasks.length === 0 ? (
        <p className="text-forest/75">{empty}</p>
      ) : (
        <ul className="divide-y divide-forest/10">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-3">
              <input
                id={`task-${t.id}`}
                type="checkbox"
                checked={t.done}
                disabled={busyId === t.id}
                onChange={() => onToggle(t)}
                className="mt-1 size-6 shrink-0 accent-forest"
              />
              <label htmlFor={`task-${t.id}`} className="block min-h-8 flex-1 cursor-pointer">
                <span className={`block font-bold ${t.done ? "line-through opacity-60" : ""}`}>{t.title}</span>
                <span className="mt-1 block text-sm text-forest/70">
                  {prettyCategory(t.category)} · {due(t.dueDate)}
                </span>
                {t.description && <span className="mt-1 block text-sm text-forest/70">{t.description}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Button, Card, Tag } from "@/components/ui";
import { ErrorBox, Loading } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { ApiError } from "@/lib/api";
import type { TaskVM } from "@/lib/types";
import { addTask, deleteTask, prettyCategory, loadTasks, setTaskDone } from "@/services/farm-data";

const due = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const CATEGORIES = [
  { value: "VACCINATION", label: "Vaccination" },
  { value: "MEDICATION", label: "Medication" },
  { value: "FEEDING", label: "Feeding" },
  { value: "CLEANING", label: "Cleaning" },
  { value: "VET_VISIT", label: "Vet visit" },
  { value: "SALES", label: "Sales" },
  { value: "GENERAL", label: "Other" },
];

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the farmer's own timezone

export default function Tasks() {
  const { data, loading, error, reload } = useAsync(loadTasks);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("VACCINATION");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [added, setAdded] = useState("");

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

  async function remove(t: TaskVM) {
    setBusyId(t.id);
    setActionError("");
    try {
      await deleteTask(t.id);
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not delete the task. Please try again.");
    } finally {
      setBusyId("");
    }
  }

  async function submit() {
    setFormError("");
    setAdded("");
    if (title.trim().length < 2) return setFormError("Give the reminder a name, for example: Vaccinate the goats.");
    if (!date) return setFormError("Pick the day you want to be reminded.");
    const when = new Date(`${date}T${time || "08:00"}`);
    if (Number.isNaN(when.getTime())) return setFormError("That date or time is not valid.");
    if (when.getTime() < Date.now()) return setFormError("That time has already passed. Pick a time in the future.");
    setAdding(true);
    try {
      await addTask({ title: title.trim(), dueDate: when, category });
      setAdded(`Saved. I will remind you on ${due(when.toISOString())}.`);
      setTitle("");
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not save the reminder. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  const pending = (data ?? []).filter((t) => !t.done).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
  const done = (data ?? []).filter((t) => t.done);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-3xl lg:text-5xl">Tasks and reminders</h1>
        <p className="mt-3 max-w-2xl text-forest/75">
          Vaccinations, feeding, cleaning and vet visits. When the time comes you get a notification in the bell, and on
          your phone if you turned notifications on. You can also tell FarmAs AI &ldquo;remind me to vaccinate the goats
          on Friday&rdquo;.
        </p>
      </div>

      <Card className="!p-5">
        <p className="label mb-4"><Tag>Add a reminder</Tag></p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
        >
          <div className="md:col-span-2 lg:col-span-1">
            <label htmlFor="rem-title" className="mb-2 block font-bold">What to remember</label>
            <input
              id="rem-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vaccinate the goats"
              className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
            />
          </div>
          <div>
            <label htmlFor="rem-cat" className="mb-2 block font-bold">Kind</label>
            <select
              id="rem-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rem-date" className="mb-2 block font-bold">Day</label>
            <input
              id="rem-date"
              type="date"
              min={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
            />
          </div>
          <div>
            <label htmlFor="rem-time" className="mb-2 block font-bold">Time</label>
            <input
              id="rem-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4"
            />
          </div>
          {formError && (
            <p role="alert" className="font-bold text-critical md:col-span-2 lg:col-span-4">{formError}</p>
          )}
          {added && <p role="status" className="font-bold md:col-span-2 lg:col-span-4">{added}</p>}
          <div className="md:col-span-2 lg:col-span-4">
            <Button type="submit" variant="forest" disabled={adding} className="w-full md:w-auto !px-10">
              {adding ? "Saving…" : "Save reminder"}
            </Button>
          </div>
        </form>
      </Card>

      {loading && <Loading />}
      {!loading && (error || !data) && <ErrorBox message={error || "Could not load your tasks."} onRetry={reload} />}
      {actionError && (
        <p role="alert" className="text-sm font-bold text-critical">
          {actionError}
        </p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TaskList title="To do" tasks={pending} empty="Nothing waiting. You are up to date." busyId={busyId} onToggle={toggle} onDelete={remove} />
          <TaskList title="Done" tasks={done} empty="Completed tasks will show here." busyId={busyId} onToggle={toggle} onDelete={remove} />
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
  onDelete,
}: {
  title: string;
  tasks: TaskVM[];
  empty: string;
  busyId: string;
  onToggle: (t: TaskVM) => void;
  onDelete: (t: TaskVM) => void;
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
              <button
                type="button"
                aria-label={`Delete ${t.title}`}
                disabled={busyId === t.id}
                onClick={() => onDelete(t)}
                className="label min-h-11 shrink-0 px-2 text-critical underline underline-offset-4 disabled:opacity-40"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

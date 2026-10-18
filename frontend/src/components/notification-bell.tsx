"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { backendConfigured } from "@/lib/api";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import type { NotificationVM } from "@/lib/types";
import { loadNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/farm-data";

const REFRESH_MS = 60_000;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The bell: reminders that came due, with a red dot while any are unread, and the switch for phone notifications. */
export function NotificationBell({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationVM[]>([]);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await loadNotifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      // The bell is a convenience: if it cannot load, the rest of the app still works.
    }
  }, []);

  useEffect(() => {
    if (!backendConfigured) return;
    // Load now and then every minute, but only while the page is showing.
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    void pushState().then(setPush);
    const soon = setTimeout(() => void refresh(), 0);
    panel.current?.focus();
    return () => {
      clearTimeout(soon);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, refresh]);

  if (!backendConfigured) return null;

  async function read(n: NotificationVM) {
    if (n.read) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    await markNotificationRead(n.id).catch(() => undefined);
  }

  async function readAll() {
    setItems((cur) => cur.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markAllNotificationsRead().catch(() => undefined);
  }

  async function togglePush() {
    setBusy(true);
    setMessage("");
    try {
      if (push === "on") await disablePush();
      else await enablePush();
      setPush(await pushState());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const pushNote: Partial<Record<PushState, string>> = {
    "needs-install": "On iPhone, first tap Share, then Add to Home Screen, and open FarmAs from there. Then you can turn notifications on.",
    unsupported: "This browser cannot show phone notifications. Reminders still appear here.",
    unavailable: "Phone notifications are not switched on for this server yet. Reminders still appear here.",
    denied: "Notifications are blocked for FarmAs. Allow them in your browser settings, then come back.",
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        className={`relative grid size-11 place-items-center rounded-full ${
          tone === "light" ? "text-lime hover:bg-lime/10" : "text-forest hover:bg-forest/10"
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2zM10 21h4" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-critical px-1 font-mono text-[0.65rem] leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-forest/20" />
          <div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-3 top-16 z-50 max-h-[75dvh] overflow-y-auto rounded-2xl border border-forest/15 bg-white p-4 text-forest shadow-xl outline-none lg:inset-x-auto lg:left-[17rem] lg:top-6 lg:w-96"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="label">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={() => void readAll()} className="label min-h-11 underline underline-offset-4">
                  Mark all read
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-forest/75">
                Nothing yet. Tell FarmAs AI &ldquo;remind me to vaccinate the goats on Friday&rdquo; and it will show here
                when it is time.
              </p>
            ) : (
              <ul className="divide-y divide-forest/10">
                {items.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => void read(n)} className="flex min-h-14 w-full items-start gap-3 py-3 text-left">
                      <span className={`mt-2 size-2.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-critical"}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className={`block ${n.read ? "" : "font-bold"}`}>{n.title}</span>
                        <span className="block text-sm text-forest/80">{n.body}</span>
                        <span className="mt-0.5 block text-xs text-forest/60">{when(n.at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-forest/10 pt-4">
              {pushNote[push] ? (
                <p className="text-sm text-forest/75">{pushNote[push]}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => void togglePush()}
                  disabled={busy}
                  className={`label min-h-11 w-full rounded-full border border-forest px-4 ${push === "on" ? "bg-white" : "bg-lime"}`}
                >
                  {busy ? "Please wait…" : push === "on" ? "Phone notifications are on. Tap to turn off" : "Turn on phone notifications"}
                </button>
              )}
              {message && (
                <p role="alert" className="mt-2 text-sm font-bold text-critical">
                  {message}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

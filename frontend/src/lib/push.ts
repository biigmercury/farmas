import { api, backendConfigured } from "@/lib/api";
import { getFarmId } from "@/lib/session";

// Phone notifications (Web Push). The farmer taps "Turn on" once, the browser asks for permission, and from then on a
// reminder can pop up on the phone even when the app is closed.

export type PushState =
  | "unsupported" // this browser cannot do it
  | "needs-install" // iPhone: only works after "Add to Home Screen"
  | "unavailable" // the server has no keys set up
  | "denied" // the farmer said no in the browser
  | "off"
  | "on";

const farmPath = (suffix: string) => `/api/farms/${getFarmId()}${suffix}`;

function isIPhone(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInstalledApp(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The browser wants the public key as bytes. */
function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (!backendConfigured) return "unsupported";
  if (isIPhone() && !isInstalledApp()) return "needs-install";
  if (!supported()) return "unsupported";
  try {
    const key = await api<{ enabled: boolean }>(farmPath("/push/key"));
    if (!key.enabled) return "unavailable";
  } catch {
    return "unavailable";
  }
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) && Notification.permission === "granted" ? "on" : "off";
}

/** Ask permission, subscribe this phone, and tell the server. Throws a readable Error if anything is refused. */
export async function enablePush(): Promise<void> {
  if (!supported()) throw new Error("This browser cannot show phone notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed. You can allow them in your browser settings.");

  const { publicKey } = await api<{ publicKey: string }>(farmPath("/push/key"));
  if (!publicKey) throw new Error("Phone notifications are not switched on for this server yet.");

  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  await api(farmPath("/push/subscribe"), { method: "POST", body: JSON.stringify(sub.toJSON()) });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api(farmPath("/push/unsubscribe"), { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
  await sub.unsubscribe();
}

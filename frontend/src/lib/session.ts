"use client";

import { useSyncExternalStore } from "react";

// Who is logged in, kept in this browser. The token is a JWT from the API.
// Tradeoff: localStorage is readable by any script on the page. That is acceptable for this prototype;
// before a real launch, move the token into an httpOnly cookie set by the server.

export type SessionUser = { id: string; name: string; email: string; phone: string; role: string };
export type Session = { token: string; farmId: string; farmName: string; user: SessionUser | null };

const TOKEN = "farmas.token";
const FARM = "farmas.farmId";
const FARM_NAME = "farmas.farmName";
const USER = "farmas.user";
const EVENT = "farmas:session";

const EMPTY: Session = { token: "", farmId: "", farmName: "", user: null };

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // storage blocked (private mode): the session just won't persist
  }
}

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

export function getToken(): string {
  return read(TOKEN);
}

export function getFarmId(): string {
  return read(FARM);
}

export function setSession(token: string, user: SessionUser) {
  write(TOKEN, token);
  write(USER, JSON.stringify(user));
  notify();
}

export function setFarm(id: string, name: string) {
  write(FARM, id);
  write(FARM_NAME, name);
  notify();
}

export function clearSession() {
  write(TOKEN, "");
  write(FARM, "");
  write(FARM_NAME, "");
  write(USER, "");
  notify();
}

let cache: { key: string; value: Session } = { key: "", value: EMPTY };

function snapshot(): Session {
  const token = read(TOKEN);
  const farmId = read(FARM);
  const farmName = read(FARM_NAME);
  const rawUser = read(USER);
  const key = `${token}|${farmId}|${farmName}|${rawUser}`;
  if (key === cache.key) return cache.value;
  let user: SessionUser | null = null;
  try {
    user = rawUser ? (JSON.parse(rawUser) as SessionUser) : null;
  } catch {
    user = null;
  }
  cache = { key, value: token || farmId || user ? { token, farmId, farmName, user } : EMPTY };
  return cache.value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Current session. On the server and during hydration it is empty, then the real value on the client. */
export function useSession(): Session {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

const noopSubscribe = () => () => {};

/**
 * False on the server and during the very first client render, true afterwards.
 * Until it is true, the saved login has not been read yet, so "no token" does not mean "logged out".
 * Never redirect to the login page before this is true.
 */
export function useSessionReady(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

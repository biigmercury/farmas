import { api, backendConfigured } from "@/lib/api";
import { clearSession, setFarm, setSession, type SessionUser } from "@/lib/session";

// Sign up / log in. Contract: api/docs/API.md (Authentication).

type AuthResult = { user: SessionUser; token: string };

export async function register(input: { name: string; email: string; phone: string; password: string }) {
  const r = await api<AuthResult>(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify(input) },
    { auth: false },
  );
  setSession(r.token, r.user);
  return r.user;
}

/** identifier = email or phone number. After logging in, remember the farmer's first farm (if any). */
export async function login(identifier: string, password: string) {
  const r = await api<AuthResult>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ identifier, password }) },
    { auth: false },
  );
  setSession(r.token, r.user);
  const farms = await api<{ farms: { id: string; name: string }[] }>("/api/farms");
  if (farms.farms.length > 0) setFarm(farms.farms[0].id, farms.farms[0].name);
  return { user: r.user, hasFarm: farms.farms.length > 0 };
}

export function logout() {
  clearSession();
}

// A shared demo login for presentations. The credentials come from the environment, never from code.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

/** True when a demo account is configured (or there is no backend and the built-in demo farm is used). */
export const demoAvailable = !backendConfigured || (DEMO_EMAIL !== "" && DEMO_PASSWORD !== "");

export async function loginAsDemo() {
  if (!backendConfigured) return { user: null, hasFarm: true };
  return login(DEMO_EMAIL, DEMO_PASSWORD);
}

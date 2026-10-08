// One place that knows where the backend is and how it answers. See api/docs/API.md for the endpoints.
//
// The API wraps every answer: { success: true, data } or { success: false, error: { message, code, details? } }.
// This helper unwraps it and throws ApiError with a message that is safe to show the farmer.

import { clearSession, getToken } from "@/lib/session";

const RAW = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Backend address without a trailing slash. Empty string means "no backend configured". */
export const API_URL = RAW.replace(/\/+$/, "");

/** True when NEXT_PUBLIC_API_URL is set. When false the app runs on built-in demo data. */
export const backendConfigured = API_URL !== "";

export class ApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ErrorBody = {
  error?: { message?: string; details?: { field?: string; message?: string }[] };
};

function messageFrom(body: ErrorBody | null, fallback: string): string {
  const details = body?.error?.details;
  if (details?.length) return details.map((d) => d.message).filter(Boolean).join(" ");
  return body?.error?.message || fallback;
}

type Options = {
  /** Send the login token. Default true. Login and sign-up turn it off. */
  auth?: boolean;
  timeoutMs?: number;
};

export async function api<T>(path: string, init: RequestInit = {}, opts: Options = {}): Promise<T> {
  if (!backendConfigured) throw new ApiError("No backend is configured.");
  const { auth = true, timeoutMs = 45_000 } = opts;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Don't set Content-Type for FormData: the browser adds the multipart boundary itself.
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    const token = auth ? getToken() : "";
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // empty or non-JSON body
    }

    if (!res.ok) {
      if (res.status === 401 && auth) {
        clearSession(); // the layout then sends the farmer back to the login page
        throw new ApiError("Your session has ended. Please log in again.", 401);
      }
      if (res.status === 429) throw new ApiError("Too many requests. Please wait a moment and try again.", 429);
      throw new ApiError(
        messageFrom(body as ErrorBody, "The server had a problem. Please try again."),
        res.status,
      );
    }
    const envelope = body as { data?: T } | null;
    return (envelope && "data" in envelope ? envelope.data : body) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError")
      throw new ApiError("The server took too long to answer. Please try again.");
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

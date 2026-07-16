// Thin fetch wrapper over Filestash's Go JSON API.
//
// - Cookie-based sessions: every request sends credentials (same-origin in prod;
//   the next dev server proxies /api → Go, so cookies flow there too).
// - Unwraps the `{ status, result|results }` envelope and throws ApiRequestError
//   on `status: "error"` or non-2xx responses.
import type { ApiError } from "./types";
import { withBase } from "@/lib/paths";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type Json = Record<string, unknown>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "OPTIONS";
  /** JSON body (object) — serialized and sent as application/json. */
  body?: Json;
  /** Query params appended to the path. */
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiEnvelope<T> {
  result?: T;
  results?: T;
  permissions?: unknown;
  headers: Headers;
}

export function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = withBase(path);
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function requestEnvelope<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    credentials: "include",
    // X-Requested-With is required by the Go SecureOrigin middleware to allow
    // browser requests (the legacy frontend sent it); without it, mutating
    // endpoints reject with 403 "Not Allowed".
    headers: {
      "X-Requested-With": "XmlHttpRequest",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // 204/304 or empty body → nothing to unwrap.
  const text = await res.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!res.ok) throw new ApiRequestError(res.statusText || "request failed", res.status);
      // Non-JSON success (e.g. raw file content handlers) — return as-is.
      return { result: text as unknown as T, headers: res.headers };
    }
  }

  const env = payload as { status?: string; result?: T; results?: T } & ApiError;
  if (!res.ok || env?.status === "error") {
    throw new ApiRequestError(env?.message || res.statusText || "request failed", res.status);
  }
  // Prefer `result`, fall back to `results` (collection envelope).
  return { ...env, headers: res.headers };
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const env = await requestEnvelope<T>(path, opts);
  return (env.result ?? env.results) as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: Json, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: Json, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  getEnvelope: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    requestEnvelope<T>(path, { ...opts, method: "GET" }),
};

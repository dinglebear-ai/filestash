// Typed endpoint functions over the Go API. Paths and param styles verified
// against server/routes.go and server/ctrl/*.go (file ops use query params, not
// JSON bodies; login posts a JSON body; sessions are cookie-based).
import { api } from "./client";
import type { FileEntry, PublicConfig, Session } from "./types";

export const configApi = {
  /** GET /api/config — runtime config for the static shell (name, base, …). */
  get: (signal?: AbortSignal) => api.get<PublicConfig>("/api/config", { signal }),
};

export const sessionApi = {
  /** GET /api/session — current auth state. */
  get: (signal?: AbortSignal) => api.get<Session>("/api/session", { signal }),
  /** POST /api/session — authenticate with a backend's credential payload. */
  login: (credentials: Record<string, unknown>) => api.post<Session>("/api/session", credentials),
  /** DELETE /api/session — log out. */
  logout: () => api.delete<{ logout: boolean } | null>("/api/session"),
};

export const filesApi = {
  /** GET /api/files/ls?path= — list a directory. */
  ls: (path: string, signal?: AbortSignal) =>
    api.get<FileEntry[]>("/api/files/ls", { query: { path }, signal }),
  /** POST /api/files/mkdir?path= — create a directory (trailing slash). */
  mkdir: (path: string) => api.post<null>("/api/files/mkdir", undefined, { query: { path } }),
  /** POST /api/files/touch?path= — create an empty file. */
  touch: (path: string) => api.post<null>("/api/files/touch", undefined, { query: { path } }),
  /** POST /api/files/rm?path= — remove a file or directory. */
  rm: (path: string) => api.post<null>("/api/files/rm", undefined, { query: { path } }),
  /** POST /api/files/mv?from=&to= — move/rename. */
  mv: (from: string, to: string) =>
    api.post<null>("/api/files/mv", undefined, { query: { from, to } }),
  /** GET /api/files/cat?path= — direct URL for reading/downloading file content. */
  catUrl: (path: string) => `/api/files/cat?path=${encodeURIComponent(path)}`,
  /** GET /api/files/search?path=&q= — search within a path. */
  search: (path: string, q: string, signal?: AbortSignal) =>
    api.get<FileEntry[]>("/api/files/search", { query: { path, q }, signal }),
};

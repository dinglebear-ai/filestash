// Typed endpoint functions over the Go API. Paths and param styles verified
// against server/routes.go and server/ctrl/*.go (file ops use query params, not
// JSON bodies; login posts a JSON body; sessions are cookie-based).
import { api } from "./client";
import type { BackendsMap, FileEntry, PublicConfig, Session } from "./types";

export const backendApi = {
  /** GET /api/backend — available storage backends and their login forms. */
  list: (signal?: AbortSignal) => api.get<BackendsMap>("/api/backend", { signal }),
};

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

export const adminApi = {
  /** GET /admin/api/session — true if admin-authenticated (or no admin set). */
  session: (signal?: AbortSignal) => api.get<boolean>("/admin/api/session", { signal }),
  /** POST /admin/api/session — authenticate the admin console with a password. */
  login: (password: string) => api.post<unknown>("/admin/api/session", { password }),
  /** GET /admin/api/config — full config tree (nested FormElements with values). */
  getConfig: (signal?: AbortSignal) =>
    api.get<Record<string, Record<string, unknown>>>("/admin/api/config", { signal }),
  /** POST /admin/api/config — save the full config tree. */
  saveConfig: (config: unknown) => api.post<null>("/admin/api/config", config as Record<string, unknown>),
  /** GET /admin/api/logs — raw log text. */
  logs: (signal?: AbortSignal) => api.get<string>("/admin/api/logs", { signal }),
  /** GET /admin/api/audit — audit query result. */
  audit: (signal?: AbortSignal) => api.get<unknown>("/admin/api/audit", { signal }),
};

export const shareApi = {
  /** POST /api/share/{id}/proof — share proof step. Empty body starts the flow;
   *  then {type,value} per step. Returns {key, path}: key="" means authorized. */
  proof: (shareId: string, body: Record<string, string> | null) =>
    api.post<{ key?: string; path?: string }>(`/api/share/${shareId}/proof`, body ?? {}),
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
  /** POST /api/files/cat?path= — save edited text content. */
  save: async (path: string, content: string) => {
    const res = await fetch(`/api/files/cat?path=${encodeURIComponent(path)}`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "XmlHttpRequest", "Content-Type": "text/plain" },
      body: content,
    });
    if (!res.ok) throw new Error(`save failed (${res.status})`);
  },
  /** POST /api/files/cat?path= — upload raw file content (not JSON). */
  upload: async (path: string, body: Blob | File) => {
    const res = await fetch(`/api/files/cat?path=${encodeURIComponent(path)}`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "XmlHttpRequest" },
      body,
    });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
  },
  /** GET /api/files/search?path=&q= — search within a path. */
  search: (path: string, q: string, signal?: AbortSignal) =>
    api.get<FileEntry[]>("/api/files/search", { query: { path, q }, signal }),
};

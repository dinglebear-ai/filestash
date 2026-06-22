// Types mirroring the Go API (server/common, server/ctrl). Keep in sync with the
// backend structs — see docs/superpowers/specs for the API map.

/** Success envelope for a single object: `{ status: "ok", result: T }`. */
export interface ApiResult<T> {
  status: "ok";
  result?: T;
}

/** Success envelope for a collection: `{ status: "ok", results: T }`. */
export interface ApiResults<T> {
  status: "ok";
  results: T;
  /** Present on list endpoints that attach permissions metadata. */
  permissions?: unknown;
}

/** Error envelope: `{ status: "error", message }` with a non-2xx HTTP status. */
export interface ApiError {
  status: "error";
  message?: string;
}

/** server/common.File */
export interface FileEntry {
  name: string;
  /** "file" | "directory" */
  type: "file" | "directory";
  /** unix epoch millis (0 when unknown) */
  time: number;
  size: number;
  path?: string;
  offline?: boolean;
}

/** server/ctrl.Session */
export interface Session {
  home?: string;
  is_authenticated: boolean;
  backendID: string;
  authorization?: string;
}

/** Public config payload (server Config.Export()) — shape is dynamic; the fields
 *  below are the ones the shell relies on. Treat the rest as opaque. */
export interface PublicConfig {
  name?: string;
  /** sub-path the app is mounted under, e.g. "/" or "/filestash/" */
  base?: string;
  [key: string]: unknown;
}

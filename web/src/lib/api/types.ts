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

/** server/common.FormElement. NOTE: Go's `Name` field serializes as `label`. */
export interface FormElement {
  id?: string;
  /** field name (Go `Name`, JSON key "label") — used both as key and display */
  label: string;
  type: string; // text | password | long_password | number | hidden | enable | select | boolean | ...
  description?: string;
  placeholder?: string;
  pattern?: string;
  options?: string[];
  /** ids of fields revealed when an `enable` toggle is on */
  target?: string[];
  readonly?: boolean;
  default?: unknown;
  value?: unknown;
  multi?: boolean;
  datalist?: string[];
  required?: boolean;
}

/** A backend login form as returned by the API: an ordered map of field name →
 *  element (server/common.Form marshals to a keyed object, not {Elmnts:[]}). */
export type FormFields = Record<string, FormElement>;

/** GET /api/backend → map of backend key → its keyed login form. */
export type BackendsMap = Record<string, FormFields>;

/** An entry in config.connections — the admin-configured connect-page list. Has a
 *  display `label` and a backend `type`, plus optional prefilled field overrides. */
export interface Connection {
  label: string;
  type: string;
  [field: string]: unknown;
}

/** Public config payload (server Config.Export()) — shape is dynamic; the fields
 *  below are the ones the shell relies on. Treat the rest as opaque. */
export interface PublicConfig {
  name?: string;
  /** sub-path the app is mounted under, e.g. "/" or "/filestash/" */
  base?: string;
  /** connect-page connection list (label + backend type + optional overrides) */
  connections?: Connection[];
  [key: string]: unknown;
}

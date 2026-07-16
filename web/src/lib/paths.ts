const TEMPLATE_BASE = "{{.base}}";

declare global {
  interface Window {
    __FILESTASH_BOOT__?: { base?: string; version?: string };
  }
}

export function normalizeBase(value?: string): string {
  if (!value || value.includes("{{") || value === "/") return "/";
  const path = `/${value.replace(/^\/+|\/+$/g, "")}`;
  return `${path}/`;
}

export function bootBase(): string {
  if (typeof window === "undefined") return "/";
  const configured = window.__FILESTASH_BOOT__?.base;
  if (configured && configured !== TEMPLATE_BASE) return normalizeBase(configured);
  const baseElement = document.querySelector("base")?.getAttribute("href");
  return normalizeBase(baseElement ?? "/");
}

export function withBase(path: string, base = bootBase()): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path)) return path;
  const suffix = path.replace(/^\/+/, "");
  return base === "/" ? `/${suffix}` : `${normalizeBase(base)}${suffix}`;
}

export function trimBase(path: string, base = bootBase()): string {
  const normalized = normalizeBase(base);
  const prefix = normalized === "/" ? "" : normalized.slice(0, -1);
  if (!prefix) return path || "/";
  if (path === prefix) return "/";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) || "/" : path;
}

import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Backend target for `next dev` proxying. In production the Go binary serves the
// static export, so these rewrites are dev-only (Next ignores rewrites under
// `output: "export"` at build time).
const API_TARGET = process.env.FILESTASH_API ?? "http://127.0.0.1:8334";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const EXTRA_DEV_ORIGINS = (process.env.FILESTASH_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const GENERATED_DIRECTORIES = new Set([
  ".next",
  "coverage",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

function frontendSourceFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return GENERATED_DIRECTORIES.has(entry.name)
        ? []
        : frontendSourceFiles(join(directory, entry.name), relativePath);
    }
    return [relativePath];
  });
}

function frontendBuildId(): string {
  const files = frontendSourceFiles(__dirname).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(__dirname, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 20);
}

const nextConfig: NextConfig = {
  generateBuildId: async () => frontendBuildId(),
  allowedDevOrigins: ["localhost", "127.0.0.1", ...EXTRA_DEV_ORIGINS],
  // Pin the workspace root to this app (parent dirs contain unrelated lockfiles).
  turbopack: { root: __dirname },
  // Static export for production builds → out/, copied into ../public for
  // `//go:embed public`. Not in dev: export constraints (catch-all dynamicParams,
  // single-shell) break `next dev`'s on-demand routing/hydration; dev runs as a
  // normal Next app behind the API proxy instead.
  output: IS_PRODUCTION ? "export" : undefined,
  // No Node image optimizer at runtime — required for static export.
  images: { unoptimized: true },
  // The Go server serves static files only under /assets/*. In production builds,
  // prefix Next's asset URLs (/_next/*) so they resolve to /assets/_next/* — which
  // the existing ServeFile route already serves from public/ (the build pipeline
  // copies out/_next -> public/assets/_next). NOT applied in dev: assetPrefix
  // breaks next dev's runtime/HMR asset loading (and dev serves its own assets).
  // Relative URLs are resolved against the runtime <base> injected by the stage
  // script, so one export works at / and any FILESTASH_BASE mount point.
  assetPrefix: IS_PRODUCTION ? "./assets" : undefined,

  // Dev-only: proxy the Go JSON/WebSocket API so `next dev` runs against a real
  // backend. Skipped during static export builds (rewrites don't apply there).
  ...(!IS_PRODUCTION ? {
    async rewrites() {
      return [
        { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
        { source: "/admin/api/:path*", destination: `${API_TARGET}/admin/api/:path*` },
        { source: "/s/:path*", destination: `${API_TARGET}/s/:path*` },
        { source: "/custom.css", destination: `${API_TARGET}/custom.css` },
        { source: "/healthz", destination: `${API_TARGET}/healthz` },
      ];
    },
  } : {}),
};

export default nextConfig;

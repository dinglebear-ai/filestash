import type { NextConfig } from "next";

// Backend target for `next dev` proxying. In production the Go binary serves the
// static export, so these rewrites are dev-only (Next ignores rewrites under
// `output: "export"` at build time).
const API_TARGET = process.env.FILESTASH_API ?? "http://127.0.0.1:8334";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app (parent dirs contain unrelated lockfiles).
  turbopack: { root: __dirname },
  // Static export for production builds → out/, copied into ../public for
  // `//go:embed public`. Not in dev: export constraints (catch-all dynamicParams,
  // single-shell) break `next dev`'s on-demand routing/hydration; dev runs as a
  // normal Next app behind the API proxy instead.
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  // No Node image optimizer at runtime — required for static export.
  images: { unoptimized: true },
  // The Go server serves static files only under /assets/*. In production builds,
  // prefix Next's asset URLs (/_next/*) so they resolve to /assets/_next/* — which
  // the existing ServeFile route already serves from public/ (the build pipeline
  // copies out/_next -> public/assets/_next). NOT applied in dev: assetPrefix
  // breaks next dev's runtime/HMR asset loading (and dev serves its own assets).
  assetPrefix: process.env.NODE_ENV === "production" ? "/assets" : undefined,

  // Dev-only: proxy the Go JSON/WebSocket API so `next dev` runs against a real
  // backend. Skipped during static export builds (rewrites don't apply there).
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
      { source: "/admin/api/:path*", destination: `${API_TARGET}/admin/api/:path*` },
      { source: "/s/:path*", destination: `${API_TARGET}/s/:path*` },
      { source: "/custom.css", destination: `${API_TARGET}/custom.css` },
      { source: "/healthz", destination: `${API_TARGET}/healthz` },
    ];
  },
};

export default nextConfig;

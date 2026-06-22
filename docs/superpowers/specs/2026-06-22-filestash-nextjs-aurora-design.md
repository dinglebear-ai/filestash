# Filestash → Next.js + Aurora Frontend Rewrite — Design

**Date:** 2026-06-22 (rescoped 2026-06-22)
**Status:** Approved (via /goal directive) — implementation in progress
**Branch:** `feat/nextjs-aurora-frontend`

## Goal

Replace Filestash's current framework-free, build-free vanilla-JS frontend with a
Next.js + React + TypeScript application styled entirely with the Aurora Design
System, statically exported and embedded into the existing single Go binary.

## Locked decisions

| Axis | Decision |
|---|---|
| Deploy model | Next.js **static export** (`output: 'export'`), embedded into the Go binary via `//go:embed public`. **No Node at runtime.** |
| Sequencing | **Big-bang full rewrite**, single cutover. |
| Fidelity | **Faithful port** — reproduce current Filestash UX 1:1 in React + Aurora (reskin to Aurora components/tokens, not a redesign). |
| Backend scope | **No API/behavior changes.** Consume the existing Go API exactly as-is. A **minimal Go *serving* tweak only** is permitted to serve the static export (asset prefix + SPA shell routing) — not endpoints, not response shapes. |
| Frontend plugins | All 7 frontend add-ons **dropped**. ~50 backend Go plugins untouched. |
| Viewers | **All 14** ported (full preview parity). |

### Rescope note (2026-06-22)
Originally scoped as "redesign around Aurora + backend API refactor." Rescoped to a
**faithful port with no backend/API changes**. The only backend edit allowed is a
small static-serving change, because Next static export emits per-route HTML +
`/_next/*` assets while the Go server serves one fixed shell (`index.frontoffice.html`)
for an allowlist of routes and assets only under `/assets/*`. Resolution: set Next
`assetPrefix: "/assets"` and serve a single SPA shell (see Integration below).

## Current architecture (what we're replacing)

- Go binary (`net/http` + `gorilla/mux`) serves everything. Frontend embedded via
  `//go:embed public` (`embed.go`).
- HTML entry points rendered by Go `html/template`: `index.frontoffice.html`,
  `index.backoffice.html` — inject `appname`, `license`, `version`/`BUILD_REF`, `base`.
- Frontend is native ES modules + Web Components + RxJS, no bundler. "Build" =
  brotli/gzip pre-compression (`public/Makefile`).
- Assets served from embedded FS at versioned `/assets/<BUILD_REF>/...`.
- **Already present and useful:** `GET /api/config` (`PublicConfigHandler`) for runtime
  config; catch-all `ServeFrontofficeHandler` (`/*`) and `ServeBackofficeHandler`
  (`/admin/*`) already serve the HTML shell for any path → SPA fallback + runtime
  config plumbing largely exist.

## Stack & tooling

- Next.js (App Router) + React 19 + TypeScript, `output: 'export'`.
- Tailwind v4 + Aurora via shadcn registry
  (`npx shadcn add https://aurora.tootie.tv/r/aurora-tokens.json`, then components).
  Dark-first navy; cyan primary / rose secondary / violet AI accents. **Aurora tokens
  only, no raw hex.**
- Server state: TanStack Query. UI state: Zustand.
- Testing: Vitest + React Testing Library; Playwright E2E.

## Project layout & build pipeline

- New top-level `web/` holds the Next app (separate from `public/`).
- `next build` → static export `web/out/` → copied into `public/` (Go embeds it) →
  Makefile brotli/gzip runs over result.
- Replace templated `index.*.html` with static shells; SPA fetches `/api/config` at boot.

## Routing & SPA fallback

- App Router. Catch-all `app/files/[[...path]]/page.tsx` for arbitrary-depth paths;
  client-side routing.
- Routes: `/` (home/login), `/files/*`, `/view/*` (viewer), `/s/{share}` (shared link),
  `/admin/*` (backoffice).
- Go catch-all already serves the shell for unknown paths → deep links work without
  per-path static generation.

## Data / API layer

Typed client over existing Go JSON API:

- **Session/auth:** `GET/POST/DELETE /api/session`, `GET /api/session/auth/{service}`,
  `GET/POST /api/session/auth/` (multi-step). Cookie-based sessions — no token storage in JS.
- **Files:** `/api/files/ls,cat,save,mv,rm,mkdir,touch,zip,unzip,search`.
- **Share:** `GET /api/share`, `POST /api/share/{share}/proof`, `POST/DELETE /api/share/{share}`.
- **Metadata:** `GET/POST /api/metadata`, `POST /api/metadata/search`.
- **Backends:** `GET /api/backend` (connect wizard).
- **Config:** `GET /api/config`.
- **Admin:** `/admin/api/{session,config,workflow,middlewares/authentication,audit,logs}`.

## Ported screens (faithful, Aurora-skinned)

Match the current Filestash screens/flows 1:1, rebuilt with Aurora components/tokens:

- Home / Login (auth, OAuth, multi-step auth middleware).
- Connect page (backend picker + dynamic forms from `/api/backend`).
- File browser (list/grid, breadcrumb, selection, upload, drag-drop, context actions,
  search, sidebar) — same layout/behavior as today.
- Viewer (all 14 openers).
- Share page + share management.
- Admin backoffice (config editor, workflows, auth middleware, audit log, logs viewer).
- Error / not-found / loading states.

## Viewers (all 14)

`editor` (CodeMirror 6 + org-mode), `image`, `pdf` (pdf.js), `audio`, `video`,
`3d` (three.js), `map`, `ebook` (epub.js), `table` (CSV/spreadsheet), `form`,
`iframe`/`appframe` (Office/OnlyOffice/WOPI), `url`, `download` fallback,
`skeleton` (loading). Each lazy-loaded so the base bundle stays small.

## Integration: serving the static export from Go (minimal serving tweak only)

No API/behavior changes. The existing API (`/api/config` already exists) is consumed
as-is. The only Go edit is making the existing server serve the Next export:

- **Next side:** `assetPrefix: "/assets"` so `/_next/*` asset URLs become `/assets/_next/*`
  (which the existing `ServeFile` route already serves from `public/`). Single SPA shell
  (client-side routing) so one HTML file serves all front-office routes.
- **Build pipeline:** `next build` → `out/` → copy `out/_next` → `public/assets/_next`,
  and `out/index.html` → `public/index.frontoffice.html` (+ backoffice shell). Makefile
  brotli/gzip runs over the result.
- **Go serving tweak (minimal):** `ServeFrontofficeHandler`/`ServeBackofficeHandler`
  serve the new SPA shell; widen the route allowlist if the ported routes need it. No
  endpoint, response-shape, or middleware/behavior changes.
- Frontend-plugin injection machinery (`PluginInjector` frontend bits, `bundle.js`,
  `/overrides/xdg-open.js`, `.diff` patching) is simply **not referenced** by the new
  shell; the Go code stays untouched (the 7 frontend add-ons are dropped regardless).

## Dev workflow

- Go in `DEBUG=true` (serves from disk) on its port; `next dev` proxies `/api`,
  `/admin/api`, `/s` → Go. React hot reload over real backend.

## Cutover, risks, out-of-scope

- **Cutover:** single flip — new `public/` shipped, old vanilla-JS frontend deleted.
- **Risks:** maximal scope on every axis → long time-to-first-working-state; no 1:1
  reference for the redesign; the 14 viewers (editor, 3d, office embeds, pdf) are each
  large. WebDAV/shared-link HTML serving and PWA `sw.js` need re-checking under the new shell.
- **Out of scope:** frontend plugin extensibility, the 7 dropped add-ons, new backend
  storage drivers.

## Implementation phases

1. **Foundation:** scaffold `web/` Next app (TS, App Router, static export), Tailwind v4 +
   Aurora tokens, base theme/layout, dev proxy. ✅ done
2. **Core infra:** typed API client, `/api/config` boot, TanStack Query, error/loading
   primitives. ✅ done (session/auth context next)
3. **Serving integration:** `assetPrefix: "/assets"`, single SPA shell, build→`public/`
   pipeline, minimal Go serving tweak; verify the export is served by the Go binary.
4. **Auth + connect:** login (incl. OAuth/multi-step), connect page from `/api/backend` —
   faithful to current flow.
5. **File browser:** `/files/*` list/grid, navigation, ops, upload, search, sidebar.
6. **Viewers:** all 14, lazy-loaded.
7. **Share:** shared-link page + management.
8. **Admin backoffice:** config, workflows, auth middleware, audit, logs.
9. **Cutover:** embed export into `public/`, delete legacy frontend, verify Go build, E2E.

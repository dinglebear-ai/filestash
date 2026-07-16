# Filestash Web

This directory contains the Next.js 16/React 19 frontend. Production is a static export embedded in the Go binary; it is not deployed with `next start` or Vercel.

## Development

```bash
npm ci
FILESTASH_API=http://127.0.0.1:8334 npm run dev
```

The development server proxies Filestash API, share, custom CSS, and health routes to `FILESTASH_API`. Add comma-separated non-local hosts with `FILESTASH_DEV_ORIGINS`; machine-specific origins are intentionally not committed.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run check` runs the first four gates. Browser tests expect a built or development server as configured in `playwright.config.ts`.

## Embedded Build

```bash
npm run build:stage
```

The stage script builds the export, injects the runtime `FILESTASH_BASE` boot contract, copies the two SPA shells and Next assets into `../public`, and creates Brotli/gzip siblings. It overwrites generated embedded assets, so use it only when intentionally refreshing them.

The Go server supplies `{{.base}}` at request time. Client API calls and navigation must use `src/lib/paths.ts`; a build-time Next `basePath` would break the single artifact across different mount paths.

Aurora source components are refreshed with `node scripts/sync-aurora.mjs`. Review registry changes separately from application changes.

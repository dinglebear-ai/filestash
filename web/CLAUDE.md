<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Frontend Checks

Run `npm run check` for lint, TypeScript, Vitest, and the production export. Use `npm run build:stage` only when intentionally refreshing the Go embedded assets.

`FILESTASH_BASE` is a runtime mount contract. Keep routes and API URLs base-aware through `src/lib/paths.ts`; do not add a build-time Next `basePath`.

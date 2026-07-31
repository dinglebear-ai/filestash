---
title: Next.js Frontend Migration
created: 2026-07-30
updated: 2026-07-30
---

# Next.js Frontend Migration

The React/Aurora frontend is a static export embedded in the Filestash Go binary.
There is no Node server in production. Operators upgrading from the legacy client
should validate routing and plugins before replacing a production instance.

## Subpath deployments

`FILESTASH_BASE` remains a runtime contract. Set it to a leading-slash mount path
without a trailing slash, for example `/files`, and configure the reverse proxy to
forward that prefix without stripping it unexpectedly:

```bash
FILESTASH_BASE=/files
APPLICATION_URL=https://example.com/files
```

At boot, the Go shell supplies the base to React. API calls, client navigation,
custom CSS, plugin URLs, and static asset paths use the same base-aware helpers.
Before rollout, exercise login, OAuth callbacks, deep links, shares, admin routes,
downloads, and a hard refresh below the prefix. Do not combine a runtime base with
an unrelated Next `basePath`; production assets are staged by the repository build.

## Frontend plugins

Backend storage, authentication, authorization, middleware, workflow, and handler
plugins remain Go extension points. The React client does not execute arbitrary
legacy shell patches or `.diff` overrides.

Viewer integrations must advertise the versioned `filestash-react-viewer-v1`
contract. Trusted React viewers use the typed host; external content uses the
sandboxed iframe host. Legacy `skeleton` viewer manifests receive an explicit
compatibility fallback rather than being silently loaded as old shell code.
Theme/action-delete/download patches written against the legacy DOM must be
migrated to a supported React contract or kept on the legacy frontend until a
replacement exists.

Test every installed frontend-affecting plugin in a staging instance. A backend
plugin being present in `/about` does not prove its legacy browser patch is
compatible with React.

## Debug mode

`DEBUG=true` is development-only. In addition to disk-served assets it enables
pprof, memory, and active-GC diagnostics. Bind the server to loopback or a private
operator network, and ensure a public proxy denies these paths. Never use DEBUG as
a production workaround for stale staged assets; rebuild and restage `public/`.

## Upgrade checklist

1. Back up state and the external configuration-encryption secret.
2. Build the exact revision with `make ci` and an immutable SHA image tag.
3. Verify the configured root/subpath topology and OAuth callback URLs in staging.
4. Inventory frontend-affecting plugins and migrate or disable unsupported patches.
5. Complete first-run setup only through HTTPS using the one-time setup token.
6. Confirm `/healthz`, Collabora discovery, login, file mutations, shares, admin
   saves, viewers, and logs before shifting traffic.
7. Keep the previous image digest and state backup available for rollback.

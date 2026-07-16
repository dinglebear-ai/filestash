# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
make verify       # frontend lint/type/tests; Go vet/tests
make test-race    # race-enabled Go/plugin tests
make audit        # pinned govulncheck and production npm audit
make sbom         # CycloneDX artifacts under dist/
make build        # stage deterministic web export, generate Go, build binary
make ci           # complete release gate
```

Builds use `go mod download`, `go mod verify`, `npm ci`, and `-mod=readonly`.
Never put `go get` or `go mod tidy` in a build target or Dockerfile. Dependency
upgrades are explicit changes to the tracked Go/npm manifests and lockfiles.

Frontend source changes must be staged with `make frontend-stage`; commit the
result under `public/`. CI rebuilds the export and requires no diff. Go generation
uses the current Git SHA, so builds must run inside the intended checkout.

## Architecture Overview

- `server/` and `cmd/` contain the Go application and maintained plugins.
- `web/` is a Next.js/React static export. Node is build-time only.
- `public/` is generated/staged from `web/out` and embedded in the Go binary.
- `config/` contains defaults; runtime state belongs outside the checkout.
- `docker/Dockerfile` builds the supplied checkout and binds its `BUILD_REF` to
  the submitted Git SHA. It must never clone a mutable upstream branch.
- `docker/docker-compose.yml` is an HTTPS-reverse-proxy example; Collabora stays
  internal and first-run/config secrets remain external to the state volume.

## Conventions & Patterns

- Preserve unrelated working-tree changes; this branch commonly carries active
  frontend work.
- Keep tests, snapshots, setup files, `go.sum`, and `web/package-lock.json`
  tracked. Do not exclude plugin packages from compile/test gates.
- `FILESTASH_BASE` is a runtime mount contract shared by Go and React. Route,
  API, asset, CSS, and plugin URLs must use the base-aware helpers.
- Legacy browser DOM patches are not silently executed by React. Frontend viewers
  use the versioned typed host or sandboxed iframe compatibility path.
- `DEBUG=true` exposes operator diagnostics and is private-development only.
- `CLAUDE.md` is the only editable agent-memory source. Root and nested
  `AGENTS.md`/`GEMINI.md` files must be symlinks to the sibling `CLAUDE.md`.

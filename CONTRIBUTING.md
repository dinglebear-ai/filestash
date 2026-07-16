# Contributing Guide

Thanks for contributing to Filestash. For changes larger than a typo or a
well-contained bug fix, open an issue before implementation so the API and
compatibility impact can be agreed first. Contributions are licensed under the
project license.

## Prerequisites

- Git and Make
- Go 1.26.5 and Node 24.18.0 (both are pinned in `.mise.toml`)
- Native image/video development libraries used by the maintained plugins

On Debian/Ubuntu, install the native dependencies with:

```bash
sudo apt-get install libjpeg-dev libtiff-dev libpng-dev libwebp-dev \
  libraw-dev libheif-dev libgif-dev libvips-dev libavcodec-dev \
  libavdevice-dev libavfilter-dev libavformat-dev libswresample-dev \
  libswscale-dev libavutil-dev
```

With mise installed, `mise install` selects the repository toolchain. The module
and npm lockfiles are authoritative; normal build and test targets use readonly
dependency resolution and never run `go get`.

## Build

```bash
make deps                 # download and verify the locked Go graph
make frontend-install     # npm ci from web/package-lock.json
make build                # check/build/stage web, generate Go, build dist/filestash
```

`make frontend-stage` intentionally replaces the tracked embedded files under
`public/`. Commit those generated changes whenever frontend source changes. CI
rebuilds them and fails if the checked-in assets differ.

For a revision-labeled container built from the current checkout:

```bash
docker build -f docker/Dockerfile \
  --build-arg BUILD_REF="$(git rev-parse HEAD)" \
  -t "filestash:$(git rev-parse --short HEAD)" .
```

The Docker build never clones another branch; `BUILD_REF` must match the checkout.

## Test and release gates

```bash
make verify       # lint, typecheck, component/unit tests, go vet, Go tests
make test-race    # race-enabled Go and plugin suite
make benchmark    # package benchmarks with allocation metrics
make audit        # govulncheck plus production npm audit
make sbom         # CycloneDX Go and web SBOMs in dist/
make ci           # all gates, staged-asset check, readonly graph check, binary
```

Focused frontend tests live with the React app and browser tests live under
`web/e2e/`. Go tests use normal `*_test.go` files beside their packages. Tests,
snapshots, setup files, and lockfiles are source-controlled.

## Development servers

Run the Go server and Next development server separately:

```bash
DEBUG=true ./dist/filestash
FILESTASH_API=http://127.0.0.1:8334 npm run dev --prefix web
```

`DEBUG=true` serves source assets and enables pprof, memory, and active-GC
operator endpoints. Use it only on a loopback/private development listener and
never expose it through a public reverse proxy. Production uses the statically
exported frontend embedded in the Go binary; there is no Node runtime.

## Pull requests

Keep `go.mod`, `go.sum`, `web/package-lock.json`, and staged `public/` assets in
sync. Do not bypass plugin compile failures by excluding `server/plugin`; document
intentional platform/CGO constraints instead. Include regression tests for fixes,
especially authentication, redirects, request limits, cancellation, and shared
state.

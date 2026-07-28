# syntax=docker/dockerfile:1.10@sha256:865e5dd094beca432e8c0a1d5e1c465db5f998dca4e439981029b3b81fb39ed5

# The build context is the submitted checkout. CI passes BUILD_REF and verifies it
# against HEAD; the image never clones a mutable branch.
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS builder_frontend
WORKDIR /src
COPY web/package.json web/package-lock.json ./web/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix web --no-audit --no-fund
COPY web/ ./web/
COPY public/ ./public/
COPY scripts/ ./scripts/
RUN npm run lint --prefix web && \
    npm run typecheck --if-present --prefix web && \
    npm run test:coverage --prefix web && \
    npm run build --prefix web && \
    node web/scripts/build-embed.mjs --apply --skip-build && \
    ./scripts/check-web-assets.sh

FROM golang:1.26.5-trixie@sha256:117e07f49461abb984fc8aef661432461ff43d06faa22c3b73af6a49ce325cb9 AS builder_backend
WORKDIR /src
RUN apt-get update >/dev/null && \
    apt-get install -y --no-install-recommends git make \
      libjpeg-dev libtiff-dev libpng-dev libwebp-dev libraw-dev libheif-dev \
      libgif-dev libvips-dev libavcodec-dev libavdevice-dev libavfilter-dev \
      libavformat-dev libswresample-dev libswscale-dev libavutil-dev >/dev/null && \
    rm -rf /var/lib/apt/lists/*
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download && go mod verify
COPY . .
COPY --from=builder_frontend /src/public/ ./public/
ARG BUILD_REF
RUN test -n "${BUILD_REF}" && test "${BUILD_REF}" = "$(git rev-parse HEAD)" && \
    go generate -x ./server/... && \
    CGO_ENABLED=1 go build -mod=readonly -trimpath -tags fts5 -o /out/filestash ./cmd

FROM builder_backend AS test_backend
RUN go vet -mod=readonly ./server/... ./cmd/... && \
    go test -mod=readonly -count=1 -covermode=atomic -coverprofile=/tmp/coverage-go.out ./server/... ./cmd/... && \
    ./scripts/check-go-coverage.sh /tmp/coverage-go.out && \
    go test -mod=readonly -count=1 -covermode=atomic -coverprofile=/tmp/coverage-go-critical.out \
      ./server/common ./server/middleware ./server/ctrl ./server/model \
      ./server/pkg/workflow/trigger ./server/plugin/plg_handler_mcp \
      ./server/plugin/plg_handler_console ./server/plugin/plg_backend_dav && \
    GO_COVERAGE_MIN=16.6 ./scripts/check-go-coverage.sh /tmp/coverage-go-critical.out && \
    CGO_ENABLED=1 go test -mod=readonly -race -count=1 ./server/... ./cmd/... && \
    go test -mod=readonly -run '^$' -bench . -benchmem ./server/... ./cmd/... && \
    go run golang.org/x/vuln/cmd/govulncheck@v1.6.0 ./server/... ./cmd/...

FROM debian:trixie-slim@sha256:020c0d20b9880058cbe785a9db107156c3c75c2ac944a6aa7ab59f2add76a7bd
LABEL org.opencontainers.image.source="https://github.com/mickael-kerjean/filestash"
ARG BUILD_REF
LABEL org.opencontainers.image.revision="${BUILD_REF}"
WORKDIR /app
RUN apt-get update >/dev/null && \
    apt-get install -y --no-install-recommends ca-certificates curl ffmpeg libbrotli1 libvips poppler-utils >/dev/null && \
    useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin filestash && \
    install -d -o filestash -g filestash -m 0700 \
      /app/data/state /app/data/state/config /app/data/state/log /app/data/cache && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder_backend --chown=filestash:filestash /out/filestash /app/filestash
COPY --chown=filestash:filestash config/config.json /app/data/state/config/config.json
USER 10001:10001
EXPOSE 8334
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8334/healthz >/dev/null || exit 1
ENTRYPOINT ["/app/filestash"]

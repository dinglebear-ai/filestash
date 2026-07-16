SHELL := /bin/sh

GO ?= go
NPM ?= npm
GOFLAGS ?= -mod=readonly
GO_PACKAGES ?= ./server/... ./cmd/...
CRITICAL_GO_PACKAGES := ./server/common ./server/middleware ./server/ctrl ./server/model \
	./server/pkg/workflow/trigger ./server/plugin/plg_handler_mcp \
	./server/plugin/plg_handler_console ./server/plugin/plg_backend_dav
CRITICAL_GO_COVERAGE_MIN ?= 16.6
DIST_DIR ?= dist
BINARY := $(DIST_DIR)/filestash$(if $(filter windows,$(GOOS)),.exe)

GOVULNCHECK_VERSION := v1.6.0
CYCLONEDX_GOMOD_VERSION := v1.10.0
CYCLONEDX_NPM_VERSION := 6.0.0

.DEFAULT_GOAL := build
.PHONY: all init deps generate frontend-install frontend-check frontend-build frontend-budget \
	frontend-stage frontend-stage-check build build-backend test test-go test-race \
	benchmark vet audit audit-go audit-web sbom verify ci clean

all: verify

# Kept for compatibility with existing automation. This target never upgrades or
# rewrites the module graph; use `go get`/`go mod tidy` explicitly for upgrades.
init: deps generate

deps:
	$(GO) mod download
	$(GO) mod verify

generate: deps
	$(GO) generate -x ./server/...

frontend-install:
	$(NPM) ci --prefix web --no-audit --no-fund

frontend-check: frontend-install
	$(NPM) run lint --prefix web
	$(NPM) run typecheck --if-present --prefix web
	$(NPM) run test:coverage --prefix web

frontend-build: frontend-install
	$(NPM) run build --prefix web

frontend-stage: frontend-build
	node web/scripts/build-embed.mjs --apply --skip-build
	./scripts/check-web-assets.sh

frontend-budget:
	./scripts/check-web-assets.sh

# CI uses this to prove the checked-in embedded assets were produced by this SHA.
frontend-stage-check: frontend-stage
	git diff --exit-code -- public/

build: frontend-stage build-backend

build-backend: generate
	mkdir -p $(DIST_DIR)
	$(GO) build $(GOFLAGS) -trimpath -tags "fts5" -o $(BINARY) ./cmd

test: frontend-check test-go

test-go: generate
	mkdir -p $(DIST_DIR)
	$(GO) test $(GOFLAGS) -count=1 -covermode=atomic -coverprofile=$(DIST_DIR)/coverage-go.out $(GO_PACKAGES)
	./scripts/check-go-coverage.sh $(DIST_DIR)/coverage-go.out
	$(GO) test $(GOFLAGS) -count=1 -covermode=atomic -coverprofile=$(DIST_DIR)/coverage-go-critical.out $(CRITICAL_GO_PACKAGES)
	GO_COVERAGE_MIN=$(CRITICAL_GO_COVERAGE_MIN) ./scripts/check-go-coverage.sh $(DIST_DIR)/coverage-go-critical.out

test-race: generate
	CGO_ENABLED=1 $(GO) test $(GOFLAGS) -race -count=1 $(GO_PACKAGES)

benchmark: generate
	mkdir -p $(DIST_DIR)
	$(GO) test $(GOFLAGS) -run '^$$' -bench . -benchmem $(GO_PACKAGES) > $(DIST_DIR)/benchmarks.txt
	cat $(DIST_DIR)/benchmarks.txt

vet: generate
	$(GO) vet $(GOFLAGS) $(GO_PACKAGES)

audit: audit-go audit-web

audit-go: generate
	$(GO) run golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION) $(GO_PACKAGES)

audit-web: frontend-install
	$(NPM) audit --prefix web --omit=dev --audit-level=high

sbom: deps frontend-install
	mkdir -p $(DIST_DIR)
	$(GO) run github.com/CycloneDX/cyclonedx-gomod/cmd/cyclonedx-gomod@$(CYCLONEDX_GOMOD_VERSION) mod -json -test -std -noserial -notimestamp -output $(DIST_DIR)/sbom-go.cdx.json
	$(NPM) exec --yes --package=@cyclonedx/cyclonedx-npm@$(CYCLONEDX_NPM_VERSION) -- cyclonedx-npm --package-lock-only --output-reproducible --validate --output-file $(abspath $(DIST_DIR))/sbom-web.cdx.json web/package.json

verify: frontend-check frontend-budget vet test-go

ci: frontend-stage-check verify test-race benchmark audit sbom build-backend
	git diff --exit-code -- go.mod go.sum

clean:
	rm -rf $(DIST_DIR) web/out web/.next

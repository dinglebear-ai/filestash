#!/bin/sh
set -eu

profile=${1:-dist/coverage-go.out}
minimum=${GO_COVERAGE_MIN:-3.4}

test -s "$profile" || { echo "coverage profile not found: $profile" >&2; exit 1; }
coverage=$(go tool cover -func "$profile" | awk '/^total:/ {gsub(/%/, "", $3); print $3}')
test -n "$coverage" || { echo "unable to read total coverage" >&2; exit 1; }

awk -v actual="$coverage" -v minimum="$minimum" 'BEGIN {
  if ((actual + 0) < (minimum + 0)) {
    printf "Go coverage %.1f%% is below %.1f%%\n", actual, minimum > "/dev/stderr"
    exit 1
  }
  printf "Go coverage %.1f%% meets %.1f%% minimum\n", actual, minimum
}'

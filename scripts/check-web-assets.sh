#!/bin/sh
set -eu

root=${1:-public/assets/_next}
max_raw=${MAX_JS_CHUNK_BYTES:-1200000}
max_br=${MAX_BROTLI_CHUNK_BYTES:-400000}
max_total_br=${MAX_TOTAL_BROTLI_BYTES:-2500000}

test -d "$root" || { echo "asset directory not found: $root" >&2; exit 1; }

failed=0
total_br=0
# Next emits hashed paths without whitespace; keeping the loop in this shell lets
# the aggregate counters remain visible after iteration.
# shellcheck disable=SC2044
for asset in $(find "$root" -type f \( -name '*.js' -o -name '*.css' \) -print); do
    raw_size=$(wc -c < "$asset")
    if [ "$raw_size" -gt "$max_raw" ]; then
        echo "raw chunk exceeds ${max_raw} bytes: ${asset} (${raw_size})" >&2
        failed=1
    fi
    if [ "$raw_size" -ge 1024 ]; then
        for suffix in br gz; do
            test -s "${asset}.${suffix}" || {
                echo "missing precompressed sibling: ${asset}.${suffix}" >&2
                failed=1
            }
        done
    fi
    if [ -f "${asset}.br" ]; then
        br_size=$(wc -c < "${asset}.br")
        total_br=$((total_br + br_size))
        if [ "$br_size" -gt "$max_br" ]; then
            echo "Brotli chunk exceeds ${max_br} bytes: ${asset}.br (${br_size})" >&2
            failed=1
        fi
    fi
done

if [ "$total_br" -gt "$max_total_br" ]; then
    echo "total Brotli JS/CSS exceeds ${max_total_br} bytes (${total_br})" >&2
    failed=1
fi

echo "asset budget: total_brotli=${total_br} max_total=${max_total_br}"
exit "$failed"

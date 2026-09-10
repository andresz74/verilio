#!/usr/bin/env bash
set -euo pipefail

base_url=${1:-http://127.0.0.1:8080}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/verilio-smoke.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

curl --fail --silent --show-error "$base_url/" >"$work_dir/index.html"
grep -q '<div id="root"></div>' "$work_dir/index.html"

curl --fail --silent --show-error "$base_url/reports/summary" >"$work_dir/deep-route.html"
grep -q '<div id="root"></div>' "$work_dir/deep-route.html"

curl --fail --silent --show-error "$base_url/health/live" >"$work_dir/live.json"
grep -q '"status":"live"' "$work_dir/live.json"

curl --fail --silent --show-error "$base_url/health/ready" >"$work_dir/ready.json"
grep -q '"status":"ready"' "$work_dir/ready.json"
grep -q '"database":"connected"' "$work_dir/ready.json"

echo "Verilio gateway smoke test passed at $base_url."


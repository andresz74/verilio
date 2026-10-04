#!/usr/bin/env bash
# Resolve the canonical runtime without a Docker daemon, images or containers.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-compose-images-test.XXXXXX")
trap 'rm -rf "$work_root"' EXIT
env_file="$work_root/verilio.env"
passed=0

pass() { passed=$((passed + 1)); echo "ok $passed - $*"; }
fail() { echo "not ok - $*" >&2; exit 1; }

config() {
  # Ignore caller overrides and implicit .env files; only the fixture is input.
  env -i PATH="$PATH" HOME="$HOME" docker compose \
    --project-name verilio-compose-images-test --env-file "$env_file" \
    -f "$repo_root/compose.prod.yml" config --format json
}

fixture() {
  printf 'LOCAL_USER_ID=00000000-0000-4000-8000-000000000001\n' >"$env_file"
}

assert_images() {
  config >"$work_root/config.json"
  node - "$work_root/config.json" "$1" "$2" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [file, api, gateway] = process.argv.slice(2);
const { services } = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(services.migrate.image, api);
assert.equal(services.api.image, api);
assert.equal(services.gateway.image, gateway);
assert.equal(services.postgres.image, 'postgres:17.9-alpine');
for (const service of Object.values(services)) {
  assert.ok(!service.image.endsWith(':latest'), service.image);
}
NODE
}

assert_version_required() {
  if config >"$work_root/output" 2>&1; then
    fail 'Compose accepted a missing or empty VERILIO_VERSION'
  fi
  grep -Fq 'Set VERILIO_VERSION to an explicit release tag' "$work_root/output" ||
    fail 'Compose did not report the required explicit version'
}

fixture
echo 'VERILIO_VERSION=v9.8.7-test' >>"$env_file"
assert_images verilio-api:v9.8.7-test verilio-gateway:v9.8.7-test
pass 'omitted repositories preserve local API/migrate/gateway names and pinned PostgreSQL'

cat >>"$env_file" <<'EOF'
VERILIO_API_IMAGE=example.test/verilio-api
VERILIO_GATEWAY_IMAGE=example.test/verilio-gateway
EOF
assert_images example.test/verilio-api:v9.8.7-test example.test/verilio-gateway:v9.8.7-test
pass 'custom repositories use the separate explicit version and preserve pinned PostgreSQL'

fixture
cat >>"$env_file" <<'EOF'
VERILIO_VERSION=v9.8.7-test
VERILIO_API_IMAGE=
VERILIO_GATEWAY_IMAGE=
EOF
assert_images verilio-api:v9.8.7-test verilio-gateway:v9.8.7-test
pass 'empty repositories also retain local defaults'

fixture
assert_version_required
pass 'omitted version fails instead of defaulting to latest'

echo 'VERILIO_VERSION=' >>"$env_file"
assert_version_required
pass 'empty version fails instead of defaulting to latest'

cp "$repo_root/deploy/verilio.env.example" "$env_file"
assert_images verilio-api:v0.1.0 verilio-gateway:v0.1.0
pass 'environment template retains local image names and its explicit version'

echo "$passed Compose image resolution tests passed."

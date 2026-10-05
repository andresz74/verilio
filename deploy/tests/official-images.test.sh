#!/usr/bin/env bash
# Validate contract/package resolution only; no registry or daemon required.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-official-images-test.XXXXXX")
trap 'rm -rf "$work_root"' EXIT
contract="$repo_root/deploy/official-images.env"
passed=0
pass() { passed=$((passed + 1)); echo "ok $passed - $*"; }
fail() { echo "not ok - $*" >&2; exit 1; }

[[ -f "$contract" ]] || fail 'missing official image contract'
pass 'machine-readable official contract exists'

node - "$contract" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const expected = [
  'VERILIO_OFFICIAL_API_IMAGE=ghcr.io/andresz74/verilio-api',
  'VERILIO_OFFICIAL_GATEWAY_IMAGE=ghcr.io/andresz74/verilio-gateway',
  'VERILIO_OFFICIAL_PLATFORM=linux/amd64',
];
const content = fs.readFileSync(process.argv[2], 'utf8');
assert.equal(content, `${expected.join('\n')}\n`);
for (const line of content.trimEnd().split('\n')) {
  const [key, value] = line.split('=');
  assert.match(key, /^VERILIO_OFFICIAL_[A-Z_]+$/);
  assert.equal(value, value.toLowerCase());
  assert.ok(!/[:@$'"\s]/.test(value), `non-literal/tag/digest value: ${value}`);
  assert.ok(!value.includes('latest'));
}
NODE
pass 'exact lowercase repository-only values and amd64 platform, plain assignments without tags/digests/latest'

# Source only after validating the exact literal, non-secret file above.
# shellcheck disable=SC1090
source "$contract"

real_docker=$(command -v docker)
export REAL_DOCKER=$real_docker TEST_LOG="$work_root/external.log"
mkdir "$work_root/bin"
cat >"$work_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >>"$TEST_LOG"
if [[ "${1:-}" == compose && " $* " == *' config '* ]]; then
  exec "$REAL_DOCKER" "$@"
fi
echo 'Only docker compose config is permitted.' >&2
exit 1
EOF
cat >"$work_root/bin/forbidden" <<'EOF'
#!/usr/bin/env bash
echo "forbidden $0 $*" >>"$TEST_LOG"
exit 1
EOF
chmod +x "$work_root/bin/docker" "$work_root/bin/forbidden"
for command_name in curl wget ssh sudo; do
  ln -s forbidden "$work_root/bin/$command_name"
done
export PATH="$work_root/bin:$PATH"
: >"$TEST_LOG"

"$repo_root/deploy/export-self-host-package.sh" v9.8.7-test \
  "$VERILIO_OFFICIAL_API_IMAGE" "$VERILIO_OFFICIAL_GATEWAY_IMAGE" "$work_root/package" >/dev/null
package_dir="$work_root/package/verilio-v9.8.7-test-self-host"
[[ ! -s "$TEST_LOG" ]] || fail 'package export invoked Docker, network or sudo'
cmp "$repo_root/compose.prod.yml" "$package_dir/compose.yml" || fail 'canonical runtime diverged'
pass 'generic D02 exporter accepts official repositories without image/network actions'

env -i PATH="$PATH" HOME="$HOME" REAL_DOCKER="$REAL_DOCKER" TEST_LOG="$TEST_LOG" \
  DOCKER_HOST="unix://$work_root/no-daemon.sock" docker compose \
  --env-file "$package_dir/verilio.env.example" -f "$package_dir/compose.yml" \
  config --format json >"$work_root/config.json"

node - "$work_root/config.json" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { services } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.equal(services.api.image, 'ghcr.io/andresz74/verilio-api:v9.8.7-test');
assert.equal(services.migrate.image, 'ghcr.io/andresz74/verilio-api:v9.8.7-test');
assert.equal(services.gateway.image, 'ghcr.io/andresz74/verilio-gateway:v9.8.7-test');
assert.equal(services.postgres.image, 'postgres:17.9-alpine');
NODE
pass 'Compose resolves exact official test tags and pinned PostgreSQL without daemon'

[[ "$(wc -l <"$TEST_LOG" | tr -d ' ')" == 1 ]] || fail 'unexpected external actions'
grep -Fq ' config --format json' "$TEST_LOG" || fail 'expected config-only invocation'
pass 'only Compose config ran; no pull/push/build/login or registry network action'

echo "$passed official image contract tests passed."

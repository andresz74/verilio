#!/usr/bin/env bash
# Entire source/Docker/registry interaction is mocked; no tags or images are created.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-publish-test.XXXXXX")
trap 'rm -rf "$work_root"' EXIT
mkdir -p "$work_root/fixture/deploy" "$work_root/bin"
cp "$repo_root/deploy/"{publish-release-images.sh,verify-official-release-source.sh,official-images.env} "$work_root/fixture/deploy/"
export TEST_ROOT="$work_root" TEST_LOG="$work_root/commands" GITHUB_STEP_SUMMARY="$work_root/summary"
export PATH="$work_root/bin:$PATH"
cat >"$work_root/bin/git" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
shift 2 # -C repository
case "$*" in
  'remote get-url origin') echo "${FAKE_ORIGIN:-https://github.com/andresz74/verilio.git}" ;;
  'status --porcelain') [[ "${SCENARIO:-}" != status-error ]] || exit 128; [[ "${SCENARIO:-}" != dirty ]] || echo ' M tracked-file' ;;
  'symbolic-ref --quiet HEAD') [[ "${SCENARIO:-}" != symbolic-error ]] || exit 128; [[ "${SCENARIO:-}" == branch ]] || exit 1; echo refs/heads/main ;;
  'rev-parse HEAD') printf '%040d\n' 1 ;;
  'rev-parse --verify refs/tags/v9.8.7-test^{commit}')
    [[ "${SCENARIO:-}" != missing-tag ]] || exit 1
    if [[ "${SCENARIO:-}" == mismatch ]]; then printf '%040d\n' 2; else printf '%040d\n' 1; fi ;;
  *) echo "Unexpected git operation: $*" >&2; exit 1 ;;
esac
MOCK
cat >"$work_root/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
anonymous=false
if [[ "${DOCKER_CONFIG:-}" == *'/anonymous' ]]; then
  anonymous=true
  node - "$DOCKER_CONFIG/config.json" <<'NODE'
const assert = require('node:assert/strict');
const c = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
assert.deepEqual(Object.keys(c).sort(), ['auths', 'cliPluginsExtraDirs']);
assert.deepEqual(c.auths, {});
assert.equal(c.cliPluginsExtraDirs.length, 1);
NODE
fi
printf '%s docker %s\n' "$anonymous" "$*" >>"$TEST_LOG"
api_id="sha256:$(printf '%064d' 1)"
gateway_id="sha256:$(printf '%064d' 2)"
ref=${3:-}
service=api
[[ "$*" != *verilio-gateway* ]] || service=gateway
id=$api_id
[[ "$service" != gateway ]] || id=$gateway_id
labels() {
  local source=https://github.com/andresz74/verilio version=v9.8.7-test revision platform=amd64
  revision=$(printf '%040d' 1)
  case "${SCENARIO:-}" in
    wrong-api-source) [[ "$service" != api ]] || source=https://wrong.invalid ;;
    wrong-gateway-source) [[ "$service" != gateway ]] || source=https://wrong.invalid ;;
    wrong-version) version=v9.8.6 ;;
    wrong-revision) revision=$(printf '%040d' 2) ;;
    wrong-platform) platform=arm64 ;;
    remote-metadata) [[ "$1" != remote ]] || source=https://wrong.invalid ;;
  esac
  if [[ "$1" == local ]]; then
    printf '[{"Id":"%s","Os":"linux","Architecture":"%s","Config":' "$id" "$platform"
  else
    printf '{"os":"linux","architecture":"%s","config":' "$platform"
  fi
  printf '{"Labels":{"org.opencontainers.image.source":"%s","org.opencontainers.image.version":"%s","org.opencontainers.image.revision":"%s"}}}' "$source" "$version" "$revision"
  [[ "$1" != local ]] || printf ']'
  echo
}
case "$1 ${2:-}" in
  'image inspect')
    [[ "${SCENARIO:-}" != "missing-$service" ]] || exit 1
    labels local ;;
  'buildx imagetools')
    [[ "${3:-}" == inspect ]] || exit 1
    if [[ "$anonymous" == true && "${SCENARIO:-}" == "anonymous-$service" ]]; then
      echo 'unauthorized: package is private' >&2; exit 1
    fi
    if [[ ! -f "$TEST_ROOT/pushed-$service" ]]; then
      case "${SCENARIO:-}" in
        both-exist) echo '{}'; exit 0 ;;
        partial-api) [[ "$service" != api ]] || { echo '{}'; exit 0; } ;;
        partial-gateway) [[ "$service" != gateway ]] || { echo '{}'; exit 0; } ;;
        registry-error) echo 'unexpected registry error' >&2; exit 1 ;;
        registry-auth) echo 'unauthorized: not found' >&2; exit 1 ;;
      esac
      echo 'ERROR: manifest unknown' >&2; exit 1
    fi
    if [[ "${*: -1}" == --raw ]]; then
      [[ "${SCENARIO:-}" != remote-object ]] || id="sha256:$(printf '%064d' 3)"
      printf '{"schemaVersion":2,"config":{"digest":"%s"}}\n' "$id"
    elif [[ "${*: -1}" == '{{.Manifest.Digest}}' ]]; then
      if [[ "$service" == api ]]; then printf 'sha256:%064d\n' 3; else printf 'sha256:%064d\n' 4; fi
    elif [[ "${*: -1}" == '{{json .Image}}' ]]; then
      labels remote
    else exit 1; fi ;;
  'tag '*)
    [[ $# == 3 ]] || exit 1
    [[ "$2" == "$id" ]] || exit 1 ;;
  'push '*)
    [[ $# == 2 ]] || exit 1
    [[ "${SCENARIO:-}" != push-failure || "$service" != gateway ]] || exit 1
    touch "$TEST_ROOT/pushed-$service" ;;
  'logout ghcr.io') exit 0 ;;
  *) echo "Forbidden Docker command: $*" >&2; exit 1 ;;
esac
MOCK
cat >"$work_root/bin/forbidden" <<'MOCK'
#!/usr/bin/env bash
echo "Forbidden external operation $0" >&2
exit 1
MOCK
chmod +x "$work_root/bin/"*
for command_name in curl wget ssh sudo; do ln -s forbidden "$work_root/bin/$command_name"; done
passed=0
pass() { passed=$((passed + 1)); echo "ok $passed - $*"; }
fail() { echo "not ok - $*" >&2; cat "$work_root/output" >&2; exit 1; }
reset() {
  rm -f "$work_root/pushed-api" "$work_root/pushed-gateway"
  : >"$TEST_LOG"
  : >"$GITHUB_STEP_SUMMARY"
}
reject() {
  local scenario=$1; shift
  reset
  if SCENARIO="$scenario" "$work_root/fixture/deploy/publish-release-images.sh" "$@" >"$work_root/output" 2>&1; then fail "accepted $scenario"; fi
  if grep -Eq ' docker (tag|push) ' "$TEST_LOG"; then fail "mutated images before rejecting $scenario"; fi
  pass "$scenario rejected before tagging/pushing"
}
reject missing-version
reject latest latest
reject invalid 'v9.8.7;evil'
reject floating alpha
reject snapshot main-123456789abc
reject missing-tag v9.8.7-test
reject mismatch v9.8.7-test
reject dirty v9.8.7-test
reject status-error v9.8.7-test
reject symbolic-error v9.8.7-test
reject branch v9.8.7-test
FAKE_ORIGIN=https://github.com/other/verilio.git reject wrong-origin v9.8.7-test
GITHUB_REPOSITORY=other/verilio reject wrong-repository v9.8.7-test
for scenario in missing-api missing-gateway wrong-api-source wrong-gateway-source wrong-version wrong-revision wrong-platform; do
  reject "$scenario" v9.8.7-test
done
VERILIO_QUALIFIED_API_IMAGE_ID=changed reject changed-tested-api v9.8.7-test
VERILIO_QUALIFIED_GATEWAY_IMAGE_ID=changed reject changed-tested-gateway v9.8.7-test
for scenario in both-exist partial-api partial-gateway registry-error registry-auth; do reject "$scenario" v9.8.7-test; done

# A modified executable contract must fail before any Docker or shell side effect.
printf '\necho executable > %s\n' "$work_root/contract-executed" >>"$work_root/fixture/deploy/official-images.env"
reject modified-contract v9.8.7-test
[[ ! -e "$work_root/contract-executed" && ! -s "$TEST_LOG" ]] || fail 'unvalidated contract evaluated'
cp "$repo_root/deploy/official-images.env" "$work_root/fixture/deploy/"
reject unexpected-credential-argument v9.8.7-test token-sentinel
! grep -Fq token-sentinel "$work_root/output" || fail 'argument credential printed'

reset
# Ambient repository overrides cannot replace the literal contract; secrets are ignored.
SCENARIO=success VERILIO_OFFICIAL_API_IMAGE=evil.invalid/api VERILIO_OFFICIAL_GATEWAY_IMAGE=evil.invalid/gateway \
  GITHUB_TOKEN=secret-sentinel "$work_root/fixture/deploy/publish-release-images.sh" v9.8.7-test >"$work_root/output" 2>&1 || fail 'valid mocked publication failed'
pass 'both remote tags absent allows publication'
[[ "$(grep -c ' docker tag ' "$TEST_LOG")" == 2 ]] || fail 'expected two tags'
[[ "$(grep -c ' docker push ' "$TEST_LOG")" == 2 ]] || fail 'expected two pushes'
expected_refs=$(printf '%s\n' 'ghcr.io/andresz74/verilio-api:v9.8.7-test' 'ghcr.io/andresz74/verilio-gateway:v9.8.7-test')
actual_refs=$(sed -n 's/^false docker push //p' "$TEST_LOG")
[[ "$actual_refs" == "$expected_refs" ]] || fail 'unexpected push refs'
actual_tag_refs=$(sed -n 's/^false docker tag [^ ]* //p' "$TEST_LOG")
[[ "$actual_tag_refs" == "$expected_refs" ]] || fail 'unexpected tag refs'
pass 'exactly two contract refs tagged by validated image IDs and pushed; no floating aliases or overrides'
! grep -Eq ' docker (login|pull|build) |evil.invalid|secret-sentinel|token-sentinel' "$TEST_LOG" "$work_root/output" "$GITHUB_STEP_SUMMARY" || fail 'forbidden command or credential exposure'
pass 'helper never logs in, builds, pulls, accepts or prints credentials'
node - "$TEST_LOG" "$GITHUB_STEP_SUMMARY" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8');
const summary = fs.readFileSync(process.argv[3], 'utf8');
assert.ok(log.indexOf('docker logout ghcr.io') < log.indexOf('true docker buildx'));
for (const service of ['api', 'gateway']) {
  assert.ok(log.includes(`true docker buildx imagetools inspect ghcr.io/andresz74/verilio-${service}:v9.8.7-test --raw`));
}
assert.ok(summary.includes('Verilio version: v9.8.7-test'));
assert.ok(summary.includes('Source commit: ' + '1'.padStart(40, '0')));
assert.ok(summary.includes('Platform: linux/amd64'));
assert.equal((summary.match(/Digest: sha256:[0-9a-f]{64}/g) ?? []).length, 2);
assert.ok(summary.includes('Anonymous API verification: passed'));
assert.ok(summary.includes('Anonymous Gateway verification: passed'));
NODE
pass 'logout precedes empty-config anonymous inspections and receipt contains refs/digests/source/platform/results'
for scenario in remote-metadata remote-object anonymous-api anonymous-gateway push-failure; do
  reset
  if SCENARIO="$scenario" "$work_root/fixture/deploy/publish-release-images.sh" v9.8.7-test >"$work_root/output" 2>&1; then fail "accepted $scenario"; fi
  grep -q 'docker logout ghcr.io' "$TEST_LOG" || fail 'authentication cleanup missing'
  [[ -s "$GITHUB_STEP_SUMMARY" ]] || fail 'failure receipt missing'
  if [[ "$scenario" == anonymous-* ]]; then
    grep -q 'Inspect GHCR package visibility' "$work_root/output" || fail 'missing visibility guidance'
    grep -q 'verification: failed' "$GITHUB_STEP_SUMMARY" || fail 'missing failed verification receipt'
  fi
  pass "$scenario fails with receipt and logout; no automatic deletion/visibility mutation"
done

echo "$passed publishing helper tests passed (all source and registry operations mocked)."

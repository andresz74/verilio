#!/usr/bin/env bash
# Caller qualifies these local images and authenticates first. Never builds/logs in.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
version=${1:-}
evidence_dir=''
if [[ $# != 1 ]]; then
  [[ $# == 3 && $2 == --evidence-dir && -n $3 ]] || { echo 'Expected version [--evidence-dir <directory>]' >&2; exit 64; }
  evidence_dir=$3
fi
commit=$("$repo_root/deploy/verify-official-release-source.sh" "$version")
if [[ -n "$evidence_dir" ]]; then
  node "$repo_root/deploy/release-evidence.mjs" validate "$evidence_dir" "$version" "$commit"
fi
publication_status() {
  [[ -z "$evidence_dir" ]] || node "$repo_root/deploy/release-evidence.mjs" status "$evidence_dir" "$1" "$2"
}
# Source only after validating the literal non-secret contract.
# shellcheck disable=SC1091
source "$repo_root/deploy/official-images.env"
api_ref="$VERILIO_OFFICIAL_API_IMAGE:$version"
gateway_ref="$VERILIO_OFFICIAL_GATEWAY_IMAGE:$version"
source_url=https://github.com/andresz74/verilio
fail() { echo "$*" >&2; exit 1; }

validate_config() {
  node - "$1" "$version" "$commit" "$source_url" "$VERILIO_OFFICIAL_PLATFORM" <<'NODE'
const fs = require('node:fs');
const [file, version, commit, source, platform] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const image = Array.isArray(data) ? data[0] : data;
const labels = (image.Config ?? image.config)?.Labels ?? {};
if (`${image.Os ?? image.os}/${image.Architecture ?? image.architecture}` !== platform ||
    labels['org.opencontainers.image.source'] !== source ||
    labels['org.opencontainers.image.version'] !== version ||
    labels['org.opencontainers.image.revision'] !== commit) {
  console.error('Image platform or OCI source/version/revision does not match the official release.');
  process.exit(1);
}
if (Array.isArray(data)) {
  if (!/^sha256:[0-9a-f]{64}$/.test(image.Id)) process.exit(1);
  console.log(image.Id);
}
NODE
}

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/verilio-publish.XXXXXX")
api_digest='not verified'
gateway_digest='not verified'
api_anonymous='not attempted'
gateway_anonymous='not attempted'
registry_started=false
logged_out=false
receipt() {
  printf 'Verilio version: %s\nSource commit: %s\nPlatform: %s\n\n' "$version" "$commit" "$VERILIO_OFFICIAL_PLATFORM"
  printf 'API: %s\nDigest: %s\nAnonymous API verification: %s\n\n' "$api_ref" "$api_digest" "$api_anonymous"
  printf 'Gateway: %s\nDigest: %s\nAnonymous Gateway verification: %s\n' "$gateway_ref" "$gateway_digest" "$gateway_anonymous"
}
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$registry_started" == true && "$logged_out" == false ]]; then
    docker logout ghcr.io >/dev/null 2>&1 || true
  fi
  if [[ "$result" != 0 && -n "$evidence_dir" ]]; then
    publication_status publication failed_review_registry_state || true
  fi
  receipt
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    { echo '### Verilio official image publication'; echo '```text'; receipt; echo '```'; } >>"$GITHUB_STEP_SUMMARY"
  fi
  rm -rf "$work_dir"
  exit "$result"
}
trap cleanup EXIT

for service in api gateway; do
  docker image inspect "verilio-$service:$version" >"$work_dir/$service.json" || fail "Missing local $service release image."
done
api_id=$(validate_config "$work_dir/api.json")
gateway_id=$(validate_config "$work_dir/gateway.json")
if [[ -n "$evidence_dir" ]]; then
  required_api_id=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1])).images.api.id)' "$evidence_dir/qualification.json")
  required_gateway_id=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1])).images.gateway.id)' "$evidence_dir/qualification.json")
  [[ "$api_id" == "$required_api_id" && "$gateway_id" == "$required_gateway_id" ]] || fail 'Strict qualified image identity changed.'
fi
# Workflow captures IDs immediately after build, before the disposable release gate.
[[ -z "${VERILIO_QUALIFIED_API_IMAGE_ID:-}" || "$api_id" == "$VERILIO_QUALIFIED_API_IMAGE_ID" ]] || fail 'API image changed after qualification.'
[[ -z "${VERILIO_QUALIFIED_GATEWAY_IMAGE_ID:-}" || "$gateway_id" == "$VERILIO_QUALIFIED_GATEWAY_IMAGE_ID" ]] || fail 'Gateway image changed after qualification.'

remote_exists() {
  if docker buildx imagetools inspect "$1" --raw >"$work_dir/remote.json" 2>"$work_dir/remote.error"; then
    printf true
  elif grep -Eiq '(unauthorized|denied|forbidden|timeout|connection|TLS)' "$work_dir/remote.error"; then
    fail "Cannot establish remote tag absence for $1; registry/authentication error. No publication attempted."
  elif grep -Eiq '(manifest unknown|MANIFEST_UNKNOWN|: not found)' "$work_dir/remote.error"; then
    printf false
  else
    fail "Cannot establish remote tag absence for $1; registry inspection failed. No publication attempted."
  fi
}
registry_started=true
api_exists=$(remote_exists "$api_ref")
gateway_exists=$(remote_exists "$gateway_ref")
if [[ "$api_exists" == true && "$gateway_exists" == true ]]; then
  fail 'Both immutable official tags already exist; refusing to republish.'
elif [[ "$api_exists" == true || "$gateway_exists" == true ]]; then
  fail "Partial registry state: API exists=$api_exists, Gateway exists=$gateway_exists. Inspect manually; no overwrite or deletion performed."
fi

# Pin by validated local image ID, so mutable local aliases cannot swap the objects.
docker tag "$api_id" "$api_ref"
docker tag "$gateway_id" "$gateway_ref"
publication_status api push_attempted_remote_state_unknown
docker push "$api_ref" || fail 'API push failed; inspect possible partial registry state before retrying.'
publication_status api push_accepted_unverified
publication_status gateway push_attempted_remote_state_unknown
docker push "$gateway_ref" || fail 'Gateway push failed; API may be published. Inspect partial registry state before retrying.'

publication_status gateway push_accepted_unverified

verify_remote() {
  local ref=$1 expected_id=$2 expected_digest=${3:-} digest config_id
  digest=$(docker buildx imagetools inspect "$ref" --format '{{.Manifest.Digest}}') || return 1
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [[ -z "$expected_digest" || "$digest" == "$expected_digest" ]] || return 1
  docker buildx imagetools inspect "$ref@$digest" --raw >"$work_dir/manifest.json" || return 1
  config_id=$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); if(m.manifests || !m.config?.digest) process.exit(1); console.log(m.config.digest)' "$work_dir/manifest.json") || return 1
  [[ "$config_id" == "$expected_id" ]] || return 1
  docker buildx imagetools inspect "$ref@$digest" --format '{{json .Image}}' >"$work_dir/remote-config.json" || return 1
  validate_config "$work_dir/remote-config.json" || return 1
  [[ "$(docker buildx imagetools inspect "$ref" --format '{{.Manifest.Digest}}')" == "$digest" ]] || return 1
  printf '%s\n' "$digest"
}
api_digest=$(verify_remote "$api_ref" "$api_id") || fail 'Published API metadata/object verification failed; inspect registry state manually.'
gateway_digest=$(verify_remote "$gateway_ref" "$gateway_id") || fail 'Published Gateway metadata/object verification failed; inspect registry state manually.'
docker logout ghcr.io >/dev/null
logged_out=true
# Empty config guarantees anonymity even if ambient credential helpers exist.
mkdir "$work_dir/anonymous"
# Preserve only CLI plugin discovery (setup-buildx installs into the original config),
# never the original auths/credsStore/credHelpers.
node - "${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins" >"$work_dir/anonymous/config.json" <<'NODE'
console.log(JSON.stringify({auths: {}, cliPluginsExtraDirs: [process.argv[2]]}));
NODE
anonymous_failed=false
api_anonymous=failed
gateway_anonymous=failed
if DOCKER_CONFIG="$work_dir/anonymous" verify_remote "$api_ref" "$api_id" "$api_digest" >/dev/null; then api_anonymous=passed; publication_status api anonymous_verified; else anonymous_failed=true; fi
if DOCKER_CONFIG="$work_dir/anonymous" verify_remote "$gateway_ref" "$gateway_id" "$gateway_digest" >/dev/null; then gateway_anonymous=passed; publication_status gateway anonymous_verified; else anonymous_failed=true; fi
[[ "$anonymous_failed" == false ]] || fail 'Anonymous verification failed. Inspect GHCR package visibility/linkage; no permissions changed or published images deleted.'

if [[ -n "$evidence_dir" ]]; then
  node "$repo_root/deploy/release-evidence.mjs" publish-receipt "$evidence_dir" "$api_digest" "$gateway_digest"
fi

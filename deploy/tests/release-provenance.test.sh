#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-provenance-test.XXXXXX")
trap 'rm -rf "$work_root"' EXIT

passed=0

fail() {
  echo "not ok - $*" >&2
  exit 1
}

pass() {
  passed=$((passed + 1))
  echo "ok $passed - $1"
}

assert_contains() {
  local value=$1
  local expected=$2
  grep --fixed-strings --quiet "$expected" <<<"$value" ||
    fail "expected output to contain: $expected"
}

assert_log_excludes_mutations() {
  local log_file=$1
  if grep -E --quiet '(^| )load($| )|backup |pg_dump| compose .* (stop|up) ' "$log_file"; then
    fail "unexpected deployment mutation was recorded in $log_file"
  fi
}

make_fake_docker() {
  local bin_dir=$1
  mkdir -p "$bin_dir"
  cat >"$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"$TEST_LOG"

if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  image=${*: -1}
  case "$image" in
    verilio-api:*) printf '%s\n' "${FAKE_LOADED_API_ID:-sha256:api-${image#verilio-api:}}" ;;
    verilio-gateway:*) printf '%s\n' "${FAKE_LOADED_GATEWAY_ID:-sha256:gateway-${image#verilio-gateway:}}" ;;
    postgres:*) printf '%s\n' "${FAKE_LOADED_POSTGRES_ID:-sha256:postgres}" ;;
    *) exit 1 ;;
  esac
  exit 0
fi

if [[ "${1:-}" == "inspect" ]]; then
  container=${*: -1}
  case "$container" in
    api-container) printf '%s\n' "$FAKE_SOURCE_API_IMAGE" ;;
    gateway-container) printf '%s\n' "$FAKE_SOURCE_GATEWAY_IMAGE" ;;
    *) exit 1 ;;
  esac
  exit 0
fi

if [[ "${1:-}" == "load" ]]; then
  cat >/dev/null
  exit 0
fi

if [[ "${1:-}" == "compose" ]]; then
  command_line=" $* "
  case "$command_line" in
    *" ps --all --quiet api "*) [[ -n "${FAKE_SOURCE_API_IMAGE:-}" ]] && echo api-container ;;
    *" ps --all --quiet gateway "*) [[ -n "${FAKE_SOURCE_GATEWAY_IMAGE:-}" ]] && echo gateway-container ;;
    *" ps --status running postgres "*) [[ "${FAKE_POSTGRES_RUNNING:-false}" == "true" ]] && echo postgres ;;
    *" show server_version "*) echo 17.9 ;;
    *" select count(*) from drizzle.__drizzle_migrations "*) echo 9 ;;
    *" pg_dumpall "*) echo "fake globals" ;;
    *" pg_dump "*) echo "fake custom dump" ;;
  esac
  exit 0
fi

exit 1
EOF
  chmod +x "$bin_dir/docker"
}

write_checksums() {
  local release_dir=$1
  (
    cd "$release_dir"
    find . -type f ! -name checksums.txt -print0 | sort -z | xargs -0 sha256sum >checksums.txt
  )
}

create_fixture() {
  local case_dir=$1
  local directory_version=$2
  local env_version=${3:-$directory_version}
  local manifest_version=${4:-$directory_version}
  local api_tag=${5:-verilio-api:$directory_version}
  local gateway_tag=${6:-verilio-gateway:$directory_version}
  local postgres_tag=${7:-postgres:17.9-alpine}
  local release_dir="$case_dir/verilio-$directory_version"
  local archive_dir="$case_dir/archive"

  mkdir -p "$release_dir/deploy" "$archive_dir" "$case_dir/backups"
  cp "$repo_root/deploy/verify-release-provenance.sh" "$release_dir/deploy/"
  cp "$repo_root/deploy/server-deploy.sh" "$release_dir/deploy/"
  cp "$repo_root/deploy/backup.sh" "$release_dir/deploy/"
  cat >"$release_dir/deploy/smoke-test.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "smoke $*" >>"$TEST_LOG"
EOF
  chmod +x "$release_dir/deploy/"*.sh

  cat >"$release_dir/compose.prod.yml" <<EOF
services:
  postgres:
    image: postgres:17.9-alpine
  api:
    image: verilio-api:\${VERILIO_VERSION}
  gateway:
    image: verilio-gateway:\${VERILIO_VERSION}
EOF
  cat >"$release_dir/release-manifest.txt" <<EOF
verilio_version=$manifest_version
source_commit=test
platform=linux/amd64
api_image=verilio-api:$manifest_version
api_image_id=sha256:api-$manifest_version
gateway_image=verilio-gateway:$manifest_version
gateway_image_id=sha256:gateway-$manifest_version
postgres_image=postgres:17.9-alpine
postgres_image_id=sha256:postgres
latest_migration=0000_test.sql
created_utc=2026-09-21T00:00:00Z
EOF
  cat >"$archive_dir/manifest.json" <<EOF
[
  {"Config":"api.json","RepoTags":["$api_tag"],"Layers":[]},
  {"Config":"gateway.json","RepoTags":["$gateway_tag"],"Layers":[]},
  {"Config":"postgres.json","RepoTags":["$postgres_tag"],"Layers":[]}
]
EOF
  tar --create --file - --directory "$archive_dir" manifest.json |
    gzip >"$release_dir/verilio-$directory_version-images.tar.gz"

  cat >"$case_dir/verilio.env" <<EOF
COMPOSE_PROJECT_NAME=verilio-test
VERILIO_VERSION=$env_version
LOCAL_USER_ID=00000000-0000-4000-8000-000000000001
VERILIO_GATEWAY_PORT=8080
VERILIO_BACKUP_DIR=$case_dir/backups
VERILIO_BACKUP_RETENTION_DAYS=7
EOF
  write_checksums "$release_dir"
  FIXTURE_RELEASE_DIR=$release_dir
  FIXTURE_ENV_FILE=$case_dir/verilio.env
}

reset_fake_state() {
  local log_file=$1
  : >"$log_file"
  export TEST_LOG=$log_file
  export FAKE_SOURCE_API_IMAGE=
  export FAKE_SOURCE_GATEWAY_IMAGE=
  export FAKE_POSTGRES_RUNNING=false
  unset FAKE_LOADED_API_ID FAKE_LOADED_GATEWAY_ID FAKE_LOADED_POSTGRES_ID || true
}

run_fails() {
  local output_file=$1
  shift
  if "$@" >"$output_file" 2>&1; then
    fail "command unexpectedly succeeded: $*"
  fi
}

bin_dir="$work_root/bin"
make_fake_docker "$bin_dir"
export PATH="$bin_dir:$PATH"

# 1. Fully matching target provenance.
case_dir="$work_root/matching"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
"$release_dir/deploy/verify-release-provenance.sh" "$env_file" >/dev/null
[[ ! -s "$TEST_LOG" ]] || fail "pre-load verification unexpectedly invoked Docker"
pass "matching release provenance succeeds without Docker mutation"

# 2. Environment and physical release directory mismatch.
case_dir="$work_root/directory-mismatch"
create_fixture "$case_dir" v0.1.1-alpha.2 v0.1.1-alpha.1
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "release directory 'verilio-v0.1.1-alpha.2' does not match VERILIO_VERSION 'v0.1.1-alpha.1'"
assert_log_excludes_mutations "$TEST_LOG"
pass "directory and environment mismatch fails before side effects"

# 3. Environment and release manifest mismatch with valid checksums.
case_dir="$work_root/manifest-mismatch"
create_fixture "$case_dir" v0.1.1-alpha.2 v0.1.1-alpha.2 v0.1.1-alpha.1
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "release manifest version 'v0.1.1-alpha.1' does not match VERILIO_VERSION 'v0.1.1-alpha.2'"
assert_log_excludes_mutations "$TEST_LOG"
pass "manifest version mismatch fails before side effects"

# 4. Expected target image archive is missing.
case_dir="$work_root/missing-archive"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
rm "$release_dir/verilio-v0.1.1-alpha.2-images.tar.gz"
write_checksums "$release_dir"
reset_fake_state "$case_dir/docker.log"
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "missing expected image archive: verilio-v0.1.1-alpha.2-images.tar.gz"
assert_log_excludes_mutations "$TEST_LOG"
pass "missing target archive fails before side effects"

# 5. Docker archive contains tags from another release.
case_dir="$work_root/archive-tags"
create_fixture "$case_dir" v0.1.1-alpha.2 v0.1.1-alpha.2 v0.1.1-alpha.2 verilio-api:v0.1.1-alpha.1 verilio-gateway:v0.1.1-alpha.1
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "image archive is missing expected tag 'verilio-api:v0.1.1-alpha.2'"
assert_log_excludes_mutations "$TEST_LOG"
pass "archive RepoTag mismatch fails before side effects"

# 6. A corrupted checksummed release fails before Docker is called.
case_dir="$work_root/checksum-failure"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
printf '\n# corrupted\n' >>"$release_dir/compose.prod.yml"
reset_fake_state "$case_dir/docker.log"
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "release checksums failed"
assert_log_excludes_mutations "$TEST_LOG"
pass "checksum failure prevents deployment side effects"

# 7. Normal source-to-target update records both versions before maintenance.
case_dir="$work_root/source-target"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
export FAKE_SOURCE_API_IMAGE=verilio-api:v0.1.1-alpha.1
export FAKE_SOURCE_GATEWAY_IMAGE=verilio-gateway:v0.1.1-alpha.1
export FAKE_POSTGRES_RUNNING=true
VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh" >/dev/null
backup_manifest=$(find "$case_dir/backups" -name manifest.txt -print -quit)
[[ -n "$backup_manifest" ]] || fail "predeploy backup manifest was not created"
assert_contains "$(cat "$backup_manifest")" "backup_kind=predeploy"
assert_contains "$(cat "$backup_manifest")" "source_verilio_version=v0.1.1-alpha.1"
assert_contains "$(cat "$backup_manifest")" "target_verilio_version=v0.1.1-alpha.2"
assert_contains "$(cat "$backup_manifest")" "source_api_image=verilio-api:v0.1.1-alpha.1"
assert_contains "$(cat "$backup_manifest")" "source_gateway_image=verilio-gateway:v0.1.1-alpha.1"
load_line=$(grep -n '^load$' "$TEST_LOG" | cut -d: -f1)
backup_line=$(grep -n 'pg_dump ' "$TEST_LOG" | head -n 1 | cut -d: -f1)
stop_line=$(grep -n ' stop gateway api$' "$TEST_LOG" | cut -d: -f1)
(( load_line < backup_line && backup_line < stop_line )) || fail "deployment operations ran out of order"
pass "source-to-target update records accurate predeploy provenance"

# 8. Existing API and gateway versions must agree before image loading.
case_dir="$work_root/source-mismatch"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
export FAKE_SOURCE_API_IMAGE=verilio-api:v0.1.1-alpha.1
export FAKE_SOURCE_GATEWAY_IMAGE=verilio-gateway:v0.1.1-alpha.0
export FAKE_POSTGRES_RUNNING=true
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "Existing source deployment provenance mismatch"
assert_log_excludes_mutations "$TEST_LOG"
pass "inconsistent source API and gateway versions fail safely"

# 9. First deployment has no fake source version and takes no predeploy backup.
case_dir="$work_root/first-deploy"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh" >/dev/null
[[ -z "$(find "$case_dir/backups" -name manifest.txt -print -quit)" ]] || fail "first deployment created a predeploy backup"
grep --fixed-strings --quiet 'load' "$TEST_LOG" || fail "first deployment did not load images"
grep --fixed-strings --quiet ' up --detach --wait' "$TEST_LOG" || fail "first deployment did not start Compose"
pass "first deployment proceeds without invented source provenance"

# 10. Compatible rollback uses the same aligned provenance boundary.
case_dir="$work_root/rollback"
create_fixture "$case_dir" v0.1.1-alpha.1
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
export FAKE_SOURCE_API_IMAGE=verilio-api:v0.1.1-alpha.2
export FAKE_SOURCE_GATEWAY_IMAGE=verilio-gateway:v0.1.1-alpha.2
export FAKE_POSTGRES_RUNNING=true
VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh" >/dev/null
backup_manifest=$(find "$case_dir/backups" -name manifest.txt -print -quit)
assert_contains "$(cat "$backup_manifest")" "source_verilio_version=v0.1.1-alpha.2"
assert_contains "$(cat "$backup_manifest")" "target_verilio_version=v0.1.1-alpha.1"

case_dir="$work_root/rollback-mismatch"
create_fixture "$case_dir" v0.1.1-alpha.1 v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_log_excludes_mutations "$TEST_LOG"
pass "rollback succeeds only when selected release provenance aligns"

# 11. Loaded image IDs are checked before backup or maintenance.
case_dir="$work_root/image-id-mismatch"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
export FAKE_SOURCE_API_IMAGE=verilio-api:v0.1.1-alpha.1
export FAKE_SOURCE_GATEWAY_IMAGE=verilio-gateway:v0.1.1-alpha.1
export FAKE_POSTGRES_RUNNING=true
export FAKE_LOADED_API_ID=sha256:wrong-image
run_fails "$case_dir/output" env VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/server-deploy.sh"
assert_contains "$(cat "$case_dir/output")" "loaded image 'verilio-api:v0.1.1-alpha.2' has ID 'sha256:wrong-image'"
grep --fixed-strings --quiet 'load' "$TEST_LOG" || fail "post-load ID test never loaded the archive"
if grep -E --quiet 'pg_dump| stop gateway api$| up --detach --wait' "$TEST_LOG"; then
  fail "post-load image ID failure reached backup or maintenance"
fi
pass "loaded image ID mismatch stops before backup and maintenance"

# 12. Daily backup remains compatible and identifies the active source release.
case_dir="$work_root/daily-backup"
create_fixture "$case_dir" v0.1.1-alpha.2
release_dir=$FIXTURE_RELEASE_DIR
env_file=$FIXTURE_ENV_FILE
reset_fake_state "$case_dir/docker.log"
backup_dir=$(VERILIO_ENV_FILE="$env_file" "$release_dir/deploy/backup.sh")
assert_contains "$(cat "$backup_dir/manifest.txt")" "backup_kind=daily"
assert_contains "$(cat "$backup_dir/manifest.txt")" "verilio_version=v0.1.1-alpha.2"
assert_contains "$(cat "$backup_dir/manifest.txt")" "source_verilio_version=v0.1.1-alpha.2"
assert_contains "$(cat "$backup_dir/manifest.txt")" "target_verilio_version="
pass "daily backup remains compatible with explicit source provenance"

echo "$passed release provenance tests passed."

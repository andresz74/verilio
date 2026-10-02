#!/usr/bin/env bash
# Real temporary Git repositories, release export/provenance and server scripts;
# only host privileges/resources and Docker/HTTP are stubbed. Never contacts nc110.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work_root=$(mktemp -d "${TMPDIR:-/tmp}/verilio-snapshot-test.XXXXXX")
work_root=$(cd "$work_root" && pwd -P)
trap 'rm -rf "$work_root"' EXIT
real_git=$(command -v git)
real_uname=$(command -v uname)
export REAL_GIT=$real_git REAL_UNAME=$real_uname
mkdir "$work_root/bin"

cat >"$work_root/bin/git" <<'EOF'
#!/usr/bin/env bash
printf 'git %s\n' "$*" >>"$TEST_LOG"
if [[ "$*" == *'remote get-url origin' ]]; then
  echo "${FAKE_ORIGIN:-https://github.com/andresz74/verilio.git}"
  exit
fi
if [[ "$*" == *'fetch origin '* && "${FAIL_FETCH:-false}" == true ]]; then exit 41; fi
exec "$REAL_GIT" "$@"
EOF
cat >"$work_root/bin/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" != -v ]] || exit 0
printf 'sudo %s\n' "$*" >>"$TEST_LOG"
case "$1" in
  chown) exit 0 ;;
  mv)
    shift
    flag=$1; shift
    if [[ "$flag" == -nT ]]; then
      [[ ! -e "$2" && ! -L "$2" ]] || exit 0
      exec mv "$@"
    fi
    if [[ "$flag" == -fT && "$("$REAL_UNAME" -s)" == Darwin ]]; then exec mv -fh "$@"; fi
    exec mv "$flag" "$@" ;;
esac
exec env "$@"
EOF
cat >"$work_root/bin/free" <<'EOF'
#!/usr/bin/env bash
echo '              total used free shared cache available'
echo "Mem: 2000000 0 0 0 0 ${FAKE_MEMORY:-1500000}"
echo "Swap: 4000000 0 ${FAKE_SWAP:-4000000}"
EOF
cat >"$work_root/bin/df" <<'EOF'
#!/usr/bin/env bash
echo 'Filesystem 1024-blocks Used Available Capacity Mounted on'
echo "fixture 99999999 0 ${FAKE_DISK:-50000000} 0% /"
EOF
cat >"$work_root/bin/id" <<'EOF'
#!/usr/bin/env bash
echo 1000
EOF
cat >"$work_root/bin/uname" <<'EOF'
#!/usr/bin/env bash
echo Linux
EOF
cat >"$work_root/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
url=${*: -1}
echo "curl $url" >>"$TEST_LOG"
[[ "$url" == http://127.0.0.1:8187/* ]] || exit 1
case "$url" in
  */health/live) echo '{"status":"live"}' ;;
  */health/ready) echo '{"status":"ready","database":"connected"}' ;;
  *) echo '<div id="root"></div>' ;;
esac
EOF
cat >"$work_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "docker $*" >>"$TEST_LOG"
case "$1 ${2:-}" in
  'info --format') echo "$CASE_DIR/docker-root"; exit ;;
  'context inspect') echo unix:///var/run/docker.sock; exit ;;
  'buildx version'|'compose version') exit ;;
  'image inspect')
    image=${*: -1}
    file="$CASE_DIR/images/${image//:/_}"
    [[ -f "$file" ]] || exit 1
    if [[ "$*" == *org.opencontainers.image.version* ]]; then cat "$file"
    elif [[ "$*" == *'{{.Id}}'* ]]; then echo "sha256:${image//:/-}"
    fi
    exit ;;
  'buildx build')
    [[ "${FAIL_BUILD:-false}" != true ]] || exit 42
    image=; version=; revision=
    while (( $# )); do
      case "$1" in
        --tag) image=$2; shift ;;
        VERILIO_VERSION=*) version=${1#*=} ;;
        VCS_REF=*) revision=${1#*=} ;;
      esac
      shift
    done
    printf '%s %s linux/amd64\n' "$version" "$revision" >"$CASE_DIR/images/${image//:/_}"
    exit ;;
esac
case "$1" in
  info) exit ;;
  pull) touch "$CASE_DIR/images/postgres_17.9-alpine"; exit ;;
  save)
    shift
    mkdir -p "$CASE_DIR/archive"
    printf '[{"RepoTags":[' >"$CASE_DIR/archive/manifest.json"
    separator=
    for image in "$@"; do
      if [[ "${BAD_ARCHIVE:-false}" == true ]]; then image=wrong:version; fi
      printf '%s"%s"' "$separator" "$image" >>"$CASE_DIR/archive/manifest.json"
      separator=,
    done
    printf ']}]\n' >>"$CASE_DIR/archive/manifest.json"
    tar -cf - -C "$CASE_DIR/archive" manifest.json
    exit ;;
  load)
    cat >/dev/null
    manifest="$VERILIO_CURRENT_LINK/release-manifest.txt"
    version=$(sed -n 's/^verilio_version=//p' "$manifest")
    revision=$(sed -n 's/^source_commit=//p' "$manifest")
    for component in api gateway; do
      printf '%s %s linux/amd64\n' "$version" "$revision" >"$CASE_DIR/images/verilio-${component}_$version"
    done
    exit ;;
  inspect)
    case "${*: -1}" in
      api-container) echo "verilio-api:$SOURCE_VERSION" ;;
      gateway-container) echo "verilio-gateway:$SOURCE_VERSION" ;;
      *) exit 1 ;;
    esac
    exit ;;
  compose)
    case " $* " in
      *' ps --all --quiet api '*) echo api-container ;;
      *' ps --all --quiet gateway '*) echo gateway-container ;;
      *' ps --status running postgres '*) echo postgres ;;
      *' pg_dumpall '*) echo globals ;;
      *' pg_dump '*) echo custom-dump ;;
      *' show server_version '*) echo 17.9 ;;
      *' select count(*) from drizzle.__drizzle_migrations '*) echo 9 ;;
      *' up --detach --wait '*) [[ "${FAIL_DEPLOY:-false}" != true ]] || exit 43 ;;
    esac
    exit ;;
esac
echo "Unexpected Docker call: $*" >&2
exit 1
EOF
chmod +x "$work_root/bin/"*
export PATH="$work_root/bin:$PATH"
unset DOCKER_HOST
passed=0
fail() { echo "not ok - $*" >&2; exit 1; }
pass() { passed=$((passed+1)); echo "ok $passed - $*"; }
contains() { grep -Fq -- "$2" "$1" || fail "missing '$2' in $1"; }
fixture() {
  export CASE_DIR="$work_root/case-$passed"
  mkdir -p "$CASE_DIR/source/deploy" "$CASE_DIR/source/docs" "$CASE_DIR/source/packages/db/migrations" "$CASE_DIR/images" "$CASE_DIR/releases/verilio-v0.1.1-alpha.3" "$CASE_DIR/backups" "$CASE_DIR/docker-root"
  cp -R "$repo_root/deploy/". "$CASE_DIR/source/deploy/"
  cp "$repo_root/compose.prod.yml" "$CASE_DIR/source/"
  cp "$repo_root/docs/08-private_alpha_self_hosted_deployment.md" "$CASE_DIR/source/docs/"
  touch "$CASE_DIR/source/packages/db/migrations/0007_test.sql"
  "$real_git" -C "$CASE_DIR/source" init -q -b main
  "$real_git" -C "$CASE_DIR/source" add .
  "$real_git" -C "$CASE_DIR/source" -c user.name=Fixture -c user.email=fixture@example.test commit -qm fixture
  "$real_git" clone -q --bare "$CASE_DIR/source" "$CASE_DIR/origin.git"
  "$real_git" -C "$CASE_DIR/source" remote add origin "$CASE_DIR/origin.git"
  export TEST_LOG="$CASE_DIR/commands.log"
  : >"$TEST_LOG"
  export VERILIO_ENV_FILE="$CASE_DIR/verilio.env"
  export VERILIO_RELEASE_ROOT="$CASE_DIR/releases"
  export VERILIO_CURRENT_LINK="$CASE_DIR/current"
  export VERILIO_SNAPSHOT_WORK_ROOT="$CASE_DIR"
  export SOURCE_VERSION=v0.1.1-alpha.3
  cat >"$VERILIO_ENV_FILE" <<EOF
# preserve comments and every non-version byte
COMPOSE_PROJECT_NAME=verilio-snapshot-test
VERILIO_VERSION=$SOURCE_VERSION
VERILIO_GATEWAY_PORT=8187
LOCAL_USER_ID=00000000-0000-4000-8000-000000000001
LOG_LEVEL=info
VERILIO_PGDATA_VOLUME=keep-volume
VERILIO_DATABASE_URL_SECRET=/keep/secrets/database_url
VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET=/keep/secrets/admin
VERILIO_POSTGRES_APP_PASSWORD_SECRET=/keep/secrets/app
VERILIO_BACKUP_DIR=$CASE_DIR/backups
EOF
  chmod 640 "$VERILIO_ENV_FILE"
  cp -p "$VERILIO_ENV_FILE" "$CASE_DIR/before.env"
  echo "verilio_version=$SOURCE_VERSION" >"$VERILIO_RELEASE_ROOT/verilio-$SOURCE_VERSION/release-manifest.txt"
  ln -s "$VERILIO_RELEASE_ROOT/verilio-$SOURCE_VERSION" "$VERILIO_CURRENT_LINK"
  sha=$("$real_git" -C "$CASE_DIR/source" rev-parse HEAD)
  snapshot="main-${sha:0:12}"
  target="$VERILIO_RELEASE_ROOT/verilio-$snapshot"
  unset FAIL_BUILD BAD_ARCHIVE FAIL_DEPLOY FAKE_ORIGIN FAIL_FETCH FAKE_DISK FAKE_MEMORY FAKE_SWAP
}
run() { "$CASE_DIR/source/deploy/nc110-deploy-main.sh" >"$CASE_DIR/output" 2>&1; }
reject_unchanged() {
  if run; then fail 'unexpected success'; fi
  cmp "$CASE_DIR/before.env" "$VERILIO_ENV_FILE" || fail 'env changed before selection'
  [[ "$(readlink "$VERILIO_CURRENT_LINK")" == "$VERILIO_RELEASE_ROOT/verilio-$SOURCE_VERSION" ]] || fail 'current changed before selection'
  if grep -Eq 'docker load|docker compose .* (stop|up) |pg_dump' "$TEST_LOG"; then fail 'runtime mutation before validation'; fi
}

fixture
# Local branch need not be main: the fetched main commit, not local HEAD, is built.
"$real_git" -C "$CASE_DIR/source" checkout -qb local-work
echo local-only >"$CASE_DIR/source/local.txt"
"$real_git" -C "$CASE_DIR/source" add local.txt
"$real_git" -C "$CASE_DIR/source" -c user.name=Fixture -c user.email=fixture@example.test commit -qm local
local_head=$("$real_git" -C "$CASE_DIR/source" rev-parse HEAD)
run || { cat "$CASE_DIR/output"; fail 'happy path'; }
contains "$target/release-manifest.txt" "source_commit=$sha"
contains "$target/release-manifest.txt" "verilio_version=$snapshot"
[[ "$snapshot" =~ ^main-[0-9a-f]{12}$ ]] || fail 'snapshot identity'
[[ "$("$real_git" -C "$CASE_DIR/source" rev-parse HEAD)" == "$local_head" ]] || fail 'source branch changed'
[[ -z "$("$real_git" -C "$CASE_DIR/source" status --porcelain)" ]] || fail 'source dirtied'
[[ "$("$real_git" -C "$CASE_DIR/source" worktree list --porcelain | grep -c '^worktree ')" == 1 ]] || fail 'temporary worktree leaked'
diff <(grep -v '^VERILIO_VERSION=' "$CASE_DIR/before.env") <(grep -v '^VERILIO_VERSION=' "$VERILIO_ENV_FILE") || fail 'other config changed'
if [[ "$("$real_uname" -s)" == Darwin ]]; then mode=$(stat -f %Lp "$VERILIO_ENV_FILE"); else mode=$(stat -c %a "$VERILIO_ENV_FILE"); fi
[[ "$mode" == 640 ]] || fail 'env mode changed'
if [[ "$("$real_uname" -s)" == Darwin ]]; then
  init_mode=$(stat -f %Lp "$target/deploy/postgres/init-app-role.sh")
  env_owner=$(stat -f %u:%g "$VERILIO_ENV_FILE")
  original_owner=$(stat -f %u:%g "$CASE_DIR/before.env")
else
  init_mode=$(stat -c %a "$target/deploy/postgres/init-app-role.sh")
  env_owner=$(stat -c %u:%g "$VERILIO_ENV_FILE")
  original_owner=$(stat -c %u:%g "$CASE_DIR/before.env")
fi
[[ "$init_mode" == 755 ]] || fail 'exported PostgreSQL bind-mounted init script must remain container-readable/executable'
[[ "$env_owner" == "$original_owner" ]] || fail 'env ownership changed'
contains "$TEST_LOG" "sudo VERILIO_ENV_FILE=$VERILIO_ENV_FILE $VERILIO_CURRENT_LINK/deploy/server-deploy.sh"
contains "$CASE_DIR/output" "Rollback target: $VERILIO_RELEASE_ROOT/verilio-v0.1.1-alpha.3"
contains "$CASE_DIR/output" 'Live: passed'
contains "$CASE_DIR/output" 'Gateway port: 8187'
contains "$CASE_DIR/output" 'Predeploy backup:'
if grep -Eq 'latest|prune|reset --hard|clean -fd' "$TEST_LOG"; then fail 'unsafe command'; fi
pass 'exact fetched main, deterministic identity, config/mode preservation, server-deploy/backup/smoke and rollback output'

checksum_before=$(sha256sum "$target/checksums.txt")
build_count=$(grep -c 'docker buildx build' "$TEST_LOG")
export SOURCE_VERSION=$snapshot
# Accepted archives can restore missing local tags through the existing loader.
rm "$CASE_DIR/images/verilio-api_$snapshot" "$CASE_DIR/images/verilio-gateway_$snapshot"
run || { cat "$CASE_DIR/output"; fail 'same commit rerun'; }
[[ "$checksum_before" == "$(sha256sum "$target/checksums.txt")" ]] || fail 'accepted artifact overwritten'
[[ "$build_count" == "$(grep -c 'docker buildx build' "$TEST_LOG")" ]] || fail 'same commit rebuilt'
contains "$CASE_DIR/output" 'Reusing verified immutable snapshot'
pass 'same-commit accepted release is verified and reused without export/build/overwrite'

# Checksums, not just the full-commit check, protect an existing accepted release.
export SOURCE_VERSION=v0.1.1-alpha.3
cp -p "$CASE_DIR/before.env" "$VERILIO_ENV_FILE"
rm "$VERILIO_CURRENT_LINK"
ln -s "$VERILIO_RELEASE_ROOT/verilio-$SOURCE_VERSION" "$VERILIO_CURRENT_LINK"
echo '# corruption' >>"$target/compose.prod.yml"
: >"$TEST_LOG"
reject_unchanged
contains "$CASE_DIR/output" 'release checksums failed'
contains "$target/compose.prod.yml" '# corruption'
pass 'corrupt existing snapshot is neither deployed nor overwritten'

fixture
echo dirty >"$CASE_DIR/source/untracked"
reject_unchanged
contains "$CASE_DIR/output" 'source checkout is dirty'
! grep -q 'git .*fetch' "$TEST_LOG" || fail 'dirty checkout fetched'
pass 'dirty checkout rejected before fetch/build'

fixture
export FAKE_ORIGIN=https://github.com/unrelated/repository.git
reject_unchanged
contains "$CASE_DIR/output" 'origin must be'
pass 'unrelated repository rejected'

fixture
export FAIL_FETCH=true
reject_unchanged
! grep -q 'docker buildx build' "$TEST_LOG" || fail 'failed fetch built stale main'
pass 'missing/unfetchable main never falls back to stale/local HEAD'

fixture
export FAIL_BUILD=true
reject_unchanged
contains "$CASE_DIR/output" 'exit 42'
[[ ! -e "$target" ]] || fail 'failed build installed'
pass 'build failure leaves production selection unchanged'

fixture
export BAD_ARCHIVE=true
reject_unchanged
contains "$CASE_DIR/output" 'missing expected tag'
[[ ! -e "$target" ]] || fail 'bad provenance installed'
pass 'exported archive provenance failure leaves production unchanged'

fixture
mkdir "$target"
echo 'source_commit=wrong' >"$target/release-manifest.txt"
reject_unchanged
contains "$CASE_DIR/output" 'source_commit does not match'
contains "$target/release-manifest.txt" 'source_commit=wrong'
pass 'invalid pre-existing immutable snapshot is not overwritten'

fixture
for component in api gateway; do echo 'wrong wrong linux/amd64' >"$CASE_DIR/images/verilio-${component}_$snapshot"; done
reject_unchanged
contains "$CASE_DIR/output" 'refusing to retag'
! grep -q 'docker buildx build' "$TEST_LOG" || fail 'mismatched tag overwritten'
pass 'mismatched existing image provenance rejected without retagging'

fixture
for component in api gateway; do printf '%s %s linux/amd64\n' "$snapshot" "$sha" >"$CASE_DIR/images/verilio-${component}_$snapshot"; done
touch "$CASE_DIR/images/postgres_17.9-alpine"
run || { cat "$CASE_DIR/output"; fail 'image reuse'; }
! grep -q 'docker buildx build' "$TEST_LOG" || fail 'valid image pair rebuilt'
contains "$CASE_DIR/output" 'Reusing matching snapshot image pair'
pass 'complete matching pre-existing image pair reused and exported'

fixture
printf '%s %s linux/amd64\n' "$snapshot" "$sha" >"$CASE_DIR/images/verilio-api_$snapshot"
reject_unchanged
contains "$CASE_DIR/output" 'partial snapshot image pair'
pass 'partial failed-build images require operator inspection, not overwrite'

fixture
export FAKE_DISK=100
reject_unchanged
contains "$CASE_DIR/output" '12 GiB free'
pass 'insufficient disk fails without pruning'

fixture
export FAKE_MEMORY=100 FAKE_SWAP=0
reject_unchanged
contains "$CASE_DIR/output" '3 GiB combined'
pass 'insufficient memory/swap fails before build'

fixture
mkdir "$VERILIO_RELEASE_ROOT/.snapshot-deploy.lock"
reject_unchanged
[[ -d "$VERILIO_RELEASE_ROOT/.snapshot-deploy.lock" ]] || fail 'removed another invocation lock'
contains "$CASE_DIR/output" 'another snapshot deployment'
pass 'concurrent/stale operation lock is refused without removing it'

fixture
export FAIL_DEPLOY=true
if run; then fail 'deploy should fail'; fi
contains "$CASE_DIR/output" 'exit 43'
contains "$CASE_DIR/output" 'No automatic rollback was attempted'
contains "$CASE_DIR/output" "sudo ln -sfn $VERILIO_RELEASE_ROOT/verilio-v0.1.1-alpha.3"
contains "$CASE_DIR/output" 'schema-compatible rollback only'
contains "$VERILIO_ENV_FILE" "VERILIO_VERSION=$snapshot"
[[ -d "$target" && -d "$VERILIO_RELEASE_ROOT/verilio-v0.1.1-alpha.3" ]] || fail 'rollback assets lost'
pass 'post-switch failure reports phase/status and previous release recovery without automatic rollback'

fixture
if "$CASE_DIR/source/deploy/build-release.sh" v99-test >"$CASE_DIR/output" 2>&1; then fail 'untagged official build allowed'; fi
contains "$CASE_DIR/output" 'must be a Git tag'
echo dirty >"$CASE_DIR/source/dirty"
if "$CASE_DIR/source/deploy/build-release.sh" v99-test >"$CASE_DIR/output" 2>&1; then fail 'dirty official build allowed'; fi
contains "$CASE_DIR/output" 'clean working tree'
if "$CASE_DIR/source/deploy/build-release.sh" latest >"$CASE_DIR/output" 2>&1; then fail 'latest allowed'; fi
contains "$CASE_DIR/output" "'latest' is not allowed"
pass 'official release tag/clean-tree/latest guards remain intact'

echo "$passed snapshot deployment tests passed."

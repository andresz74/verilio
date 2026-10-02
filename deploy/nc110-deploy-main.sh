#!/usr/bin/env bash
# Private dogfooding only. Official tagged builds retain build-release.sh's guards.
set -Eeuo pipefail
umask 077

source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
release_root=${VERILIO_RELEASE_ROOT:-/opt/verilio/releases}
current=${VERILIO_CURRENT_LINK:-/opt/verilio/current}
env_file=${VERILIO_ENV_FILE:-/etc/verilio/verilio.env}
work_root=${VERILIO_SNAPSHOT_WORK_ROOT:-$(dirname "$source_dir")}
phase=preflight
selected=false
locked=false
scratch=
host_stage=
env_stage=
previous_path=
previous_version=
version=unresolved

fail() { echo "Snapshot deployment error ($phase): $*" >&2; exit 1; }
value() {
  # Configuration stays data here, not shell code. Require one plain assignment.
  if ! sudo awk -v key="$2" '
    index($0, key "=") == 1 { count++; value=substr($0,length(key)+2) }
    END { if (count != 1 || value == "") exit 1; print value }
  ' "$1"; then
    fail "expected exactly one non-empty plain '$2=' assignment in $1."
  fi
}
rollback_help() {
  printf 'Previous release: %s (%s)\nTarget release: %s\n' "$previous_path" "$previous_version" "$version" >&2
  echo 'No automatic rollback was attempted. Inspect Compose/logs before recovery.' >&2
  echo 'For a schema-compatible rollback only (otherwise follow the restore runbook):' >&2
  printf 'sudo ln -sfn %q %q\n' "$previous_path" "$current" >&2
  printf 'sudo sed -i %q %q\n' "s/^VERILIO_VERSION=.*/VERILIO_VERSION=$previous_version/" "$env_file" >&2
  printf 'sudo VERILIO_ENV_FILE=%q %q\n' "$env_file" "$previous_path/deploy/server-deploy.sh" >&2
}
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo "Snapshot deployment failed during: $phase (exit $status)." >&2
    if [[ "$selected" == true ]]; then rollback_help; else echo 'Production selection was not changed.' >&2; fi
  fi
  # Only invocation-owned temporary files/worktree are removed, never releases,
  # images or backups. A dirty worktree is retained rather than force-removed.
  if [[ -n "$scratch" ]]; then
    if [[ -d "$scratch/source" ]]; then
      git -C "$source_dir" worktree remove "$scratch/source" || true
    fi
    if [[ ! -d "$scratch/source" ]]; then rm -rf -- "$scratch"; fi
  fi
  if [[ -n "$env_stage" ]]; then sudo rm -f -- "$env_stage"; fi
  if [[ -n "$host_stage" ]]; then sudo rm -rf -- "$host_stage"; fi
  if [[ "$locked" == true ]]; then sudo rmdir "$release_root/.snapshot-deploy.lock"; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'echo "Failed at line $LINENO during $phase (exit $?)." >&2' ERR

for tool in git docker sudo awk sed sha256sum tar gzip free df; do
  command -v "$tool" >/dev/null || fail "required command is unavailable: $tool"
done
[[ "$(uname -s)" == Linux ]] || fail 'snapshot host builds require Linux (Ubuntu 24.04).'
[[ "$(id -u)" != 0 ]] || fail 'run as the deployment user, not sudo/root; privileged steps use sudo.'
[[ "$(git -C "$source_dir" rev-parse --show-toplevel)" == "$source_dir" ]] || fail 'script must be in the repository root deploy directory.'
case "$(git -C "$source_dir" remote get-url origin)" in
  https://github.com/andresz74/verilio|https://github.com/andresz74/verilio.git|git@github.com:andresz74/verilio.git|ssh://git@github.com/andresz74/verilio.git) ;;
  *) fail 'origin must be the trusted andresz74/verilio repository.' ;;
esac
[[ -z "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ]] || fail 'source checkout is dirty; commit/stash your work explicitly first.'
docker info >/dev/null
docker buildx version
docker compose version
[[ -z "${DOCKER_HOST:-}" ]] || fail 'DOCKER_HOST overrides are not supported; use the local Docker daemon.'
endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
[[ "$endpoint" == unix://* ]] || fail 'snapshot builds must use the local Docker daemon.'
sudo -v
sudo test -f "$env_file" || fail "missing production env: $env_file"
sudo test ! -L "$env_file" || fail 'production env must be a regular file, not a symlink.'
previous_version=$(value "$env_file" VERILIO_VERSION)
[[ "$previous_version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$previous_version" != latest ]] || fail 'invalid current VERILIO_VERSION.'
port=$(value "$env_file" VERILIO_GATEWAY_PORT)
[[ "$port" =~ ^[0-9]{1,5}$ ]] && (( 10#$port > 0 && 10#$port <= 65535 )) || fail 'VERILIO_GATEWAY_PORT must be a numeric TCP port.'
sudo test -L "$current" || fail 'an existing current release symlink is required; use the initial-install runbook first.'
previous_path=$(sudo readlink -f "$current")
[[ "${previous_path##*/}" == "verilio-$previous_version" ]] || fail 'current symlink and VERILIO_VERSION disagree.'
[[ "$(value "$previous_path/release-manifest.txt" verilio_version)" == "$previous_version" ]] || fail 'current manifest and env disagree.'
sudo mkdir -p "$release_root"
[[ "$(sudo readlink -f "$release_root")" == "$release_root" ]] || fail 'release root must be an absolute physical path.'
sudo mkdir "$release_root/.snapshot-deploy.lock" || fail 'another snapshot deployment (or stale lock) exists; inspect before retrying.'
locked=true

free -h
memory_kib=$(free -k | awk '/^Mem:/ { available=$7 } /^Swap:/ { print available+$4 }')
[[ "$memory_kib" =~ ^[0-9]+$ ]] && (( memory_kib >= 3*1024*1024 )) || fail 'need at least 3 GiB combined available RAM + free swap; inspect free -h.'
docker_root=$(docker info --format '{{.DockerRootDir}}')
for path in "$work_root" "$release_root" "$docker_root"; do
  available=$(sudo df -Pk "$path" | awk 'END {print $4}')
  [[ "$available" =~ ^[0-9]+$ ]] && (( available >= 12*1024*1024 )) || fail "need at least 12 GiB free on the filesystem containing $path; no automatic pruning is performed."
done

phase='fetch exact origin/main'
git -C "$source_dir" fetch origin refs/heads/main:refs/remotes/origin/main
commit=$(git -C "$source_dir" rev-parse --verify 'refs/remotes/origin/main^{commit}')
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || fail 'origin/main did not resolve to a full SHA-1 commit.'
version="main-${commit:0:12}"
target="$release_root/verilio-$version"
[[ -z "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ]] || fail 'source checkout changed during fetch.'
scratch=$(mktemp -d "$work_root/.verilio-snapshot.XXXXXX")
sudo cp -p "$env_file" "$scratch/original.env"
sudo sed "s/^VERILIO_VERSION=.*/VERILIO_VERSION=$version/" "$scratch/original.env" | sudo tee "$scratch/target.env" >/dev/null

verify_target() {
  local directory=$1
  [[ "$(value "$directory/release-manifest.txt" source_commit)" == "$commit" ]] || fail "existing snapshot source_commit does not match $commit."
  # Check files before executing even the target's verifier (which is itself
  # checksummed); a truncated verifier must not turn invalid reuse into success.
  sudo sh -c 'cd "$1" && sha256sum --check checksums.txt' sh "$directory" || fail "release checksums failed for $directory."
  sudo "$directory/deploy/verify-release-provenance.sh" "$scratch/target.env"
}
verify_image() {
  local image=$1
  local expected_id=${2:-}
  local metadata
  metadata=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}} {{.Os}}/{{.Architecture}}' "$image")
  [[ "$metadata" == "$version $commit linux/amd64" ]] || fail "image $image has unexpected version/revision/platform; refusing to retag."
  if [[ -n "$expected_id" ]]; then
    [[ "$(docker image inspect --format '{{.Id}}' "$image")" == "$expected_id" ]] || fail "image $image differs from accepted release manifest; refusing to replace its tag."
  fi
}

phase='snapshot build/export or immutable reuse'
if sudo test -e "$target" || sudo test -L "$target"; then
  sudo test ! -L "$target" || fail 'accepted release must be a physical directory, not a symlink.'
  verify_target "$target"
  for component in api gateway; do
    if docker image inspect "verilio-$component:$version" >/dev/null 2>&1; then
      verify_image "verilio-$component:$version" "$(value "$target/release-manifest.txt" "${component}_image_id")"
    fi
  done
  echo "Reusing verified immutable snapshot: $target"
else
  # Source/export are non-secret inside the mode-0700 scratch parent. Preserve
  # normal release permissions, especially PostgreSQL's bind-mounted init script.
  (umask 022; git -C "$source_dir" worktree add --detach "$scratch/source" "$commit")
  api_exists=false; gateway_exists=false
  if docker image inspect "verilio-api:$version" >/dev/null 2>&1; then api_exists=true; fi
  if docker image inspect "verilio-gateway:$version" >/dev/null 2>&1; then gateway_exists=true; fi
  [[ "$api_exists" == "$gateway_exists" ]] || fail 'partial snapshot image pair exists; inspect it manually, never overwrite automatically.'
  if [[ "$api_exists" == true ]]; then
    verify_image "verilio-api:$version"
    verify_image "verilio-gateway:$version"
    docker image inspect postgres:17.9-alpine >/dev/null
    echo 'Reusing matching snapshot image pair.'
  else
    VERILIO_ALLOW_UNRELEASED_BUILD=true VERILIO_PLATFORM=linux/amd64 \
      "$scratch/source/deploy/build-release.sh" "$version"
    verify_image "verilio-api:$version"
    verify_image "verilio-gateway:$version"
  fi
  (umask 022; "$scratch/source/deploy/export-release.sh" "$version" "$scratch/export")
  (cd "$scratch/export" && sha256sum --check "verilio-$version-release.tar.gz.sha256")
  verify_target "$scratch/export/verilio-$version"

  phase='install verified immutable snapshot'
  host_stage=$(sudo mktemp -d "$release_root/.snapshot-install.XXXXXX")
  sudo cp -a "$scratch/export/verilio-$version" "$host_stage/"
  sudo chown -R root:root "$host_stage/verilio-$version"
  verify_target "$host_stage/verilio-$version"
  # GNU no-clobber + -T must not silently nest/overwrite an accepted release.
  sudo mv -nT "$host_stage/verilio-$version" "$target"
  sudo test ! -e "$host_stage/verilio-$version" || fail "release appeared during install; retained $target unchanged."
fi

phase='pre-switch provenance and configuration check'
verify_target "$target"
sudo cmp -s "$scratch/original.env" "$env_file" || fail 'production env changed during build; retry after reviewing it.'
[[ "$(sudo readlink -f "$current")" == "$previous_path" ]] || fail 'current release changed during build.'
# Prepare both replacements on their destination filesystems; preserve env owner/mode.
env_stage=$(sudo mktemp "$(dirname "$env_file")/.verilio-env.XXXXXX")
sudo cp -p "$env_file" "$env_stage"
sudo cat "$scratch/target.env" | sudo tee "$env_stage" >/dev/null
if [[ -z "$host_stage" ]]; then host_stage=$(sudo mktemp -d "$release_root/.snapshot-install.XXXXXX"); fi
sudo ln -s "$target" "$host_stage/current"
phase='select snapshot'
selected=true
sudo mv -fT "$host_stage/current" "$current"
sudo mv -fT "$env_stage" "$env_file"
env_stage=
[[ "$(value "$env_file" VERILIO_VERSION)" == "$version" ]] || fail 'selected env version mismatch.'
[[ "$(value "$env_file" VERILIO_GATEWAY_PORT)" == "$port" ]] || fail 'gateway port changed unexpectedly.'

phase='server-deploy (backup, maintenance, migration, health and smoke)'
sudo VERILIO_ENV_FILE="$env_file" "$current/deploy/server-deploy.sh" | tee "$scratch/deploy.log"
backup=$(sed -n 's/^Predeploy backup: //p' "$scratch/deploy.log")
[[ -n "$backup" ]] || backup='none (no running PostgreSQL)'
printf '\nSource commit: %s\nSnapshot version: %s\nPrevious version: %s\nCurrent release: %s\n' "$commit" "$version" "$previous_version" "$target"
printf 'API image: verilio-api:%s\nGateway image: verilio-gateway:%s\nBackup: %s\nGateway port: %s\n' "$version" "$version" "$backup" "$port"
printf 'Live: passed\nReady: passed\nSmoke: passed\nRollback target: %s\n' "$previous_path"
echo "Verilio $version is deployed and healthy on $(hostname)."

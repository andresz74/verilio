#!/usr/bin/env bash
# Fresh private-main installation; not an updater or official release gate.
set -Eeuo pipefail
set +x
umask 077

source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
work_root=${VERILIO_SOURCE_INSTALL_WORK_ROOT:-/var/tmp}
release_root=/opt/verilio/releases
current=/opt/verilio/current
state_root=/etc/verilio
backup_root=/srv/verilio/backups
receipt=/opt/verilio/source-install.receipt
lock=/run/verilio-source-install.lock
phase=preflight
scratch=
locked=false
ref=
port=8080
resume=false
state_digest=unprepared
receipt_phase=state
fail() { echo "Source install error ($phase): $*" >&2; return 1; }
parse_args() {
  local port_seen=false
  while (( $# )); do
    case "$1" in
      --ref) [[ $# -ge 2 && -z "$ref" ]] || return 64; ref=$2; shift 2 ;;
      --gateway-port) [[ $# -ge 2 && "$port_seen" == false ]] || { fail 'Duplicate or missing Gateway port.'; return 64; }; port_seen=true; port=$2; shift 2 ;;
      --resume) [[ "$resume" == false ]] || return 64; resume=true; shift ;;
      *) fail 'Usage: ./deploy/install-from-source.sh --ref <origin/main|full-main-SHA> [--gateway-port 1-65535] [--resume]'; return 64 ;;
    esac
  done
  [[ "$ref" == origin/main || "$ref" =~ ^[0-9a-f]{40}$ ]] || { fail 'Only origin/main or a full main-line SHA is supported.'; return 64; }
  [[ "$port" =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$port <= 65535)) || { fail 'Invalid Gateway port.'; return 64; }
}
assert_installer_checkout() {
  local head status file
  [[ "$installer_commit" =~ ^[0-9a-f]{40}$ ]] || return 1
  head=$(git -C "$source_dir" rev-parse --verify 'HEAD^{commit}') || return 1
  [[ "$head" == "$installer_commit" ]] || { fail 'Installer checkout HEAD changed.'; return 1; }
  status=$(git -C "$source_dir" status --porcelain --untracked-files=all) || return 1
  [[ -z "$status" ]] || { fail 'Installer working tree changed (tracked/untracked files).'; return 1; }
  for file in deploy/install-from-source.sh deploy/bootstrap-source-state.sh; do
    git -C "$source_dir" cat-file -e "$installer_commit:$file" || { fail 'Installer commit must contain both installer and bootstrap helper.'; return 1; }
  done
}
resolve_source() {
  case "$(git -C "$source_dir" remote get-url origin)" in
    https://github.com/andresz74/verilio|https://github.com/andresz74/verilio.git|git@github.com:andresz74/verilio.git|ssh://git@github.com/andresz74/verilio.git) ;;
    *) fail 'Untrusted origin URL.'; return 1 ;;
  esac
  [[ "$(git -C "$source_dir" rev-parse --is-shallow-repository)" == false ]] || { fail 'Shallow clone refused; obtain full history.'; return 1; }
  [[ -z "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ]] || { fail 'Dirty tracked/untracked source refused.'; return 1; }
  installer_commit=$(git -C "$source_dir" rev-parse --verify 'HEAD^{commit}')
  assert_installer_checkout || return 1
  git -C "$source_dir" fetch origin refs/heads/main:refs/remotes/origin/main
  commit=$(git -C "$source_dir" rev-parse --verify 'refs/remotes/origin/main^{commit}')
  if [[ "$ref" != origin/main ]]; then
    git -C "$source_dir" cat-file -e "$ref^{commit}" && git -C "$source_dir" merge-base --is-ancestor "$ref" refs/remotes/origin/main || { fail 'SHA is not reachable from fetched trusted main.'; return 1; }
    commit=$ref
  fi
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || return 1
  assert_installer_checkout || return 1
  version="main-${commit:0:12}"
  target="$release_root/verilio-$version"
}
preflight_host() {
  [[ $(id -u) != 0 ]] || { fail 'Run as deployment user, not root.'; return 1; }
  local tool physical_root
  for tool in bash git docker sudo setsid openssl curl jq awk sed grep find sort xargs cmp stat install readlink tar gzip sha256sum free df mktemp ss uname id dirname mkdir mv cp chmod cat wc tr tee ln rmdir rm chown sh env; do
    command -v "$tool" >/dev/null || { fail "Missing prerequisite: $tool"; return 1; }
  done
  [[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { fail 'Linux amd64 required.'; return 1; }
  [[ "$work_root" == /* && -d "$work_root" && ! -L "$work_root" ]] || { fail 'Work root must be an existing absolute physical directory, not a symlink.'; return 1; }
  physical_root=$(cd "$work_root" && pwd -P)
  [[ ( "$work_root" == "$physical_root" || "$work_root" == "$physical_root/" ) && -w "$work_root" ]] || { fail 'Work root must be physical and writable by the deployment user.'; return 1; }
  [[ -z ${DOCKER_HOST:-} ]] || { fail 'DOCKER_HOST override refused.'; return 1; }
  [[ $(docker context inspect --format '{{.Endpoints.docker.Host}}') == unix://* ]] || { fail 'Local Unix Docker endpoint required.'; return 1; }
  [[ $(docker info --format '{{.OSType}}/{{.Architecture}}') =~ ^linux/(x86_64|amd64)$ ]] || return 1
  [[ $(docker info --format '{{json .SecurityOptions}}') != *rootless* ]] || { fail 'Rootful Docker required.'; return 1; }
  docker buildx version
  docker compose version
  sudo -v
  [[ $(sudo docker context inspect --format '{{.Endpoints.docker.Host}}') == "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" && $(sudo docker info --format '{{.ID}}') == "$(docker info --format '{{.ID}}')" ]] || { fail 'Deployment-user and sudo Docker daemon differ.'; return 1; }
  local memory available docker_root path parent
  local paths=()
  memory=$(free -k | awk '/^Mem:/ {available=$7} /^Swap:/ {print available+$4}')
  [[ "$memory" =~ ^[0-9]+$ ]] && ((memory >= 3*1024*1024)) || { fail 'Need 3 GiB available RAM + free swap.'; return 1; }
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  paths=("$source_dir" "$work_root" "$docker_root")
  for path in "$release_root" "$state_root" "$backup_root"; do
    parent=$path
    while ! sudo test -e "$parent"; do
      [[ "$parent" != / ]] || { fail 'Cannot inspect host filesystem.'; return 1; }
      parent=$(dirname "$parent")
    done
    paths+=("$parent")
  done
  for path in "${paths[@]}"; do
    available=$(sudo df -Pk "$path" | awk 'END {print $4}')
    [[ "$available" =~ ^[0-9]+$ ]] && ((available >= 12*1024*1024)) || { fail "Need 12 GiB free on $path; no pruning."; return 1; }
  done
}
receipt_body() {
  local status=$1
  cat <<RECEIPT
format=2
status=$status
phase=$receipt_phase
installer_commit=$installer_commit
source_commit=$commit
version=$version
port=$port
release=$target
config=$state_root/verilio.env
project=verilio
volume=verilio_pgdata
backups=$backup_root
state_sha256=$state_digest
RECEIPT
}
validate_receipt() {
  local status
  sudo test -f "$receipt" && sudo test ! -L "$receipt" || return 1
  [[ $(sudo stat -c '%u:%a' "$receipt") == 0:600 ]] || return 1
  status=$(sudo sed -n 's/^status=//p' "$receipt")
  [[ "$status" == pending || "$status" == complete ]] || return 1
  [[ "$status" != complete ]] || { fail 'Completed installation: use existing private-main updater, not fresh install.'; return 1; }
  receipt_phase=$(sudo sed -n 's/^phase=//p' "$receipt")
  case "$receipt_phase" in state|installed|selected|runtime) ;; *) fail 'Unknown receipt phase.'; return 1 ;; esac
  state_digest=$(sudo sha256sum "$state_root/verilio.env" "$state_root/secrets/database_url" "$state_root/secrets/postgres_admin_password" "$state_root/secrets/postgres_app_password" | sha256sum | awk '{print $1}')
  receipt_body "$status" | sudo cmp -s - "$receipt" || { fail 'Receipt/installer/source/port/path mismatch.'; return 1; }
}
write_receipt() {
  local status=$1 stage
  stage=$(sudo mktemp /opt/verilio/.source-receipt.XXXXXX)
  receipt_body "$status" | sudo tee "$stage" >/dev/null
  sudo chmod 0600 "$stage"
  sudo mv -fT "$stage" "$receipt"
}
assert_no_runtime_state() {
  ! docker volume inspect verilio_pgdata >/dev/null 2>&1 || { fail 'Unexpected volume before runtime ownership.'; return 1; }
  [[ -z $(docker ps -aq --filter label=com.docker.compose.project=verilio) ]] || { fail 'Unexpected Compose project before runtime ownership.'; return 1; }
}
check_existing() {
  local path
  for path in /opt/verilio "$release_root" /srv/verilio; do
    if sudo test -e "$path" || sudo test -L "$path"; then
      sudo test -d "$path" && sudo test ! -L "$path" && [[ $(sudo stat -c '%u:%a' "$path") == 0:755 ]] || { fail 'Unsafe host parent path.'; return 1; }
    fi
  done
  if sudo test -d /opt/verilio; then
    local entry
    while IFS= read -r entry; do
      case "$entry" in releases|current|source-install.receipt) ;;
        *) fail 'Unknown protected installation entry.'; return 1 ;;
      esac
    done < <(sudo find /opt/verilio -mindepth 1 -maxdepth 1 -printf '%f\n')
  fi
  if sudo test -e "$receipt" || sudo test -L "$receipt"; then
    validate_receipt
    [[ "$resume" == true ]] || { fail 'Existing receipt: only a reviewed failed-attempt --resume is allowed.'; return 1; }
    sudo "$source_dir/deploy/bootstrap-source-state.sh" validate "$version" "$port"
    if sudo test -d "$release_root"; then
      local entries
      entries=$(sudo find "$release_root" -mindepth 1 -maxdepth 1 -print)
      [[ -z "$entries" || "$entries" == "$target" ]] || { fail 'Foreign release entry during resume.'; return 1; }
    fi
    if sudo test -e "$target" || sudo test -L "$target"; then
      verify_release "$target" "$state_root/verilio.env" || return 1
    elif [[ "$receipt_phase" != state ]]; then
      fail 'Recorded installed release is missing.'; return 1
    fi
    if sudo test -e "$current" || sudo test -L "$current"; then
      [[ "$receipt_phase" == selected || "$receipt_phase" == runtime ]] || { fail 'Unexpected current before selection.'; return 1; }
      sudo test -L "$current" && [[ $(sudo readlink -f "$current") == "$target" ]] || { fail 'Foreign current selection.'; return 1; }
    elif [[ "$receipt_phase" == runtime ]]; then
      fail 'Runtime receipt requires the expected current selection.'; return 1
    fi
    if [[ "$receipt_phase" != runtime ]]; then
      assert_no_runtime_state || return 1
    fi
  else
    [[ "$resume" == false ]] || { fail 'No installer-owned attempt to resume.'; return 1; }
    for path in "$state_root" "$backup_root" "$current" "$target"; do
      ! sudo test -e "$path" && ! sudo test -L "$path" || { fail "Unknown existing state: $path"; return 1; }
    done
    ! docker volume inspect verilio_pgdata >/dev/null 2>&1 || { fail 'Unfamiliar verilio_pgdata volume.'; return 1; }
    [[ -z $(docker ps -aq --filter label=com.docker.compose.project=verilio) ]] || { fail 'Foreign Verilio containers.'; return 1; }
    if sudo test -d "$release_root"; then
      [[ -z $(sudo find "$release_root" -mindepth 1 -maxdepth 1 -print -quit) ]] || { fail 'Foreign installed releases.'; return 1; }
    fi
  fi
  # Resumed selected deployments legitimately occupy the port; inspect them below.
  if [[ "$resume" == false || "$receipt_phase" != runtime ]]; then
    [[ -z $(ss -H -ltn "sport = :$port") ]] || { fail 'Gateway port occupied.'; return 1; }
  fi
}
manifest_value() {
  sudo awk -v key="$2" 'index($0,key "=")==1 {n++; v=substr($0,length(key)+2)} END {if(n!=1 || v=="")exit 1; print v}' "$1/release-manifest.txt"
}
verify_images() {
  [[ $(docker image inspect --format '{{.Os}}/{{.Architecture}}' postgres:17.9-alpine) == linux/amd64 ]] || { fail 'PostgreSQL image platform mismatch.'; return 1; }
  local directory=${1:-} component image metadata expected
  for component in api gateway; do
    image="verilio-$component:$version"
    metadata=$(docker image inspect --format '{{.Os}}/{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.source"}} {{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    [[ "$metadata" == "linux/amd64 https://github.com/andresz74/verilio $version $commit" ]] || { fail 'Image provenance mismatch; never overwrite.'; return 1; }
    if [[ -n "$directory" ]]; then
      expected=$(manifest_value "$directory" "${component}_image_id")
      [[ $(docker image inspect --format '{{.Id}}' "$image") == "$expected" ]] || return 1
    fi
  done
}
build_images() {
  local api=false gateway=false
  docker image inspect "verilio-api:$version" >/dev/null 2>&1 && api=true
  docker image inspect "verilio-gateway:$version" >/dev/null 2>&1 && gateway=true
  [[ "$api" == "$gateway" ]] || { fail 'Partial image pair; inspect without overwriting.'; return 1; }
  if [[ "$api" == true ]]; then verify_images; else
    VERILIO_ALLOW_UNRELEASED_BUILD=true VERILIO_PLATFORM=linux/amd64 "$scratch/source/deploy/build-release.sh" "$version"
    verify_images
  fi
}
verify_release() {
  local directory=$1 env_file=$2
  [[ $(manifest_value "$directory" source_commit) == "$commit" && $(manifest_value "$directory" platform) == linux/amd64 ]] || return 1
  sudo test -d "$directory" && sudo test ! -L "$directory" || return 1
  sudo sh -c 'cd "$1" && sha256sum --check checksums.txt' sh "$directory" || return 1
  # Compare executable runtime helpers with the exact trusted worktree before use.
  local file
  for file in compose.prod.yml deploy/verify-release-provenance.sh deploy/server-deploy.sh deploy/backup.sh deploy/smoke-test.sh deploy/restore-drill.sh deploy/verify-data.sh deploy/verilio.env.example deploy/postgres/init-app-role.sh; do
    if [[ -n "$scratch" && -f "$scratch/source/$file" ]]; then
      sudo cmp -s "$scratch/source/$file" "$directory/$file" || return 1
    else
      git -C "$source_dir" show "$commit:$file" | sudo cmp -s - "$directory/$file" || { fail 'Installed canonical helper/runtime differs from selected source.'; return 1; }
    fi
  done
  sudo "$directory/deploy/verify-release-provenance.sh" --loaded-images "$env_file" || return 1
  verify_images "$directory"
}
check_config() {
  local directory=$1 env_file=$2 config
  config=$(sudo docker compose --env-file "$env_file" -f "$directory/compose.prod.yml" config --format json)
  jq -e --arg version "$version" --arg port "$port" '
    .name == "verilio" and
    .services.api.image == ("verilio-api:"+$version) and
    .services.migrate.image == ("verilio-api:"+$version) and
    .services.gateway.image == ("verilio-gateway:"+$version) and
    .services.postgres.image == "postgres:17.9-alpine" and
    ([.services[] | has("build")] | any | not) and
    ((.services.api.ports // []) | length == 0) and
    ((.services.postgres.ports // []) | length == 0) and
    (.services.gateway.ports | length == 1) and
    .services.gateway.ports[0].host_ip == "127.0.0.1" and
    (.services.gateway.ports[0].published|tostring) == $port and
    .services.gateway.ports[0].target == 8080 and
    .volumes.verilio_pgdata.name == "verilio_pgdata"
  ' <<< "$config" >/dev/null || { fail 'Resolved runtime violates source/private contract.'; return 1; }
}
verify_runtime() {
  local service container expected inspection owner
  local dc=(sudo docker compose --env-file "$state_root/verilio.env" -f "$target/compose.prod.yml")
  owner=$(sudo sed -n 's/^LOCAL_USER_ID=//p' "$state_root/verilio.env")
  for service in postgres migrate api gateway; do
    container=$("${dc[@]}" ps --all --quiet "$service")
    [[ -n "$container" && "$container" != *$'\n'* ]] || return 1
    inspection=$(docker inspect "$container")
    if [[ "$service" == migrate ]]; then
      jq -e '.[0].State.Status == "exited" and .[0].State.ExitCode == 0' <<< "$inspection" >/dev/null || return 1
    else
      jq -e '.[0].State.Status == "running" and .[0].State.Health.Status == "healthy"' <<< "$inspection" >/dev/null || return 1
    fi
    case "$service" in
      api|migrate) expected="verilio-api:$version" ;;
      gateway) expected="verilio-gateway:$version" ;;
      postgres) expected=postgres:17.9-alpine ;;
    esac
    jq -e --arg ref "$expected" --arg image "$(docker image inspect --format '{{.Id}}' "$expected")" '.[0].Config.Image == $ref and .[0].Image == $image' <<< "$inspection" >/dev/null || return 1
    if [[ "$service" == gateway ]]; then
      jq -e --arg port "$port" '.[0].HostConfig.PortBindings == {"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":$port}]}' <<< "$inspection" >/dev/null || return 1
    else
      jq -e '(.[0].HostConfig.PortBindings // {}) == {}' <<< "$inspection" >/dev/null || return 1
    fi
    case "$service" in
      api|migrate) jq -e --arg owner "LOCAL_USER_ID=$owner" '.[0].Config.Env | index($owner) != null' <<< "$inspection" >/dev/null || return 1 ;;
      postgres) jq -e '.[0].Mounts | any(.Name == "verilio_pgdata" and .Destination == "/var/lib/postgresql/data")' <<< "$inspection" >/dev/null || return 1 ;;
    esac
    local secrets
    case "$service" in
      api|migrate) secrets='["database_url"]' ;;
      postgres) secrets='["postgres_admin_password","postgres_app_password"]' ;;
      gateway) secrets='[]' ;;
    esac
    jq -e --arg root "$state_root/secrets/" --argjson expected "$secrets" '
      (.[0].Mounts | [.[] | select(.Destination | startswith("/run/secrets/"))]) as $mounts |
      ($mounts|length) == ($expected|length) and
      all($expected[]; . as $name | any($mounts[]; .Destination == ("/run/secrets/"+$name) and .Source == ($root+$name) and .RW == false))
    ' <<< "$inspection" >/dev/null || return 1
    if [[ "$service" == postgres ]]; then
      jq -e --arg support "$target/deploy/postgres/init-app-role.sh" '.[0].Mounts | any(.Source == $support and .Destination == "/docker-entrypoint-initdb.d/10-verilio-app-role.sh" and .RW == false)' <<< "$inspection" >/dev/null || return 1
    fi
    printf '%s: verified\n' "$service"
  done
  local endpoint
  for endpoint in live ready; do
    [[ $(curl --fail --silent --show-error --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/health/$endpoint") == 200 ]] || return 1
  done
  "$target/deploy/smoke-test.sh" "http://127.0.0.1:$port"
}
cleanup() {
  local status=$?
  trap - EXIT
  if ((status)); then
    echo "Installation failed during $phase (exit $status). State, volume, images and releases were preserved. No automatic rollback. Inspect before --resume." >&2
  fi
  if [[ -n "$scratch" && -d "$scratch/source" ]]; then git -C "$source_dir" worktree remove "$scratch/source" || true; fi
  if [[ -n "$scratch" && ! -d "$scratch/source" ]]; then rm -rf -- "$scratch"; fi
  if [[ "$locked" == true ]]; then sudo rmdir "$lock" || true; fi
  exit "$status"
}
print_plan() {
  printf 'Requested ref: %s\nInstaller commit: %s\nSource commit: %s\nVersion: %s\nPlatform: linux/amd64\nRelease: %s\nConfig: %s/verilio.env\nGateway: 127.0.0.1:%s\n' "$ref" "$installer_commit" "$commit" "$version" "$target" "$state_root" "$port"
}
print_handoff() {
  printf 'Next private-main updates (handoff VM validation pending):\ncd %q\n./deploy/nc110-deploy-main.sh\n' "$source_dir"
}
print_success() {
  printf 'Source installation complete: %s\nInstaller commit: %s\nSource commit: %s\nOwner: %s\nVolume: verilio_pgdata\nBaseline backup: %s\n' "$version" "$installer_commit" "$commit" "$(sudo sed -n 's/^LOCAL_USER_ID=//p' "$state_root/verilio.env")" "$1"
  print_handoff
}
# Detach from sudo's controlling PTY, but wait in the foreground for completion.
complete_install() {
  phase=baseline-backup
  local backup_path_file="$scratch/baseline-backup.path"
  local backup_stderr_file status
  local backup= line name count=0
  # Outside scratch so EXIT cleanup cannot erase failure diagnostics; umask is 077.
  backup_stderr_file=$(mktemp "$work_root/verilio-source-install-backup-stderr.XXXXXX") || return "$?"
  sudo -n setsid --wait env VERILIO_ENV_FILE="$state_root/verilio.env" VERILIO_COMPOSE_FILE="$target/compose.prod.yml" "$target/deploy/backup.sh" "$version" predeploy </dev/null >"$backup_path_file" 2>"$backup_stderr_file" || {
    status=$?
    fail "Detached baseline backup exited $status; stderr retained at $backup_stderr_file (contents not printed)." || return "$status"
  }
  [[ ! -s "$backup_stderr_file" ]] || { fail "Baseline backup reported stderr; diagnostics retained at $backup_stderr_file (contents not printed)."; return 1; }
  # Consume stdout only after the privileged command has exited successfully.
  while IFS= read -r line || [[ -n "$line" ]]; do
    count=$((count + 1))
    backup=$line
  done < "$backup_path_file"
  [[ "$count" == 1 && -n "$backup" ]] || { fail 'Baseline backup must report exactly one non-empty path line.'; return 1; }
  name=${backup#"$backup_root/"}
  # backup.sh creates one direct child; disallow traversal/nested/symlink paths.
  [[ "$backup" == /* && "$backup" == "$backup_root/"* && "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { fail 'Baseline backup path is outside the expected backup root.'; return 1; }
  sudo test -d "$backup" && sudo test ! -L "$backup" || { fail 'Baseline backup directory is missing or a symlink.'; return 1; }
  sudo sh -c 'cd "$1" && sha256sum --check checksums.txt' sh "$backup" || return "$?"
  rm -- "$backup_stderr_file" || return "$?"
  write_receipt complete || return "$?"
  print_success "$backup"
}
installer_main() {
  parse_args "$@"
  preflight_host
  [[ $(git -C "$source_dir" rev-parse --show-toplevel) == "$source_dir" ]] || return 1
  resolve_source
  check_existing
  print_plan
  # Caller overrides must not leak into helpers that source the generated env.
  unset COMPOSE_PROJECT_NAME VERILIO_VERSION VERILIO_API_IMAGE VERILIO_GATEWAY_IMAGE LOCAL_USER_ID LOG_LEVEL VERILIO_GATEWAY_PORT VERILIO_PGDATA_VOLUME VERILIO_DATABASE_URL_SECRET VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET VERILIO_POSTGRES_APP_PASSWORD_SECRET VERILIO_BACKUP_DIR VERILIO_BACKUP_RETENTION_DAYS
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  phase=lock
  sudo test -d /run && sudo test ! -L /run || { fail 'A real /run directory is required for the ephemeral lock.'; return 1; }
  sudo mkdir -m 0700 "$lock" || { fail 'Install lock exists; inspect, never steal it.'; return 1; }
  locked=true
  check_existing
  scratch=$(mktemp -d "$work_root/verilio-source-install.XXXXXX")
  (umask 022; git -C "$source_dir" worktree add --detach "$scratch/source" "$commit")
  phase=build-export
  local staged
  build_images
  (umask 022; "$scratch/source/deploy/export-release.sh" "$version" "$scratch/export")
  staged="$scratch/export/verilio-$version"
  # Temporary non-secret env suffices to verify the archive before state exists.
  cat > "$scratch/verify.env" <<ENV
VERILIO_VERSION=$version
ENV
  verify_release "$staged" "$scratch/verify.env"
  phase=state
  # Recheck caller code after the long build, before even bootstrap validation.
  assert_installer_checkout
  check_existing
  sudo install -d -m 0755 /opt/verilio "$release_root" /srv/verilio
  if [[ "$resume" == false ]]; then
    write_receipt pending
    sudo "$source_dir/deploy/bootstrap-source-state.sh" create "$version" "$port"
    state_digest=$(sudo sha256sum "$state_root/verilio.env" "$state_root/secrets/database_url" "$state_root/secrets/postgres_admin_password" "$state_root/secrets/postgres_app_password" | sha256sum | awk '{print $1}')
    write_receipt pending
  else
    validate_receipt
    sudo "$source_dir/deploy/bootstrap-source-state.sh" validate "$version" "$port"
  fi
  phase=config
  check_config "$staged" "$state_root/verilio.env"
  phase=install
  if sudo test -e "$target" || sudo test -L "$target"; then
    [[ "$resume" == true ]] || { fail 'Immutable release already exists.'; return 1; }
    verify_release "$target" "$state_root/verilio.env"
  else
    local host_stage
    host_stage=$(sudo mktemp -d "$release_root/.source-install.XXXXXX")
    sudo cp -a "$staged" "$host_stage/"
    sudo chown -R root:root "$host_stage/verilio-$version"
    verify_release "$host_stage/verilio-$version" "$state_root/verilio.env"
    sudo mv -nT "$host_stage/verilio-$version" "$target"
    ! sudo test -e "$host_stage/verilio-$version" || { fail 'Immutable release collision.'; return 1; }
    sudo rmdir "$host_stage"
  fi
  case "$receipt_phase" in state) receipt_phase=installed; write_receipt pending ;; esac
  phase=select
  case "$receipt_phase" in installed) receipt_phase=selected; write_receipt pending ;; esac
  if sudo test -e "$current" || sudo test -L "$current"; then
    [[ "$resume" == true ]] && sudo test -L "$current" && [[ $(sudo readlink -f "$current") == "$target" ]] || { fail 'Current selection changed; refusing replacement.'; return 1; }
  else
    local selection_stage
    selection_stage=$(sudo mktemp -d /opt/verilio/.source-select.XXXXXX)
    sudo ln -s "$target" "$selection_stage/current"
    sudo mv -nT "$selection_stage/current" "$current"
    ! sudo test -L "$selection_stage/current" || { fail 'Selection appeared concurrently; preserved.'; return 1; }
    sudo rmdir "$selection_stage"
  fi
  if [[ "$receipt_phase" != runtime ]]; then
    assert_no_runtime_state
    [[ -z $(ss -H -ltn "sport = :$port") ]] || { fail 'Gateway port occupied before runtime ownership.'; return 1; }
  fi
  receipt_phase=runtime
  write_receipt pending
  phase=server-deploy
  sudo env VERILIO_ENV_FILE="$state_root/verilio.env" "$target/deploy/server-deploy.sh"
  phase=health-security
  check_config "$target" "$state_root/verilio.env"
  verify_runtime
  complete_install
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then installer_main "$@"; fi

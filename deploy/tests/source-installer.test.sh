#!/usr/bin/env bash
# Offline only: fake host/Docker/sudo operations; real Git works exclusively locally.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
work=$(mktemp -d)
work=$(cd "$work" && pwd -P)
trap 'rm -rf "$work"' EXIT
passed=0
pass() { passed=$((passed+1)); echo "ok $passed - $*"; }
fail() { echo "not ok - $*" >&2; exit 1; }
check() { local name=$1; shift; "$@" || fail "$name"; pass "$name"; }
reject() { local name=$1; shift; if "$@" > "$work/rejected" 2>&1; then fail "$name"; fi; pass "$name"; }
check 'installer Bash syntax' bash -n "$repo_root/deploy/install-from-source.sh"
check 'bootstrap Bash syntax' bash -n "$repo_root/deploy/bootstrap-source-state.sh"
check 'test Bash syntax' bash -n "${BASH_SOURCE[0]}"
# Source functions only: importing never invokes privileged main operations.
source "$repo_root/deploy/install-from-source.sh"
source "$repo_root/deploy/bootstrap-source-state.sh"
check 'default source workspace is /var/tmp' env -u VERILIO_SOURCE_INSTALL_WORK_ROOT bash -c 'source "$1"; [[ "$work_root" == /var/tmp ]]' sh "$repo_root/deploy/install-from-source.sh"
mkdir "$work/workspace" "$work/docker-root"
check 'custom source workspace honored' env VERILIO_SOURCE_INSTALL_WORK_ROOT="$work/workspace" bash -c 'source "$1"; [[ "$work_root" == "$2" ]]' sh "$repo_root/deploy/install-from-source.sh" "$work/workspace"
work_root="$work/workspace"
parse_case() { ref=; port=8080; resume=false; parse_args "$@"; }
check 'origin/main CLI accepted' parse_case --ref origin/main
check 'default port is 8080' test "$port" = 8080
check 'full SHA CLI accepted' parse_case --ref aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
check 'explicit port/resume accepted' parse_case --ref origin/main --gateway-port 65535 --resume
reject 'missing ref refused' parse_case
reject 'abbreviated SHA refused' parse_case --ref abc123
reject 'tag mode refused' parse_case --ref refs/tags/v1.0.0
reject 'arbitrary branch refused' parse_case --ref local-branch
reject 'latest refused' parse_case --ref latest
for bad in 0 65536 -1 nope 08080 '8080;echo unsafe'; do reject "invalid port $bad refused" parse_case --ref origin/main --gateway-port "$bad"; done
reject 'unknown option refused' parse_case --ref origin/main --unsafe
reject 'duplicate Gateway port refused' parse_case --ref origin/main --gateway-port 8080 --gateway-port 8081
reject 'duplicate ref refused' parse_case --ref origin/main --ref origin/main

# Build a real disposable repository and local bare origin; trusted URL is only
# intercepted for get-url. Fetch still goes to the local path, never GitHub.
command git init -q --bare "$work/origin"
command git init -q "$work/source"
command git -C "$work/source" config user.email test@example.invalid
command git -C "$work/source" config user.name Test
printf 'first\n' > "$work/source/file"
mkdir "$work/source/deploy"
printf 'fixture installer\n' > "$work/source/deploy/install-from-source.sh"
printf 'fixture bootstrap\n' > "$work/source/deploy/bootstrap-source-state.sh"
mkdir -p "$work/source/deploy/postgres" "$work/source/docs"
for helper in build-release export-release verify-release-provenance server-deploy backup smoke-test restore-drill verify-data; do cp "$repo_root/deploy/$helper.sh" "$work/source/deploy/"; done
cp "$repo_root/deploy/verilio.env.example" "$work/source/deploy/"
cp "$repo_root/deploy/postgres/init-app-role.sh" "$work/source/deploy/postgres/"
cp "$repo_root/compose.prod.yml" "$work/source/"
command git -C "$work/source" add .
command git -C "$work/source" commit -qm first
first=$(command git -C "$work/source" rev-parse HEAD)
command git -C "$work/source" branch -M main
command git -C "$work/source" remote add origin "$work/origin"
command git -C "$work/source" push -q origin main
command git -C "$work/source" checkout -q -b foreign
printf 'foreign\n' >> "$work/source/file"
command git -C "$work/source" commit -qam foreign
foreign=$(command git -C "$work/source" rev-parse HEAD)
command git -C "$work/source" checkout -q main
source_dir="$work/source"
release_root="$work/releases"
trusted=true; shallow=false
git() {
  case "$*" in
    *'remote get-url origin') if [[ "$trusted" == true ]]; then echo https://github.com/andresz74/verilio.git; else echo https://example.invalid/foreign; fi ;;
    *'rev-parse --is-shallow-repository') echo "$shallow" ;;
    *) command git "$@" ;;
  esac
}
ref=origin/main
check 'trusted origin/main resolves via local fetch' resolve_source
check 'version uses exact main-sha12' test "$version" = "main-${first:0:12}"
check 'full source SHA retained' test "$commit" = "$first"
check 'installer commit resolved from clean caller HEAD' test "$installer_commit" = "$first"
command git -C "$source_dir" checkout -q foreign
check 'different clean installer checkout can select trusted main application source' resolve_source
check 'installer and source commits remain distinct' test "$installer_commit:$commit" = "$foreign:$first"
command git -C "$source_dir" checkout -q main
check 'clean caller identity restored' resolve_source
ref=$first
check 'reachable full SHA accepted' resolve_source
ref=$foreign
reject 'foreign full commit refused by real ancestry check' resolve_source
ref=origin/main; trusted=false
reject 'untrusted origin refused' resolve_source
trusted=true; shallow=true
reject 'shallow checkout refused' resolve_source
shallow=false
printf 'dirty\n' >> "$source_dir/file"
reject 'dirty tracked checkout refused' resolve_source
command git -C "$source_dir" restore file
printf 'untracked\n' > "$source_dir/untracked"
reject 'untracked checkout refused' resolve_source
rm "$source_dir/untracked"
command git -C "$source_dir" checkout -q --detach "$first"
check 'clean detached caller supported' resolve_source
check 'unchanged installer checkout invariant passes' assert_installer_checkout
command git -C "$source_dir" checkout -q foreign
reject 'installer invariant refuses changed HEAD' assert_installer_checkout
command git -C "$source_dir" checkout -q --detach "$first"
printf 'modified bootstrap\n' >> "$source_dir/deploy/bootstrap-source-state.sh"
reject 'installer invariant refuses tracked bootstrap changes' assert_installer_checkout
command git -C "$source_dir" restore deploy/bootstrap-source-state.sh
printf 'untracked\n' > "$source_dir/new-untracked"
reject 'installer invariant refuses new untracked file' assert_installer_checkout
rm "$source_dir/new-untracked"
saved_source_dir=$source_dir; saved_installer_commit=$installer_commit
command git init -q "$work/no-bootstrap"
command git -C "$work/no-bootstrap" config user.email test@example.invalid
command git -C "$work/no-bootstrap" config user.name Test
mkdir "$work/no-bootstrap/deploy"
printf 'installer only\n' > "$work/no-bootstrap/deploy/install-from-source.sh"
command git -C "$work/no-bootstrap" add .
command git -C "$work/no-bootstrap" commit -qm fixture
source_dir="$work/no-bootstrap"; installer_commit=$(command git -C "$source_dir" rev-parse HEAD)
reject 'installer invariant refuses commit without bootstrap helper' assert_installer_checkout
source_dir=$saved_source_dir; installer_commit=$saved_installer_commit

# Execute the real orchestration function in a child shell. Only host/build
# boundaries are mocked; Git identity/cleanliness and the post-build gate are real.
cat > "$work/checkout-gate-driver.sh" <<'DRIVER'
#!/usr/bin/env bash
set -euo pipefail
source "$REPO/deploy/install-from-source.sh"
source_dir=$FIXTURE
release_root="$MODEL/releases"
state_root="$MODEL/config"
backup_root="$MODEL/backups"
current="$MODEL/current"
receipt="$MODEL/receipt"
preflight_host() { :; }
check_existing() { :; }
git() {
  case "${3:-} ${4:-}" in
    'remote get-url') echo https://github.com/andresz74/verilio.git ;;
    'worktree add')
      mkdir -p "$6/deploy"
      printf '#!/usr/bin/env bash\nmkdir -p "$2/verilio-$1"\n' > "$6/deploy/export-release.sh"
      chmod +x "$6/deploy/export-release.sh" ;;
    'worktree remove') rm -rf -- "$5" ;;
    *) command git "$@" ;;
  esac
}
sudo() {
  case "${1:-}" in
    test) [[ ${2:-} == -d || ${2:-} == "!" ]] ;;
    mkdir|rmdir) : ;; # ephemeral lock only, no privileged call
    install) touch "$MODEL/persistent-mutation"; return 42 ;;
    *) echo "Unexpected mocked privilege boundary: $*" >&2; return 99 ;;
  esac
}
build_images() { echo build > "$MODEL/events"; printf '%s\n' "$scratch" > "$MODEL/scratch-path"; }
verify_release() {
  echo verified >> "$MODEL/events"
  case "$DRIFT" in
    head) command git -C "$source_dir" checkout -q foreign ;;
    bootstrap) printf 'changed during build\n' >> "$source_dir/deploy/bootstrap-source-state.sh" ;;
    untracked) touch "$source_dir/after-build-untracked" ;;
    unchanged) : ;;
  esac
}
installer_main --ref origin/main
DRIVER
for drift in head bootstrap untracked; do
  model="$work/model-$drift"; mkdir "$model"
  if env VERILIO_SOURCE_INSTALL_WORK_ROOT="$work/workspace" REPO="$repo_root" FIXTURE="$source_dir" MODEL="$model" DRIFT="$drift" bash "$work/checkout-gate-driver.sh" > "$model/output" 2>&1; then fail "post-build $drift unexpectedly passed"; fi
  check "post-build $drift reached artifact verification" grep -q verified "$model/events"
  check "post-build $drift refuses at actual checkout gate" grep -q 'Installer .*changed' "$model/output"
  check "post-build $drift fails before persistent preparation" test ! -e "$model/persistent-mutation"
  command git -C "$source_dir" checkout -q --detach "$first"
  command git -C "$source_dir" restore deploy/bootstrap-source-state.sh
  rm -f "$source_dir/after-build-untracked"
done
model="$work/model-unchanged"; mkdir "$model"
if env VERILIO_SOURCE_INSTALL_WORK_ROOT="$work/workspace" REPO="$repo_root" FIXTURE="$source_dir" MODEL="$model" DRIFT=unchanged bash "$work/checkout-gate-driver.sh" > "$model/output" 2>&1; then fail 'mock preparation boundary should return 42'; fi
check 'unchanged post-build identity reaches preparation boundary' test -e "$model/persistent-mutation"
check 'actual orchestration stages scratch under selected work root' bash -c '[[ $(cat "$1") == "$2"/verilio-source-install.* ]]' sh "$model/scratch-path" "$work_root"

# Portable stat adapter for Linux production validation exercised on macOS CI.
stat() {
  if [[ $(command uname -s) == Darwin && ${1:-} == -c ]]; then
    local format=$2 path=$3
    case "$format" in %a) command stat -f %Lp "$path" ;; %u) command stat -f %u "$path" ;; '%u:%a') command stat -f '%u:%Lp' "$path" ;; *) return 1 ;; esac
  else command stat "$@"; fi
}
mv() {
  if [[ $(command uname -s) == Darwin && ${1:-} == -nT ]]; then
    [[ ! -e "$3" ]] || return 0
    command mv -n "$2" "$3"
  else command mv "$@"; fi
}
uid=$(id -u)
state="$work/state"; backups="$work/backups"; version="main-${first:0:12}"; port=8080
check 'fresh state generates safely' create_source_state "$state" "$backups" "$version" "$port" "$uid"
owner=$(sed -n 's/^LOCAL_USER_ID=//p' "$state/verilio.env")
check 'UUIDv4 format and variant' bash -c '[[ "$1" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]' sh "$owner"
admin=$(cat "$state/secrets/postgres_admin_password"); app=$(cat "$state/secrets/postgres_app_password")
check 'independent 64-hex passwords' bash -c '[[ "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ && "$1" != "$2" ]]' sh "$admin" "$app"
check 'matching URL' test "$(cat "$state/secrets/database_url")" = "postgresql://verilio_app:$app@postgres:5432/verilio"
check 'config mode 0600' test "$(stat -c %a "$state/verilio.env")" = 600
check 'secret directory mode 0700' test "$(stat -c %a "$state/secrets")" = 700
check 'secret files mode 0444' test "$(stat -c %a "$state/secrets/database_url")" = 444
check 'strict complete state validation' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
before=$(shasum -a 256 "$state/verilio.env" "$state/secrets/"*)
reject 'create refuses complete existing state' create_source_state "$state" "$backups" "$version" "$port" "$uid"
check 'existing owner/secrets unchanged' test "$before" = "$(shasum -a 256 "$state/verilio.env" "$state/secrets/"*)"
reject 'state wrong source refused' validate_source_state "$state" "$backups" main-aaaaaaaaaaaa "$port" "$uid"
reject 'state wrong port refused' validate_source_state "$state" "$backups" "$version" 8081 "$uid"
chmod 0644 "$state/verilio.env"
reject 'unsafe env permissions refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
chmod 0600 "$state/verilio.env"
printf 'EVIL=$(echo bad)\n' >> "$state/verilio.env"
reject 'unknown shell assignments refused without sourcing' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
state_env "$version" "$port" "$owner" "$state" "$backups" > "$state/verilio.env"
saved_owner=$owner
owner=not-a-uuid
state_env "$version" "$port" "$owner" "$state" "$backups" > "$state/verilio.env"
reject 'malformed UUID state refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
owner=$saved_owner
state_env "$version" "$port" "$owner" "$state" "$backups" > "$state/verilio.env"
chmod 0644 "$state/secrets/postgres_app_password"
printf '%s\n' "$admin" > "$state/secrets/postgres_app_password"; chmod 0444 "$state/secrets/postgres_app_password"
reject 'duplicate password state refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
chmod 0644 "$state/secrets/postgres_app_password"
printf '%s\n' "$app" > "$state/secrets/postgres_app_password"; chmod 0444 "$state/secrets/postgres_app_password"
ln -s "$state" "$work/state-link"
reject 'symlinked root refused' validate_source_state "$work/state-link" "$backups" "$version" "$port" "$uid"
cp "$state/secrets/database_url" "$work/url"
rm "$state/secrets/database_url"; ln -s "$work/url" "$state/secrets/database_url"
reject 'symlinked secret refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
rm "$state/secrets/database_url"; cp "$work/url" "$state/secrets/database_url"; chmod 0444 "$state/secrets/database_url"
chmod 0644 "$state/secrets/database_url"
printf 'bad\n' > "$state/secrets/database_url"
chmod 0444 "$state/secrets/database_url"
reject 'malformed URL refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
chmod 0644 "$state/secrets/database_url"
cp "$work/url" "$state/secrets/database_url"; chmod 0444 "$state/secrets/database_url"
mkdir "$state/unknown"
reject 'unknown state entry refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
rmdir "$state/unknown"
rm "$state/secrets/postgres_app_password"
reject 'partial state refused' validate_source_state "$state" "$backups" "$version" "$port" "$uid"
check 'errors contain no passwords' bash -c '! grep -F -e "$1" -e "$2" "$3"' sh "$admin" "$app" "$work/rejected"

# Host preflight: every system/privilege-sensitive operation is mocked.
id() { [[ ${1:-} == -u ]] && echo "${fake_uid:-1000}"; }
uname() { case "$1" in -s) echo Linux ;; -m) echo "${fake_arch:-x86_64}" ;; esac; }
sudo() {
  if [[ ${1:-} == -v ]]; then return; fi
  if [[ ${1:-} == df ]]; then
    printf '%s\n' "$3" >> "$work/disk-checks"
    local space=${fake_disk:-99999999}
    [[ "$3" != "$work_root" ]] || space=${fake_work_disk:-$space}
    [[ "$3" != "${TMPDIR:-/tmp}" ]] || space=${fake_tmp_disk:-$space}
    echo 'Filesystem 1024-blocks Used Available Capacity Mounted'
    echo "fake 99999999 0 $space 0 /"
  else "$@"; fi
}
free() { printf 'Mem: 10000000 0 0 0 0 %s\nSwap: 0 0 0\n' "${fake_mem:-9999999}"; }
docker() {
  case "$*" in
    'context inspect --format '{{*) echo "${fake_endpoint:-unix:///var/run/docker.sock}" ;;
    'info --format {{.OSType}}/{{.Architecture}}') echo linux/amd64 ;;
    'info --format {{json .SecurityOptions}}') echo "${fake_security:-[]}" ;;
    'info --format {{.DockerRootDir}}') echo "$work/docker-root" ;;
    'info --format {{.ID}}') echo offline-daemon ;;
    'buildx version'|'compose version') return 0 ;;
    *) fail "unexpected offline Docker operation: $*" ;;
  esac
}
command() {
  if [[ ${1:-} == -v ]]; then [[ ${2:-} != "${missing_tool:-}" ]]; else builtin command "$@"; fi
}
check 'mock host preflight passes' preflight_host
fake_work_disk=1; reject 'insufficient selected work-root space refused' preflight_host; unset fake_work_disk
saved_work_root=$work_root
ln -s "$saved_work_root" "$work/workspace-link"
work_root="$work/workspace-link"; reject 'symlink work root refused' preflight_host
work_root=relative; reject 'relative work root refused' preflight_host
work_root="$work/missing-workspace"; reject 'nonexistent work root refused' preflight_host
work_root=$saved_work_root
chmod 0500 "$work_root"; reject 'non-writable work root refused' preflight_host; chmod 0700 "$work_root"
saved_tmpdir=${TMPDIR-}; tmpdir_was_set=${TMPDIR+x}
TMPDIR="$work/small-tmp"; mkdir "$TMPDIR"; fake_tmp_disk=1
: > "$work/disk-checks"
check 'small ordinary TMPDIR does not gate build space' preflight_host
check 'TMPDIR is not inspected as build filesystem' bash -c '! grep -Fxq "$1" "$2"' sh "$TMPDIR" "$work/disk-checks"
unset fake_tmp_disk
if [[ "$tmpdir_was_set" == x ]]; then TMPDIR=$saved_tmpdir; else unset TMPDIR; fi
fake_uid=0; reject 'root invocation refused' preflight_host; fake_uid=1000
fake_arch=aarch64; reject 'unsupported architecture refused' preflight_host; fake_arch=x86_64
DOCKER_HOST=tcp://remote; reject 'DOCKER_HOST refused' preflight_host; unset DOCKER_HOST
fake_endpoint=tcp://remote; reject 'nonlocal endpoint refused' preflight_host; unset fake_endpoint
fake_security='["name=rootless"]'; reject 'rootless daemon refused' preflight_host; unset fake_security
fake_mem=1; reject 'memory admission guard' preflight_host; unset fake_mem
fake_disk=1; reject 'disk admission guard' preflight_host; unset fake_disk
# Missing dependency is isolated with a mocked command builtin check.
missing_tool=openssl
reject 'missing prerequisite fails preflight' preflight_host
missing_tool=setsid
reject 'missing setsid fails preflight' preflight_host
unset missing_tool
unset -f command

# Root-owned receipt metadata is mocked, not changed on the host.
printf '%s\n' "$app" > "$state/secrets/postgres_app_password"; chmod 0444 "$state/secrets/postgres_app_password"
receipt="$work/receipt"; state_root="$state"; backup_root="$backups"
commit=$first; version="main-${first:0:12}"; port=8080; target="/opt/verilio/releases/verilio-$version"
stat() { if [[ ${1:-} == -c && $2 == '%u:%a' ]]; then echo 0:600; else command stat "$@"; fi; }
state_digest=$(sha256sum "$state_root/verilio.env" "$state_root/secrets/database_url" "$state_root/secrets/postgres_admin_password" "$state_root/secrets/postgres_app_password" | sha256sum | awk '{print $1}')
receipt_body pending > "$receipt"
check 'same-source pending receipt accepted' validate_receipt
check 'receipt includes installer identity' grep -q "^installer_commit=$installer_commit$" "$receipt"
installer_commit=$foreign
reject 'changed installer commit refused on resume' validate_receipt
installer_commit=$first
check 'same installer commit accepted on resume' validate_receipt
saved_source_dir=$source_dir
source_dir="$work/another checkout location"
check 'receipt validation is independent of checkout path' validate_receipt
source_dir=$saved_source_dir
print_plan > "$work/plan"
print_success "$work/baseline" > "$work/success"
check 'initial report includes both installer and source SHA' bash -c 'grep -q "Installer commit: $1" "$3" && grep -q "Source commit: $2" "$3"' sh "$installer_commit" "$commit" "$work/plan"
check 'final report includes both installer and source SHA' bash -c 'grep -q "Installer commit: $1" "$3" && grep -q "Source commit: $2" "$3"' sh "$installer_commit" "$commit" "$work/success"
source_dir="$work/checkout with 'quotes'"
print_handoff > "$work/handoff"
check 'handoff shell quoting reconstructs actual checkout' bash -c 'line=$(sed -n "2p" "$1"); line=${line#cd }; expected=$2; eval "set -- $line"; [[ $# == 1 && $1 == "$expected" ]]' sh "$work/handoff" "$source_dir"
check 'handoff does not hard-code recommended path' bash -c '! grep -q /srv/verilio/source "$1"' sh "$work/handoff"
source_dir=$saved_source_dir
original_digest=$state_digest
printf 'LOCAL_USER_ID=00000000-0000-4000-8000-000000000001\n' > "$state/verilio.env"
reject 'receipt refuses modified stable owner/config' validate_receipt
state_env "$version" "$port" "$owner" "$state" "$backups" > "$state/verilio.env"
state_digest=$original_digest
check 'receipt revalidates unchanged state without regeneration' validate_receipt
port=8081; reject 'resume port mismatch refused' validate_receipt; port=8080
commit=$foreign; reject 'resume full SHA mismatch refused' validate_receipt; commit=$first
receipt_body complete > "$receipt"
reject 'completed receipt refuses fresh installer' validate_receipt
check 'completed refusal directs to existing updater' grep -q 'existing private-main updater' "$work/rejected"
receipt_body pending > "$receipt"; printf 'extra=unsafe\n' >> "$receipt"
reject 'unknown receipt assignments refused' validate_receipt

# Parse real canonical Compose offline, with dummy secret files, no daemon.
unset -f docker sudo stat id uname free git
export COMPOSE_PROJECT_NAME=verilio VERILIO_VERSION="$version" LOCAL_USER_ID=12345678-1234-4567-8123-123456789abc
export VERILIO_GATEWAY_PORT=8080 VERILIO_API_IMAGE=verilio-api VERILIO_GATEWAY_IMAGE=verilio-gateway
export VERILIO_DATABASE_URL_SECRET="$work/url" VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET="$work/url" VERILIO_POSTGRES_APP_PASSWORD_SECRET="$work/url"
docker compose -f "$repo_root/compose.prod.yml" config --format json > "$work/config.json"
check 'exact API/migrate local refs' jq -e --arg version "$version" '.services.api.image == ("verilio-api:"+$version) and .services.migrate.image == ("verilio-api:"+$version)' "$work/config.json"
check 'exact Gateway local ref' jq -e --arg version "$version" '.services.gateway.image == ("verilio-gateway:"+$version)' "$work/config.json"
check 'Gateway only loopback' jq -e '.services.gateway.ports | length == 1 and .[0].host_ip == "127.0.0.1" and .[0].published == "8080"' "$work/config.json"
check 'API and PostgreSQL unpublished' jq -e '(.services.api.ports // []) == [] and (.services.postgres.ports // []) == []' "$work/config.json"
check 'no runtime builds' jq -e '[.services[] | has("build")] | any | not' "$work/config.json"
check 'canonical PostgreSQL named volume retained' jq -e '.volumes.verilio_pgdata.name == "verilio_pgdata"' "$work/config.json"
# Remaining orchestration assertions below use offline source/contracts only.
check 'build/export/server/provenance/backup/smoke helpers reused' bash -c 'for helper in build-release export-release verify-release-provenance server-deploy backup smoke-test; do grep -q "$helper.sh" "$1" || exit 1; done' sh "$repo_root/deploy/install-from-source.sh"
check 'persistent layout creation is deferred until after build/export' bash -c '[[ $(grep -n "phase=build-export" "$1" | cut -d: -f1) -lt $(grep -n "sudo install -d" "$1" | cut -d: -f1) ]]' sh "$repo_root/deploy/install-from-source.sh"
check 'build precedes state preparation' bash -c '[[ $(grep -n "phase=build-export" "$1" | cut -d: -f1) -lt $(grep -n "^  phase=state$" "$1" | cut -d: -f1) ]]' sh "$repo_root/deploy/install-from-source.sh"
check 'no forbidden Docker registry/destructive operations' bash -c '! grep -E "docker (login|push|prune)|down --volumes|ghcr.io" "$1"' sh "$repo_root/deploy/install-from-source.sh"
check 'canonical Compose not independently authored' test ! -e "$repo_root/deploy/source/compose.yml"
check 'no uuidgen prerequisite' bash -c '! grep -q uuidgen "$1" "$2"' sh "$repo_root/deploy/install-from-source.sh" "$repo_root/deploy/bootstrap-source-state.sh"
# Exercise real existing build/export/provenance helpers against an offline Docker
# function. No daemon, network, host state or sudo privileges are used.
MOCK_IMAGES="$work/images"; MOCK_LOG="$work/docker.log"; mkdir "$MOCK_IMAGES"
export MOCK_IMAGES MOCK_LOG commit version
scratch="$work/artifacts"; mkdir -p "$scratch/source/deploy/postgres" "$scratch/source/docs" "$scratch/source/packages/db/migrations"
for helper in build-release export-release verify-release-provenance server-deploy backup smoke-test restore-drill verify-data; do cp "$repo_root/deploy/$helper.sh" "$scratch/source/deploy/"; done
cp "$repo_root/deploy/verilio.env.example" "$scratch/source/deploy/"
cp "$repo_root/deploy/postgres/init-app-role.sh" "$scratch/source/deploy/postgres/"
cp "$repo_root/compose.prod.yml" "$scratch/source/"
cp "$repo_root/docs/08-private_alpha_self_hosted_deployment.md" "$scratch/source/docs/"
printf 'SELECT 1;\n' > "$scratch/source/packages/db/migrations/0000_test.sql"
# Git metadata only; exporter sees the same known commit as the local fixture.
cp -R "$work/source/.git" "$scratch/source/.git"
docker() {
  printf '%s\n' "$*" >> "$MOCK_LOG"
  case "${1:-} ${2:-}" in
    'buildx build')
      [[ ${VERILIO_ALLOW_UNRELEASED_BUILD:-} == true && ${VERILIO_PLATFORM:-} == linux/amd64 ]] || return 1
      [[ ${MOCK_FAIL_BUILD:-false} == false ]] || return 42
      local ref= argument previous=
      for argument in "$@"; do [[ "$previous" != --tag ]] || ref=$argument; previous=$argument; done
      printf 'linux/amd64 https://github.com/andresz74/verilio %s %s\n' "$version" "$commit" > "$MOCK_IMAGES/${ref/:/_}"
      ;;
    'pull --platform') [[ "${*: -1}" == postgres:17.9-alpine ]] || return 1; echo postgres > "$MOCK_IMAGES/postgres_17.9-alpine" ;;
    'image inspect')
      local image="${*: -1}" arg
      for arg in "$@"; do
        case "$arg" in verilio-api:*|verilio-gateway:*|postgres:*) [[ -f "$MOCK_IMAGES/${arg/:/_}" ]] || return 1 ;; esac
      done
      if [[ "$*" == *'{{.Id}}'* ]]; then printf 'sha256:%s\n' "${image%%:*}"
      elif [[ "$image" == postgres:17.9-alpine && "$*" == *'{{.Os}}/{{.Architecture}}'* ]]; then echo "${MOCK_PG_PLATFORM:-linux/amd64}"
      elif [[ "$*" == *'{{.Os}}/{{.Architecture}}'* ]]; then cat "$MOCK_IMAGES/${image/:/_}"; fi
      ;;
    'save verilio-api:'*)
      printf '[{"RepoTags":["verilio-api:%s","verilio-gateway:%s","postgres:17.9-alpine"]}]\n' "$version" "$version" > "$MOCK_IMAGES/manifest.json"
      tar -cf - -C "$MOCK_IMAGES" manifest.json
      ;;
    *) echo "Forbidden offline Docker operation: $*" >&2; return 99 ;;
  esac
}
export -f docker
sudo() { "$@"; }
check 'selected-source canonical build helper builds absent pair' build_images
check 'build helper creates exact two application refs' test "$(find "$MOCK_IMAGES" -name 'verilio-*' | wc -l | tr -d ' ')" = 2
check 'matching complete image pair reused' build_images
export MOCK_PG_PLATFORM=linux/arm64
reject 'existing PostgreSQL platform mismatch refused' build_images
unset MOCK_PG_PLATFORM
check 'reuse does not rebuild pair' test "$(grep -c 'buildx build' "$MOCK_LOG")" = 2
rm "$MOCK_IMAGES/verilio-gateway_$version"
reject 'partial image pair refused' build_images
check 'partial pair not overwritten' test "$(grep -c 'buildx build' "$MOCK_LOG")" = 2
printf 'linux/amd64 https://github.com/andresz74/verilio %s %s\n' "$version" "$commit" > "$MOCK_IMAGES/verilio-gateway_$version"
printf 'wrong\n' > "$MOCK_IMAGES/verilio-api_$version"
reject 'immutable mismatched image provenance refused' build_images
printf 'linux/amd64 https://github.com/andresz74/verilio %s %s\n' "$version" "$commit" > "$MOCK_IMAGES/verilio-api_$version"
check 'real canonical archive export succeeds offline' "$scratch/source/deploy/export-release.sh" "$version" "$scratch/export"
staged="$scratch/export/verilio-$version"
printf 'VERILIO_VERSION=%s\n' "$version" > "$scratch/verify.env"
check 'exported Compose byte identical to canonical' cmp "$repo_root/compose.prod.yml" "$staged/compose.prod.yml"
check 'real archive provenance and image IDs verified' verify_release "$staged" "$scratch/verify.env"
saved_scratch=$scratch; scratch=
check 'resume verifies installed runtime against selected Git source before worktree creation' verify_release "$staged" "$saved_scratch/verify.env"
scratch=$saved_scratch
reject 'existing immutable export destination refused' "$scratch/source/deploy/export-release.sh" "$version" "$scratch/export"
printf '\n# tampered\n' >> "$staged/compose.prod.yml"
reject 'tampered release rejected before use' verify_release "$staged" "$scratch/verify.env"
check 'offline Docker operations limited to build mocks/inspect/save/DB pull mock' bash -c '! grep -E "login|push|prune|ghcr.io|compose .* up" "$1"' sh "$MOCK_LOG"
# A real build-helper failure must not invoke export or protected state.
rm "$MOCK_IMAGES/verilio-api_$version" "$MOCK_IMAGES/verilio-gateway_$version"
export MOCK_FAIL_BUILD=true
reject 'build helper failure propagates' build_images
check 'build failure creates no images or state' test ! -e "$MOCK_IMAGES/verilio-api_$version"
unset MOCK_FAIL_BUILD

# Verify production config gate rejects each unsafe modification semantically.
config_fixture="$work/config.json"
docker() { [[ "$*" == *'config --format json' ]] || return 99; cat "$config_fixture"; }
check 'installer config gate accepts canonical interpolation' check_config "$repo_root" "$work/unused.env"
for expression in '.services.gateway.ports[0].host_ip="0.0.0.0"' '.services.api.ports=[{"target":3000,"published":"3000"}]' '.services.postgres.ports=[{"target":5432,"published":"5432"}]' '.services.api.build={"context":"."}' '.services.api.image="verilio-api:latest"' '.volumes.verilio_pgdata.name="foreign"'; do
  jq "$expression" "$work/config.json" > "$work/unsafe.json"
  config_fixture="$work/unsafe.json"
  reject "config rejects $expression" check_config "$repo_root" "$work/unused.env"
done

# Read-only conflicting-host checks use test paths and mocked metadata/Docker.
receipt="$work/no-receipt"; state_root="$work/no-state"; backup_root="$work/no-backups"
current="$work/no-current"; release_root="$work/no-releases"; target="$release_root/verilio-$version"; resume=false
sudo() {
  if [[ ${1:-} == test && ${*: -1} == /opt/verilio ]]; then return 1; fi
  if [[ ${1:-} == stat ]]; then echo 0:755; else "$@"; fi
}
occupied=false; unfamiliar=false
ss() { [[ "$occupied" == false ]] || echo listening; }
docker() { case "$1 $2" in 'volume inspect') [[ "$unfamiliar" == true ]] ;; 'ps -aq') return 0 ;; *) return 99 ;; esac; }
check 'clean host state admission' check_existing
occupied=true; reject 'occupied port refused before state/build' check_existing; occupied=false
unfamiliar=true; reject 'unfamiliar named volume refused' check_existing; unfamiliar=false
mkdir "$state_root"; reject 'foreign existing protected state refused' check_existing; rmdir "$state_root"
mkdir -p "$target"; reject 'immutable existing release refused for fresh install' check_existing
rmdir "$target" "$release_root"
resume=true; reject 'resume without installer receipt refused' check_existing; resume=false
# Pending resume admission: metadata/bootstrap/provenance are narrowly mocked;
# filesystem entries, receipt validation and refusal logic are real and disposable.
state_root="$state"; backup_root="$backups"; receipt="$work/resume.receipt"
release_root="$work/resume-releases"; mkdir "$release_root"
target="$release_root/verilio-$version"; current="$work/resume-current"
resume=true; receipt_phase=state; installer_commit=$first
state_digest=$(sha256sum "$state_root/verilio.env" "$state_root/secrets/database_url" "$state_root/secrets/postgres_admin_password" "$state_root/secrets/postgres_app_password" | sha256sum | awk '{print $1}')
receipt_body pending > "$receipt"
# Preserve production verifier for later tests after the temporary call spy.
saved_verifier=$(declare -f verify_release)
verify_release() { printf '%s\n' "$1" >> "$work/resume-provenance.log"; [[ ${bad_target:-false} == false ]]; }
sudo() {
  if [[ ${1:-} == test && ${*: -1} == /opt/verilio ]]; then return 1; fi
  if [[ ${1:-} == stat ]]; then
    if [[ ${*: -1} == "$receipt" ]]; then echo 0:600; else echo 0:755; fi
  elif [[ ${1:-} == *bootstrap-source-state.sh ]]; then
    validate_source_state "$state_root" "$backup_root" "$version" "$port" "$uid"
  else "$@"; fi
}
# macOS stat adaptation only for disposable state validation.
stat() { case "$2" in %a) command stat -f %Lp "$3" ;; %u) command stat -f %u "$3" ;; *) command stat "$@" ;; esac; }
if [[ $(command uname -s) != Darwin ]]; then unset -f stat; fi
project_exists=false
docker() { case "$1 $2" in 'volume inspect') [[ "$unfamiliar" == true ]] ;; 'ps -aq') [[ "$project_exists" == false ]] || echo fixture-container ;; *) return 99 ;; esac; }
check 'pre-selection same-identity pending resume admitted' check_existing
mkdir "$release_root/foreign-release"
reject 'foreign release entry refuses resume' check_existing
rmdir "$release_root/foreign-release"
unfamiliar=true
reject 'pre-selection foreign named volume refuses resume' check_existing
unfamiliar=false; project_exists=true
reject 'pre-selection foreign Compose project refuses resume' check_existing
project_exists=false
mkdir "$target"
check 'expected target is provenance-checked even before selection' check_existing
check 'target verification invoked' grep -q "$target" "$work/resume-provenance.log"
bad_target=true; reject 'invalid expected-target provenance refuses resume' check_existing; bad_target=false
ln -s "$target" "$current"
reject 'current is forbidden before selection phase' check_existing
rm "$current"
receipt_phase=selected; receipt_body pending > "$receipt"
check 'recorded selection intent can resume before symlink creation' check_existing
ln -s "$target" "$current"
unfamiliar=true
reject 'selected phase still refuses a foreign runtime volume' check_existing
unfamiliar=false
receipt_phase=runtime; receipt_body pending > "$receipt"
unfamiliar=true; project_exists=true; occupied=true
check 'legitimate runtime-phase resume preserves volume containers current' check_existing
rm "$current"; ln -s "$work/foreign-target" "$current"
reject 'foreign current pointer refuses runtime resume' check_existing
rm "$current"
reject 'runtime phase without current refuses resume' check_existing
ln -s "$target" "$current"
mkdir "$release_root/other"
reject 'runtime-phase resume still refuses foreign release entry' check_existing
rmdir "$release_root/other"
receipt_phase=arbitrary; receipt_body pending > "$receipt"
reject 'unknown receipt phase refuses resume' check_existing
receipt_phase=runtime
unset -f stat
eval "$saved_verifier"
unset -f docker sudo ss

# Runtime security checks: synthetic Docker inspection captures full contracts.
state_root="$work/runtime-state"; mkdir "$state_root"
printf 'LOCAL_USER_ID=%s\n' "$owner" > "$state_root/verilio.env"
target="$work/runtime-release"; mkdir -p "$target/deploy"
printf '#!/usr/bin/env bash\nexit 0\n' > "$target/deploy/smoke-test.sh"; chmod +x "$target/deploy/smoke-test.sh"
for service in postgres migrate api gateway; do
  case "$service" in api|migrate) image="verilio-api:$version"; secrets='["database_url"]' ;; gateway) image="verilio-gateway:$version"; secrets='[]' ;; postgres) image=postgres:17.9-alpine; secrets='["postgres_admin_password","postgres_app_password"]' ;; esac
  jq -n --arg service "$service" --arg image "$image" --arg owner "$owner" --arg root "$state_root" --arg target "$target" --argjson secrets "$secrets" '[{
    State: (if $service=="migrate" then {Status:"exited",ExitCode:0} else {Status:"running",Health:{Status:"healthy"}} end),
    Config:{Image:$image,Env:[("LOCAL_USER_ID="+$owner)]},Image:("sha256:"+($image|split(":")[0])),
    HostConfig:{PortBindings:(if $service=="gateway" then {"8080/tcp":[{HostIp:"127.0.0.1",HostPort:"8080"}]} else {} end)},
    Mounts: ([$secrets[] | {Destination:("/run/secrets/"+.),Source:($root+"/secrets/"+.),RW:false}] +
      if $service=="postgres" then [{Name:"verilio_pgdata",Destination:"/var/lib/postgresql/data"},{Source:($target+"/deploy/postgres/init-app-role.sh"),Destination:"/docker-entrypoint-initdb.d/10-verilio-app-role.sh",RW:false}] else [] end)
  }]' > "$work/$service.json"
done
sudo() { "$@"; }
docker() {
  case "$1 $2" in
    'compose --env-file') echo "${*: -1}" ;;
    'inspect '*) cat "$work/$2.json" ;;
    'image inspect') local image="${*: -1}"; echo "sha256:${image%%:*}" ;;
    *) return 99 ;;
  esac
}
curl() { echo "${MOCK_HTTP_CODE:-200}"; }
check 'full runtime/owner/image/mount/health gate passes mock evidence' verify_runtime
MOCK_HTTP_CODE=503
reject 'non-200 live/readiness response refused' verify_runtime
unset MOCK_HTTP_CODE
for item in 'api:.State.Health.Status="unhealthy"' 'migrate:.State.ExitCode=1' 'gateway:.HostConfig.PortBindings["8080/tcp"][0].HostIp="0.0.0.0"' 'postgres:.Mounts[0].RW=true' 'postgres:.Mounts[-1].RW=true' 'api:.Config.Env=[]' 'api:.Image="sha256:foreign"'; do
  service=${item%%:*}; expression=${item#*:}
  cp "$work/$service.json" "$work/original.json"
  jq ".[0] | $expression | [.]" "$work/original.json" > "$work/$service.json"
  reject "runtime gate rejects $item" verify_runtime
  cp "$work/original.json" "$work/$service.json"
done
unset -f docker sudo curl
# Baseline backup: run the real completion/EXIT flow, with only sudo/receipt I/O
# mocked against disposable files. No PTY, privilege or Docker daemon is required.
cat > "$work/backup-driver.sh" <<'DRIVER'
#!/usr/bin/env bash
set -euo pipefail
source "$REPO/deploy/install-from-source.sh"
scratch="$MODEL/scratch"
work_root=$MODEL
backup_root="$MODEL/backups"
receipt="$MODEL/receipt"
state_root="$MODEL/state"
target="$MODEL/release"
lock="$MODEL/lock"
installer_commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
commit=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
version=main-bbbbbbbbbbbb
receipt_phase=runtime
locked=true
mkdir -p "$scratch" "$backup_root/accepted" "$state_root" "$target" "$lock" "$MODEL/outside"
printf 'preserved runtime/state\n' > "$state_root/evidence"
printf 'dump\n' > "$backup_root/accepted/database.dump"
(cd "$backup_root/accepted" && sha256sum database.dump > checksums.txt)
receipt_body pending > "$receipt"
if [[ "$MODE" == checksum ]]; then printf 'corruption\n' >> "$backup_root/accepted/database.dump"; fi
ln -s "$MODEL/outside" "$backup_root/link"
sudo() {
  case "$1" in
    -n)
      [[ "$2 $3 $4" == 'setsid --wait env' ]] || return 98
      [[ ! -t 0 && $(cat) == "" ]] || return 97
      echo stdin-eof >> "$MODEL/events"
      [[ "$BASH_SUBSHELL" == 0 ]] || { echo 'Backup sudo entered a subshell' >&2; return 99; }
      echo backup-foreground >> "$MODEL/events"
      case "$MODE" in
        failure) printf 'PRIVATE-DIAGNOSTIC\n' >&2; printf 'partial\n' > "$backup_root/partial-evidence"; printf '%s\n' "$backup_root/accepted"; return 73 ;;
        empty) : ;;
        multiline) printf '%s\n%s\n' "$backup_root/accepted" "$backup_root/accepted" ;;
        blankline) printf '%s\n\n' "$backup_root/accepted" ;;
        outside) printf '%s\n' "$MODEL/outside" ;;
        traversal) printf '%s\n' "$backup_root/../outside" ;;
        symlink) printf '%s\n' "$backup_root/link" ;;
        missing) printf '%s\n' "$backup_root/missing" ;;
        stderr) printf 'PRIVATE-DIAGNOSTIC\n' >&2; printf '%s\n' "$backup_root/accepted" ;;
        success|checksum) printf '%s\n' "$backup_root/accepted" ;;
        *) return 99 ;;
      esac
      echo backup-exited >> "$MODEL/events" ;;
    test) echo path-check >> "$MODEL/events"; "$@" ;;
    sh) echo checksums >> "$MODEL/events"; "$@" ;;
    rmdir) "$@" ;;
    *) echo "Unexpected offline sudo: $*" >&2; return 99 ;;
  esac
}
write_receipt() { echo "$1" >> "$MODEL/events"; receipt_body "$1" > "$receipt"; }
print_success() { echo success >> "$MODEL/events"; printf 'Accepted backup: %s\n' "$1"; }
trap cleanup EXIT
complete_install
DRIVER
# Verify the privileged backup invocation itself is a direct command, without
# command substitution, backgrounding or a pipe (redirection is intentional).
check 'baseline sudo backup is structurally direct foreground' python3 - "$repo_root/deploy/install-from-source.sh" <<'PYTEST'
import sys
s = open(sys.argv[1]).read()
lines = [line.strip() for line in s.splitlines() if '"$target/deploy/backup.sh"' in line]
assert len(lines) == 1
line = lines[0]
assert line.startswith('sudo -n setsid --wait env ')
command, guard = line.split(' || ')
assert '$(' not in command and '`' not in command and '|' not in command and '&' not in command
assert '</dev/null' in command
assert '>"$backup_path_file"' in command
assert '2>"$backup_stderr_file"' in command
assert guard == '{'
assert 'local backup_path_file="$scratch/baseline-backup.path"' in s
assert 'backup_stderr_file=$(mktemp "$work_root/verilio-source-install-backup-stderr.XXXXXX")' in s
assert 'umask 077' in s
assert 'sudo -v' in s
assert 'sudo setsid openssl' in s
body = s[s.index('complete_install() {'):s.index('installer_main() {')]
assert body.index(line) < body.index('[[ ! -s "$backup_stderr_file" ]]') < body.index('while IFS= read') < body.index('write_receipt complete')
PYTEST
for mode in failure stderr empty multiline blankline outside traversal symlink missing checksum; do
  model="$work/backup-$mode"; mkdir "$model"
  if env REPO="$repo_root" MODEL="$model" MODE="$mode" bash "$work/backup-driver.sh" > "$model/output" 2>&1; then fail "baseline backup $mode unexpectedly accepted"; fi
  pass "baseline backup $mode refuses completion"
  check "baseline backup $mode preserves pending runtime receipt" bash -c 'grep -Fxq status=pending "$1" && grep -Fxq phase=runtime "$1"' sh "$model/receipt"
  check "baseline backup $mode cleans lock and preserves state/release" bash -c '[[ ! -e "$1/lock" && -d "$1/release" && $(cat "$1/state/evidence") == "preserved runtime/state" ]]' sh "$model"
done
model="$work/backup-failure"
check 'failed privileged backup output is not consumed/verified' bash -c '! grep -Eq "^(path-check|checksums|complete|success)$" "$1"' sh "$model/events"
check 'detached failure reports exit phase and retained diagnostic location' bash -c 'grep -q "Source install error (baseline-backup): Detached baseline backup exited 73; stderr retained at" "$1/output" && (( $(find "$1" -name "verilio-source-install-backup-stderr.*" | wc -l) == 1 ))' sh "$model"
check 'detached failure diagnostic remains private and is never printed' bash -c 'file=$(find "$1" -name "verilio-source-install-backup-stderr.*"); grep -Fxq PRIVATE-DIAGNOSTIC "$file" && ! grep -q PRIVATE-DIAGNOSTIC "$1/output"' sh "$model"
check 'retained stderr diagnostic has deployment-user-only permissions' python3 - "$model" <<'PYTEST'
import pathlib, stat, sys
files = list(pathlib.Path(sys.argv[1]).glob('verilio-source-install-backup-stderr.*'))
assert len(files) == 1
assert stat.S_IMODE(files[0].stat().st_mode) == 0o600
PYTEST
check 'otherwise-successful stderr refuses before path/checksum acceptance' bash -c '! grep -Eq "^(path-check|checksums|complete|success)$" "$1/events" && grep -q "Baseline backup reported stderr" "$1/output" && ! grep -q PRIVATE-DIAGNOSTIC "$1/output"' sh "$work/backup-stderr"
check 'failed backup partial artifact remains for investigation' test -f "$model/backups/partial-evidence"
check 'checksum failure reaches verification before refusal' grep -Fxq checksums "$work/backup-checksum/events"
model="$work/backup-success"; mkdir "$model"
check 'accepted baseline backup completes foreground flow' env REPO="$repo_root" MODEL="$model" MODE=success bash "$work/backup-driver.sh"
printf '%s\n' stdin-eof backup-foreground backup-exited path-check path-check checksums complete success > "$work/backup-expected-events"
check 'complete receipt follows accepted backup/checksums only' bash -c 'grep -Fxq status=complete "$1/receipt" && cmp -s "$1/events" "$2"' sh "$model" "$work/backup-expected-events"
check 'successful backup also releases ephemeral lock' test ! -e "$model/lock"
check 'successful backup removes empty diagnostic file' bash -c '[[ -z $(find "$1" -name "verilio-source-install-backup-stderr.*") ]]' sh "$model"
check 'canonical Compose unchanged against main' git diff --exit-code main -- "$repo_root/compose.prod.yml"
echo "$passed source installer tests passed."

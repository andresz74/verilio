#!/usr/bin/env bash
# Installer-internal helper. Configuration is data, never sourced here.
set -euo pipefail
set +x

state_error() { echo "Source state error: $*" >&2; return 1; }
state_metadata() {
  local path=$1 mode=$2 uid=${3:-0}
  [[ ! -L "$path" && -e "$path" ]] || { state_error 'Missing or symlinked state; preserve and investigate.'; return 1; }
  [[ $(stat -c %a "$path") == "$mode" && $(stat -c %u "$path") == "$uid" ]] || { state_error 'Unsafe state ownership/permissions.'; return 1; }
}
state_env() {
  local version=$1 port=$2 owner=$3 root=$4 backups=$5
  cat <<ENV
COMPOSE_PROJECT_NAME=verilio
VERILIO_VERSION=$version
VERILIO_API_IMAGE=verilio-api
VERILIO_GATEWAY_IMAGE=verilio-gateway
LOCAL_USER_ID=$owner
LOG_LEVEL=info
VERILIO_GATEWAY_PORT=$port
VERILIO_PGDATA_VOLUME=verilio_pgdata
VERILIO_BACKUP_DIR=$backups
VERILIO_BACKUP_RETENTION_DAYS=7
VERILIO_DATABASE_URL_SECRET=$root/secrets/database_url
VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET=$root/secrets/postgres_admin_password
VERILIO_POSTGRES_APP_PASSWORD_SECRET=$root/secrets/postgres_app_password
ENV
}
validate_source_state() {
  local root=$1 backups=$2 version=$3 port=$4 uid=${5:-0} owner admin app
  [[ "$version" =~ ^main-[0-9a-f]{12}$ && "$port" =~ ^[1-9][0-9]{0,4}$ ]] || return 1
  local path
  for path in "$root" "$root/secrets" "$backups"; do
    [[ -d "$path" ]] && state_metadata "$path" 700 "$uid" || return 1
  done
  [[ $(find "$root" -mindepth 1 -maxdepth 1 | wc -l) -eq 2 && $(find "$root/secrets" -mindepth 1 -maxdepth 1 | wc -l) -eq 3 ]] || { state_error 'Unknown/partial state entries.'; return 1; }
  [[ -f "$root/verilio.env" ]] && state_metadata "$root/verilio.env" 600 "$uid" || return 1
  for path in database_url postgres_admin_password postgres_app_password; do
    [[ -f "$root/secrets/$path" ]] && state_metadata "$root/secrets/$path" 444 "$uid" || return 1
  done
  owner=$(sed -n 's/^LOCAL_USER_ID=//p' "$root/verilio.env")
  [[ "$owner" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || { state_error 'Malformed owner UUID.'; return 1; }
  state_env "$version" "$port" "$owner" "$root" "$backups" | cmp -s - "$root/verilio.env" || { state_error 'Configuration differs from strict installer contract.'; return 1; }
  admin=$(cat "$root/secrets/postgres_admin_password")
  app=$(cat "$root/secrets/postgres_app_password")
  [[ "$admin" =~ ^[0-9a-f]{64}$ && "$app" =~ ^[0-9a-f]{64}$ && "$admin" != "$app" ]] || { state_error 'Malformed/non-independent credentials.'; return 1; }
  printf '%s\n' "$admin" | cmp -s - "$root/secrets/postgres_admin_password" || return 1
  printf '%s\n' "$app" | cmp -s - "$root/secrets/postgres_app_password" || return 1
  printf 'postgresql://verilio_app:%s@postgres:5432/verilio\n' "$app" | cmp -s - "$root/secrets/database_url" || { state_error 'Inconsistent database URL.'; return 1; }
}
create_source_state() {
  local root=$1 backups=$2 version=$3 port=$4 uid=${5:-0} random owner app stage variant
  [[ ! -e "$root" && ! -L "$root" && ! -e "$backups" && ! -L "$backups" ]] || { state_error 'Existing state refused; no regeneration.'; return 1; }
  umask 077
  stage=$(mktemp -d "$(dirname "$root")/.verilio-state.XXXXXX")
  mkdir -m 0700 "$stage/secrets"
  random=$(openssl rand -hex 16)
  variant=$(printf '%x' "$(( (16#${random:16:1} & 3) | 8 ))")
  owner="${random:0:8}-${random:8:4}-4${random:13:3}-${variant}${random:17:3}-${random:20:12}"
  openssl rand -hex 32 > "$stage/secrets/postgres_admin_password"
  openssl rand -hex 32 > "$stage/secrets/postgres_app_password"
  app=$(cat "$stage/secrets/postgres_app_password")
  printf 'postgresql://verilio_app:%s@postgres:5432/verilio\n' "$app" > "$stage/secrets/database_url"
  state_env "$version" "$port" "$owner" "$root" "$backups" > "$stage/verilio.env"
  chmod 0600 "$stage/verilio.env"
  chmod 0444 "$stage/secrets/"*
  # No replacement/nesting of a destination created by another process.
  mv -nT "$stage" "$root"
  [[ ! -e "$stage" ]] || { state_error 'State destination appeared; staging retained.'; return 1; }
  mkdir -m 0700 "$backups"
  validate_source_state "$root" "$backups" "$version" "$port" "$uid"
}
bootstrap_main() {
  [[ $(id -u) == 0 && $# == 3 ]] || { state_error 'Installer-internal usage: root helper <create|validate> <main-sha12> <port>'; return 1; }
  local action=$1 version=$2 port=$3
  [[ "$version" =~ ^main-[0-9a-f]{12}$ && "$port" =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$port <= 65535)) || return 1
  # Installer supplies a protected receipt; helper never accepts arbitrary env.
  [[ -f /opt/verilio/source-install.receipt ]] && state_metadata /opt/verilio/source-install.receipt 600 || return 1
  local commit installer_commit receipt_phase digest
  commit=$(sed -n 's/^source_commit=//p' /opt/verilio/source-install.receipt)
  [[ "$commit" =~ ^[0-9a-f]{40}$ && "$version" == "main-${commit:0:12}" ]] || return 1
  installer_commit=$(sed -n 's/^installer_commit=//p' /opt/verilio/source-install.receipt)
  [[ "$installer_commit" =~ ^[0-9a-f]{40}$ ]] || return 1
  receipt_phase=$(sed -n 's/^phase=//p' /opt/verilio/source-install.receipt)
  case "$receipt_phase" in state|installed|selected|runtime) ;; *) return 1 ;; esac
  [[ "$action" != create || "$receipt_phase" == state ]] || return 1
  if [[ "$action" == create ]]; then digest=unprepared; else
    digest=$(sha256sum /etc/verilio/verilio.env /etc/verilio/secrets/database_url /etc/verilio/secrets/postgres_admin_password /etc/verilio/secrets/postgres_app_password | sha256sum | awk '{print $1}')
  fi
  printf 'format=2\nstatus=pending\nphase=%s\ninstaller_commit=%s\nsource_commit=%s\nversion=%s\nport=%s\nrelease=/opt/verilio/releases/verilio-%s\nconfig=/etc/verilio/verilio.env\nproject=verilio\nvolume=verilio_pgdata\nbackups=/srv/verilio/backups\nstate_sha256=%s\n' "$receipt_phase" "$installer_commit" "$commit" "$version" "$port" "$version" "$digest" | cmp -s - /opt/verilio/source-install.receipt || return 1
  case "$action" in
    create) create_source_state /etc/verilio /srv/verilio/backups "$version" "$port" ;;
    validate) validate_source_state /etc/verilio /srv/verilio/backups "$version" "$port" ;;
    *) return 1 ;;
  esac
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then bootstrap_main "$@"; fi

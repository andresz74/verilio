#!/usr/bin/env bash
# Prepare external recovery-critical state; never build, pull or start containers.
set -euo pipefail

package_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)

die() { echo "Verilio bootstrap: $*" >&2; exit 1; }

validate_state() {
  local root=$1 owner admin app url directory file mode
  for directory in "$root" "$root/config" "$root/secrets" "$root/support" "$root/postgres"; do
    [[ -d "$directory" && ! -L "$directory" ]] || die 'Partial/inconsistent state: missing or symlinked directory; preserve and investigate it.'
    mode=$(stat -c '%a' "$directory" 2>/dev/null || stat -f '%Lp' "$directory")
    [[ "$mode" == 700 ]] || die 'Unsafe state directory permissions; preserve and investigate it.'
    if [[ "$directory" != "$root/postgres" ]]; then
      [[ $(stat -c '%u' "$directory" 2>/dev/null || stat -f '%u' "$directory") == "$(id -u)" ]] || die 'Unexpected state directory ownership.'
    fi
  done
  for file in config/runtime.env secrets/postgres_admin_password secrets/postgres_app_password secrets/database_url support/init-app-role.sh; do
    [[ -f "$root/$file" && ! -L "$root/$file" ]] || die 'Partial/inconsistent state: missing or symlinked file; no values regenerated.'
    [[ $(stat -c '%u' "$root/$file" 2>/dev/null || stat -f '%u' "$root/$file") == "$(id -u)" ]] || die 'Unexpected state file ownership.'
    mode=$(stat -c '%a' "$root/$file" 2>/dev/null || stat -f '%Lp' "$root/$file")
    case "$file" in
      config/*) [[ "$mode" == 600 ]] || die 'Unsafe runtime config permissions.' ;;
      secrets/*) [[ "$mode" == 444 ]] || die 'Unexpected secret permissions.' ;;
      support/*) [[ "$mode" == 555 ]] || die 'Unexpected support script permissions.' ;;
    esac
  done
  owner=$(sed -n 's/^LOCAL_USER_ID=//p' "$root/config/runtime.env")
  [[ "$owner" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || die 'Invalid stable owner UUID.'
  printf 'LOCAL_USER_ID=%s\nLOG_LEVEL=info\n' "$owner" | cmp -s - "$root/config/runtime.env" || die 'Unexpected runtime config; no values regenerated.'
  admin=$(cat "$root/secrets/postgres_admin_password")
  app=$(cat "$root/secrets/postgres_app_password")
  [[ "$admin" =~ ^[0-9a-f]{64}$ && "$app" =~ ^[0-9a-f]{64}$ && "$admin" != "$app" ]] || die 'Invalid or non-independent password files.'
  url=$(cat "$root/secrets/database_url")
  [[ "$url" == "postgresql://verilio_app:$app@postgres:5432/verilio" ]] || die 'Database URL is inconsistent with app credentials.'
  cmp -s "$package_root/support/init-app-role.sh" "$root/support/init-app-role.sh" || die 'PostgreSQL bootstrap support differs; review without overwriting.'
  if [[ -e "$root/postgres/PG_VERSION" ]]; then
    [[ -f "$root/postgres/PG_VERSION" && ! -L "$root/postgres/PG_VERSION" && $(cat "$root/postgres/PG_VERSION") == 17 ]] || die 'Unexpected PostgreSQL data version.'
  elif [[ -n $(find "$root/postgres" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
    die 'PostgreSQL data is partial/inconsistent; preserve and investigate it.'
  fi
}

# Kept as a function so offline tests can exercise disposable state without root.
prepare_state() {
  local root=$1 random owner app
  [[ "$root" == /* ]] || die 'State path must be absolute.'
  [[ ! -L "$root" ]] || die 'Refusing a symlinked state root.'
  [[ -f "$package_root/support/init-app-role.sh" ]] || die 'Transfer the complete package including support/init-app-role.sh.'
  if [[ -e "$root" ]]; then
    validate_state "$root"
    echo "Existing complete state preserved: $root"
    return
  fi
  umask 077
  mkdir -m 0700 "$root"
  mkdir -m 0700 "$root/config" "$root/secrets" "$root/postgres" "$root/support"
  random=$(openssl rand -hex 16)
  owner="${random:0:8}-${random:8:4}-4${random:13:3}-8${random:17:3}-${random:20:12}"
  printf 'LOCAL_USER_ID=%s\nLOG_LEVEL=info\n' "$owner" > "$root/config/runtime.env"
  openssl rand -hex 32 > "$root/secrets/postgres_admin_password"
  openssl rand -hex 32 > "$root/secrets/postgres_app_password"
  app=$(cat "$root/secrets/postgres_app_password")
  printf 'postgresql://verilio_app:%s@postgres:5432/verilio\n' "$app" > "$root/secrets/database_url"
  cp "$package_root/support/init-app-role.sh" "$root/support/init-app-role.sh"
  chmod 0600 "$root/config/runtime.env"
  chmod 0444 "$root/secrets/"*
  chmod 0555 "$root/support/init-app-role.sh"
  validate_state "$root"
  echo "State prepared: $root (owner $owner). Preserve this tree for recovery."
}

main() {
  [[ $# == 0 ]] || die 'Usage: sudo ./bootstrap.sh'
  [[ $(id -u) == 0 ]] || die 'Run with root/sudo on the intended CasaOS host.'
  command -v openssl >/dev/null || die 'OpenSSL is required.'
  [[ -d /DATA && ! -L /DATA ]] || die '/DATA must be an existing real directory.'
  prepare_state /DATA/VerilioState
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi

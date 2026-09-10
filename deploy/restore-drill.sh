#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose_file=${VERILIO_COMPOSE_FILE:-$script_dir/../compose.prod.yml}
source_env_file=${VERILIO_ENV_FILE:-/etc/verilio/verilio.env}
backup_dir=${1:-}

if [[ -z "$backup_dir" || ! -f "$backup_dir/database.dump" || ! -f "$backup_dir/checksums.txt" ]]; then
  echo "Usage: $0 <verified-backup-directory>" >&2
  exit 64
fi

(
  cd "$backup_dir"
  sha256sum --check checksums.txt
)

set -a
# shellcheck disable=SC1090
source "$source_env_file"
set +a
source_version=$VERILIO_VERSION
source_owner_id=$LOCAL_USER_ID

# Values already exported by the source environment take precedence over
# Compose --env-file values, so clear deployment-specific values before
# constructing the isolated restore stack.
unset COMPOSE_PROJECT_NAME \
  VERILIO_DATABASE_URL_SECRET \
  VERILIO_GATEWAY_PORT \
  VERILIO_PGDATA_VOLUME \
  VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET \
  VERILIO_POSTGRES_APP_PASSWORD_SECRET \
  VERILIO_VERSION \
  LOCAL_USER_ID \
  LOG_LEVEL

suffix="${RANDOM}${RANDOM}"
project="verilio-restore-$suffix"
volume="verilio_restore_${suffix}"
port=$((19000 + 10#$suffix % 1000))
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/verilio-restore.XXXXXX")
secret_dir="$work_dir/secrets"
mkdir -m 0700 "$secret_dir"

admin_password="restore-admin-$suffix"
app_password="restore-app-$suffix"
printf '%s' "$admin_password" >"$secret_dir/postgres_admin_password"
printf '%s' "$app_password" >"$secret_dir/postgres_app_password"
printf 'postgresql://verilio_app:%s@postgres:5432/verilio' "$app_password" \
  >"$secret_dir/database_url"
# Match the production file-backed secret permissions used by non-root images.
chmod 0444 "$secret_dir"/*

restore_env="$work_dir/verilio.env"
cat >"$restore_env" <<EOF
COMPOSE_PROJECT_NAME=$project
VERILIO_VERSION=$source_version
LOCAL_USER_ID=$source_owner_id
LOG_LEVEL=info
VERILIO_GATEWAY_PORT=$port
VERILIO_PGDATA_VOLUME=$volume
VERILIO_DATABASE_URL_SECRET=$secret_dir/database_url
VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET=$secret_dir/postgres_admin_password
VERILIO_POSTGRES_APP_PASSWORD_SECRET=$secret_dir/postgres_app_password
EOF

compose=(docker compose --project-name "$project" --env-file "$restore_env" -f "$compose_file")
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

"${compose[@]}" up --detach postgres
timeout=120
until "${compose[@]}" exec -T postgres pg_isready --username verilio_app --dbname verilio >/dev/null 2>&1; do
  sleep 2
  timeout=$((timeout - 2))
  if (( timeout <= 0 )); then
    "${compose[@]}" logs postgres >&2
    echo "Disposable restore PostgreSQL did not become healthy." >&2
    exit 1
  fi
done

"${compose[@]}" exec -T postgres \
  pg_restore --username verilio_app --dbname verilio \
  --no-owner --no-acl --exit-on-error <"$backup_dir/database.dump"
"${compose[@]}" exec -T postgres \
  psql --username verilio_admin --dbname verilio --command ANALYZE >/dev/null

"${compose[@]}" up --detach --wait migrate api gateway

"$script_dir/smoke-test.sh" "http://127.0.0.1:$port"

VERILIO_COMPOSE_FILE="$compose_file" \
VERILIO_ENV_FILE="$restore_env" \
VERILIO_GATEWAY_PORT="$port" \
VERILIO_BASE_URL="http://127.0.0.1:$port" \
  "$script_dir/verify-data.sh"

echo "Disposable backup restore drill passed. Production data was not modified."

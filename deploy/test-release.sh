#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
version=${1:-}

if [[ ! "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || [[ "$version" == "latest" ]]; then
  echo "Usage: $0 <explicit-version>; 'latest' is not allowed." >&2
  exit 64
fi

docker image inspect "verilio-api:$version" "verilio-gateway:$version" >/dev/null

suffix="${RANDOM}${RANDOM}"
project="verilio-release-test-$suffix"
volume="verilio_release_test_${suffix}"
port=$((18000 + 10#$suffix % 1000))
owner_id="00000000-0000-4000-8000-$(printf '%012d' "$((10#$suffix % 1000000000000))")"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/verilio-release-test.XXXXXX")
secret_dir="$work_dir/secrets"
backup_dir="$work_dir/backups"
mkdir -m 0700 "$secret_dir" "$backup_dir"

admin_password="test-admin-$suffix"
app_password="test-app-$suffix"
printf '%s' "$admin_password" >"$secret_dir/postgres_admin_password"
printf '%s' "$app_password" >"$secret_dir/postgres_app_password"
printf 'postgresql://verilio_app:%s@postgres:5432/verilio' "$app_password" \
  >"$secret_dir/database_url"
# Standalone Compose file-backed secrets retain host ownership on Linux. The
# mode-0700 parent protects these files on the host while 0444 lets the
# deliberately non-root containers read their individual read-only mounts.
chmod 0444 "$secret_dir"/*

env_file="$work_dir/verilio.env"
cat >"$env_file" <<EOF
COMPOSE_PROJECT_NAME=$project
VERILIO_VERSION=$version
LOCAL_USER_ID=$owner_id
LOG_LEVEL=info
VERILIO_GATEWAY_PORT=$port
VERILIO_PGDATA_VOLUME=$volume
VERILIO_DATABASE_URL_SECRET=$secret_dir/database_url
VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET=$secret_dir/postgres_admin_password
VERILIO_POSTGRES_APP_PASSWORD_SECRET=$secret_dir/postgres_app_password
EOF

compose=(docker compose --project-name "$project" --env-file "$env_file" -f "$repo_root/compose.prod.yml")
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

"${compose[@]}" config --quiet
"${compose[@]}" up --detach --wait

for private_service in api postgres; do
  private_container=$("${compose[@]}" ps --quiet "$private_service")
  port_bindings=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$private_container")
  if [[ "$port_bindings" != "{}" && "$port_bindings" != "null" ]]; then
    echo "Production $private_service unexpectedly publishes a host port: $port_bindings" >&2
    exit 1
  fi
done
gateway_binding=$("${compose[@]}" port gateway 8080)
if [[ "$gateway_binding" != "127.0.0.1:$port" ]]; then
  echo "Expected loopback gateway binding; found '$gateway_binding'." >&2
  exit 1
fi
data_checksums=$(
  "${compose[@]}" exec -T postgres \
    psql --tuples-only --no-align --username verilio_admin --dbname verilio \
    --command "show data_checksums"
)
if [[ "$data_checksums" != "on" ]]; then
  echo "PostgreSQL data checksums are not enabled." >&2
  exit 1
fi

"$repo_root/deploy/smoke-test.sh" "http://127.0.0.1:$port"

PLAYWRIGHT_EXTERNAL_BASE_URL="http://127.0.0.1:$port" \
  pnpm --dir "$repo_root" exec playwright test \
    --config "$repo_root/deploy/playwright.prod.config.mjs"

VERILIO_COMPOSE_FILE="$repo_root/compose.prod.yml" \
VERILIO_ENV_FILE="$env_file" \
VERILIO_GATEWAY_PORT="$port" \
VERILIO_BASE_URL="http://127.0.0.1:$port" \
  "$repo_root/deploy/verify-data.sh"

docker stats --no-stream \
  --format 'runtime={{.Name}} memory={{.MemUsage}} cpu={{.CPUPerc}}' \
  "$("${compose[@]}" ps --quiet postgres)" \
  "$("${compose[@]}" ps --quiet api)" \
  "$("${compose[@]}" ps --quiet gateway)"

"${compose[@]}" restart postgres api gateway
"${compose[@]}" up --detach --wait
"$repo_root/deploy/smoke-test.sh" "http://127.0.0.1:$port"

created_backup=$(
  VERILIO_COMPOSE_FILE="$repo_root/compose.prod.yml" \
  VERILIO_ENV_FILE="$env_file" \
  VERILIO_BACKUP_DIR="$backup_dir" \
    "$repo_root/deploy/backup.sh" "$version" daily
)

VERILIO_COMPOSE_FILE="$repo_root/compose.prod.yml" \
VERILIO_ENV_FILE="$env_file" \
  "$repo_root/deploy/restore-drill.sh" "$created_backup"

echo "Disposable production release test passed for $version."

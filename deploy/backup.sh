#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose_file=${VERILIO_COMPOSE_FILE:-$script_dir/../compose.prod.yml}
env_file=${VERILIO_ENV_FILE:-/etc/verilio/verilio.env}

if [[ ! -f "$env_file" ]]; then
  echo "Missing production environment file: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

backup_root=${VERILIO_BACKUP_DIR:-/srv/verilio/backups}
retention_days=${VERILIO_BACKUP_RETENTION_DAYS:-7}
version=${1:-${VERILIO_VERSION:-unknown}}
kind=${2:-daily}

if [[ "$kind" != "daily" && "$kind" != "predeploy" ]]; then
  echo "Backup kind must be 'daily' or 'predeploy'." >&2
  exit 64
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_name="verilio-${version}-${kind}-${timestamp}"
final_dir="$backup_root/$backup_name"
working_dir="$backup_root/.${backup_name}.partial"
compose=(docker compose --env-file "$env_file" -f "$compose_file")

install -d -m 0700 "$backup_root"
if [[ -e "$final_dir" || -e "$working_dir" ]]; then
  echo "Backup destination already exists: $backup_name" >&2
  exit 1
fi
install -d -m 0700 "$working_dir"
trap 'rm -rf "$working_dir"' EXIT

"${compose[@]}" exec -T postgres \
  pg_dump --username verilio_admin --dbname verilio \
  --format custom --no-owner --no-acl >"$working_dir/database.dump"

"${compose[@]}" exec -T postgres \
  pg_dumpall --username verilio_admin --globals-only \
  >"$working_dir/globals.sql"

postgres_version=$(
  "${compose[@]}" exec -T postgres \
    psql --tuples-only --no-align --username verilio_admin --dbname verilio \
    --command "show server_version"
)
migration_count=$(
  "${compose[@]}" exec -T postgres \
    psql --tuples-only --no-align --username verilio_admin --dbname verilio \
    --command "select count(*) from drizzle.__drizzle_migrations"
)

(
  cd "$working_dir"
  sha256sum database.dump globals.sql >checksums.txt
)
dump_checksum=$(awk '$2 == "database.dump" { print $1 }' "$working_dir/checksums.txt")

cat >"$working_dir/manifest.txt" <<EOF
timestamp_utc=$timestamp
backup_kind=$kind
verilio_version=$version
postgres_version=$postgres_version
migration_count=$migration_count
backup_filename=database.dump
backup_sha256=$dump_checksum
EOF

chmod 0600 "$working_dir"/*
mv "$working_dir" "$final_dir"
trap - EXIT

find "$backup_root" -mindepth 1 -maxdepth 1 -type d \
  -name 'verilio-*-daily-*' -mtime "+$retention_days" -exec rm -rf -- {} +

echo "$final_dir"

#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose_file=${VERILIO_COMPOSE_FILE:-$script_dir/../compose.prod.yml}
env_file=${VERILIO_ENV_FILE:-/etc/verilio/verilio.env}
base_url=${VERILIO_BASE_URL:-http://127.0.0.1:${VERILIO_GATEWAY_PORT:-8080}}

compose=(docker compose --env-file "$env_file" -f "$compose_file")

for table in business_profiles clients projects tasks time_entries invoices invoice_items invoice_item_time_entries; do
  count=$(
    "${compose[@]}" exec -T postgres \
      psql --tuples-only --no-align --username verilio_admin --dbname verilio \
      --command "select count(*) from $table"
  )
  if [[ ! "$count" =~ ^[1-9][0-9]*$ ]]; then
    echo "Expected restored rows in $table; found '$count'." >&2
    exit 1
  fi
done

settings=$(curl --fail --silent --show-error "$base_url/api/v1/settings")
grep -q '"settings":{' <<<"$settings"

invoices=$(curl --fail --silent --show-error "$base_url/api/v1/invoices")
invoice_id=$(sed -nE 's/.*"id":"([0-9a-f-]{36})".*/\1/p' <<<"$invoices" | head -n 1)
if [[ -z "$invoice_id" ]]; then
  echo "Could not find a restored Invoice ID." >&2
  exit 1
fi

curl --fail --silent --show-error \
  "$base_url/api/v1/invoices/$invoice_id/presentation" >/dev/null

content_type=$(
  curl --fail --silent --show-error --output /dev/null \
    --write-out '%{content_type}' "$base_url/api/v1/invoices/$invoice_id/pdf"
)
if [[ "$content_type" != "application/pdf" ]]; then
  echo "Expected restored Invoice PDF, received '$content_type'." >&2
  exit 1
fi

echo "Restored Verilio domain, traceability, presentation, and PDF data are coherent."


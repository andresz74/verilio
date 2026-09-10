#!/usr/bin/env bash
set -euo pipefail

release_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose_file="$release_dir/compose.prod.yml"
env_file=${VERILIO_ENV_FILE:-/etc/verilio/verilio.env}

if [[ ! -f "$env_file" ]]; then
  echo "Missing production environment file: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ -z "${VERILIO_VERSION:-}" || "$VERILIO_VERSION" == "latest" ]]; then
  echo "VERILIO_VERSION must name an explicit loaded release." >&2
  exit 1
fi

(
  cd "$release_dir"
  sha256sum --check checksums.txt
)

gzip --decompress --stdout "$release_dir/verilio-$VERILIO_VERSION-images.tar.gz" | docker load

compose=(docker compose --env-file "$env_file" -f "$compose_file")

if "${compose[@]}" ps --status running postgres | grep -q postgres; then
  VERILIO_COMPOSE_FILE="$compose_file" \
  VERILIO_ENV_FILE="$env_file" \
    "$release_dir/deploy/backup.sh" "$VERILIO_VERSION" predeploy >/dev/null

  # Enter a short maintenance window before migrations so the old application
  # cannot write against a schema that is being upgraded.
  "${compose[@]}" stop gateway api
fi

"${compose[@]}" up --detach --wait
"$release_dir/deploy/smoke-test.sh" \
  "http://127.0.0.1:${VERILIO_GATEWAY_PORT:-8080}"

echo "Verilio $VERILIO_VERSION is healthy on the loopback gateway."

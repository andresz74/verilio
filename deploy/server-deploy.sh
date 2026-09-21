#!/usr/bin/env bash
set -euo pipefail

release_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
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

"$release_dir/deploy/verify-release-provenance.sh" "$env_file"

compose=(docker compose --env-file "$env_file" -f "$compose_file")

api_container=$("${compose[@]}" ps --all --quiet api | sed -n '1p')
gateway_container=$("${compose[@]}" ps --all --quiet gateway | sed -n '1p')
source_api_image=none
source_gateway_image=none
source_version=none

if [[ -n "$api_container" || -n "$gateway_container" ]]; then
  if [[ -z "$api_container" || -z "$gateway_container" ]]; then
    echo "Existing source deployment is incomplete: both API and gateway containers are required for provenance inspection." >&2
    exit 1
  fi
  source_api_image=$(docker inspect --format '{{.Config.Image}}' "$api_container")
  source_gateway_image=$(docker inspect --format '{{.Config.Image}}' "$gateway_container")
  source_api_version=
  source_gateway_version=
  if [[ "$source_api_image" == verilio-api:* ]]; then
    source_api_version=${source_api_image#verilio-api:}
  fi
  if [[ "$source_gateway_image" == verilio-gateway:* ]]; then
    source_gateway_version=${source_gateway_image#verilio-gateway:}
  fi
  if [[ -n "$source_api_version" && -n "$source_gateway_version" ]]; then
    if [[ "$source_api_version" != "$source_gateway_version" ]]; then
      echo "Existing source deployment provenance mismatch: API uses '$source_api_image' but gateway uses '$source_gateway_image'." >&2
      exit 1
    fi
    source_version=$source_api_version
  else
    source_version=unknown
  fi
fi

gzip --decompress --stdout "$release_dir/verilio-$VERILIO_VERSION-images.tar.gz" | docker load
"$release_dir/deploy/verify-release-provenance.sh" --loaded-images "$env_file"

if "${compose[@]}" ps --status running postgres | grep -q postgres; then
  if [[ "$source_version" == "none" ]]; then
    source_version=unknown
  fi
  VERILIO_BACKUP_SOURCE_VERSION="$source_version" \
  VERILIO_BACKUP_TARGET_VERSION="$VERILIO_VERSION" \
  VERILIO_BACKUP_SOURCE_API_IMAGE="$source_api_image" \
  VERILIO_BACKUP_SOURCE_GATEWAY_IMAGE="$source_gateway_image" \
  VERILIO_COMPOSE_FILE="$compose_file" \
  VERILIO_ENV_FILE="$env_file" \
    "$release_dir/deploy/backup.sh" "$source_version" predeploy >/dev/null

  # Enter a short maintenance window before migrations so the old application
  # cannot write against a schema that is being upgraded.
  "${compose[@]}" stop gateway api
fi

"${compose[@]}" up --detach --wait
"$release_dir/deploy/smoke-test.sh" \
  "http://127.0.0.1:${VERILIO_GATEWAY_PORT:-8080}"

echo "Verilio $VERILIO_VERSION is healthy on the loopback gateway."

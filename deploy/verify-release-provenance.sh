#!/usr/bin/env bash
set -euo pipefail

verify_loaded_images=false
if [[ "${1:-}" == "--loaded-images" ]]; then
  verify_loaded_images=true
  shift
fi

env_file=${1:-${VERILIO_ENV_FILE:-/etc/verilio/verilio.env}}
release_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
compose_file="$release_dir/compose.prod.yml"
manifest_file="$release_dir/release-manifest.txt"
checksums_file="$release_dir/checksums.txt"

fail() {
  echo "Release provenance error: $*" >&2
  exit 1
}

manifest_value() {
  local key=$1
  local value
  if ! value=$(awk -v key="$key" '
    index($0, "=") > 0 && substr($0, 1, index($0, "=") - 1) == key {
      count += 1
      value = substr($0, index($0, "=") + 1)
    }
    END {
      if (count != 1 || value == "") exit 1
      print value
    }
  ' "$manifest_file"); then
    fail "release-manifest.txt must contain exactly one non-empty '$key' value."
  fi
  printf '%s' "$value"
}

archive_has_tag() {
  local archive_manifest=$1
  local image=$2
  grep --fixed-strings --quiet "\"$image\"" <<<"$archive_manifest"
}

if [[ ! -f "$env_file" ]]; then
  fail "missing production environment file: $env_file"
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ -z "${VERILIO_VERSION:-}" || "$VERILIO_VERSION" == "latest" ]]; then
  fail "VERILIO_VERSION must name an explicit release and cannot be 'latest'."
fi
if [[ ! "$VERILIO_VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  fail "VERILIO_VERSION '$VERILIO_VERSION' is not a valid release identifier."
fi

release_directory_name=$(basename "$release_dir")
expected_directory_name="verilio-$VERILIO_VERSION"
if [[ "$release_directory_name" != "$expected_directory_name" ]]; then
  fail "release directory '$release_directory_name' does not match VERILIO_VERSION '$VERILIO_VERSION' (expected '$expected_directory_name')."
fi

if [[ ! -f "$checksums_file" ]]; then
  fail "missing checksums.txt in $release_dir"
fi
if [[ ! -f "$manifest_file" ]]; then
  fail "missing release-manifest.txt in $release_dir"
fi
if [[ ! -f "$compose_file" ]]; then
  fail "missing compose.prod.yml in $release_dir"
fi
image_archive="$release_dir/verilio-$VERILIO_VERSION-images.tar.gz"
if [[ ! -f "$image_archive" ]]; then
  fail "missing expected image archive: $(basename "$image_archive")"
fi
if ! (cd "$release_dir" && sha256sum --check checksums.txt); then
  fail "release checksums failed for $release_dir"
fi

manifest_version=$(manifest_value verilio_version)
if [[ "$manifest_version" != "$VERILIO_VERSION" ]]; then
  fail "release manifest version '$manifest_version' does not match VERILIO_VERSION '$VERILIO_VERSION'."
fi

expected_api_image="verilio-api:$VERILIO_VERSION"
expected_gateway_image="verilio-gateway:$VERILIO_VERSION"
manifest_api_image=$(manifest_value api_image)
manifest_gateway_image=$(manifest_value gateway_image)
manifest_postgres_image=$(manifest_value postgres_image)

if [[ "$manifest_api_image" != "$expected_api_image" ]]; then
  fail "release manifest API image '$manifest_api_image' does not match expected '$expected_api_image'."
fi
if [[ "$manifest_gateway_image" != "$expected_gateway_image" ]]; then
  fail "release manifest gateway image '$manifest_gateway_image' does not match expected '$expected_gateway_image'."
fi

compose_postgres_image=$(awk '
  /^  postgres:$/ { in_postgres = 1; next }
  in_postgres && /^  [[:alnum:]_-]+:$/ { exit }
  in_postgres && /^[[:space:]]+image:[[:space:]]*/ {
    sub(/^[[:space:]]*image:[[:space:]]*/, "")
    print
    exit
  }
' "$compose_file")
if [[ -z "$compose_postgres_image" ]]; then
  fail "could not determine the PostgreSQL image from compose.prod.yml."
fi
if [[ "$manifest_postgres_image" != "$compose_postgres_image" ]]; then
  fail "release manifest PostgreSQL image '$manifest_postgres_image' does not match Compose image '$compose_postgres_image'."
fi

if ! archive_manifest=$(gzip --decompress --stdout "$image_archive" | tar -xOf - manifest.json); then
  fail "could not read manifest.json from $(basename "$image_archive")."
fi

for image in "$expected_api_image" "$expected_gateway_image" "$manifest_postgres_image"; do
  if ! archive_has_tag "$archive_manifest" "$image"; then
    fail "image archive is missing expected tag '$image'."
  fi
done

if [[ "$verify_loaded_images" == "true" ]]; then
  manifest_api_image_id=$(manifest_value api_image_id)
  manifest_gateway_image_id=$(manifest_value gateway_image_id)
  manifest_postgres_image_id=$(manifest_value postgres_image_id)
  for image_and_id in \
    "$expected_api_image|$manifest_api_image_id" \
    "$expected_gateway_image|$manifest_gateway_image_id" \
    "$manifest_postgres_image|$manifest_postgres_image_id"; do
    image=${image_and_id%%|*}
    expected_id=${image_and_id#*|}
    if ! loaded_id=$(docker image inspect --format '{{.Id}}' "$image"); then
      fail "loaded image '$image' could not be inspected."
    fi
    if [[ "$loaded_id" != "$expected_id" ]]; then
      fail "loaded image '$image' has ID '$loaded_id'; release manifest expects '$expected_id'."
    fi
  done
fi

echo "Release provenance verified for $VERILIO_VERSION."

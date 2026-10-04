#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
version=${1:-}
api_repository=${2:-}
gateway_repository=${3:-}
output_root=${4:-$repo_root/release}

usage() {
  echo "Usage: $0 <explicit-version> <api-image-repository> <gateway-image-repository> [output-directory]; 'latest' is not allowed." >&2
  exit 64
}

if (( $# < 3 || $# > 4 )) || [[ ! "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || [[ "$version" == latest ]]; then
  usage
fi

# Keep repository inputs literal in the Compose env file. Tags/digests belong
# outside these inputs; the version supplies the tag. Allow registry host ports.
name_component='[a-z0-9]+(([._]|__|-+)[a-z0-9]+)*'
repository_pattern="^([a-z0-9][a-z0-9.-]*:[0-9]+/)?$name_component(/$name_component)*$"
for repository in "$api_repository" "$gateway_repository"; do
  if [[ ! "$repository" =~ $repository_pattern ]]; then
    echo "Image repositories must be non-empty lowercase repository names without tags, digests, or env interpolation." >&2
    exit 64
  fi
done

package_dir="$output_root/verilio-$version-self-host"
if [[ -e "$package_dir" || -L "$package_dir" ]]; then
  echo "Self-host package already exists: $package_dir" >&2
  exit 1
fi

mkdir -p "$output_root"
# Claim the target exclusively: a concurrent export cannot overwrite it either.
mkdir "$package_dir"
install -d "$package_dir/deploy/postgres"
cp "$repo_root/compose.prod.yml" "$package_dir/compose.yml"
cp "$repo_root/deploy/SELF_HOSTING.md" "$package_dir/SELF_HOSTING.md"
cp -p "$repo_root/deploy/smoke-test.sh" "$package_dir/deploy/"
cp -p "$repo_root/deploy/postgres/init-app-role.sh" "$package_dir/deploy/postgres/"

cat >"$package_dir/verilio.env.example" <<EOF
# Copy to verilio.env in this package directory and configure before startup.
COMPOSE_PROJECT_NAME=verilio
VERILIO_VERSION=$version
VERILIO_API_IMAGE=$api_repository
VERILIO_GATEWAY_IMAGE=$gateway_repository
# Replace once with your own stable owner UUID; preserve across updates/restores.
LOCAL_USER_ID=00000000-0000-4000-8000-000000000001
LOG_LEVEL=info
VERILIO_GATEWAY_PORT=8080
VERILIO_PGDATA_VOLUME=verilio_pgdata
VERILIO_DATABASE_URL_SECRET=./secrets/database_url
VERILIO_POSTGRES_ADMIN_PASSWORD_SECRET=./secrets/postgres_admin_password
VERILIO_POSTGRES_APP_PASSWORD_SECRET=./secrets/postgres_app_password
EOF

echo "$package_dir"

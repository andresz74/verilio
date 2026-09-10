#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
version=${1:-}
output_root=${2:-$repo_root/release}

if [[ ! "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || [[ "$version" == "latest" ]]; then
  echo "Usage: $0 <explicit-version> [output-directory]; 'latest' is not allowed." >&2
  exit 64
fi

docker image inspect \
  "verilio-api:$version" \
  "verilio-gateway:$version" \
  postgres:17.9-alpine >/dev/null

release_dir="$output_root/verilio-$version"
if [[ -e "$release_dir" ]]; then
  echo "Release directory already exists: $release_dir" >&2
  exit 1
fi

install -d "$release_dir/deploy/postgres"

docker save \
  "verilio-api:$version" \
  "verilio-gateway:$version" \
  postgres:17.9-alpine | gzip -9 >"$release_dir/verilio-$version-images.tar.gz"

cp "$repo_root/compose.prod.yml" "$release_dir/"
cp "$repo_root/docs/08-private_alpha_self_hosted_deployment.md" \
  "$release_dir/DEPLOYMENT.md"
cp "$repo_root/deploy/backup.sh" "$release_dir/deploy/"
cp "$repo_root/deploy/restore-drill.sh" "$release_dir/deploy/"
cp "$repo_root/deploy/server-deploy.sh" "$release_dir/deploy/"
cp "$repo_root/deploy/smoke-test.sh" "$release_dir/deploy/"
cp "$repo_root/deploy/verify-data.sh" "$release_dir/deploy/"
cp "$repo_root/deploy/verilio.env.example" "$release_dir/deploy/"
cp "$repo_root/deploy/postgres/init-app-role.sh" "$release_dir/deploy/postgres/"

commit=$(git -C "$repo_root" rev-parse HEAD)
latest_migration=$(basename "$(find "$repo_root/packages/db/migrations" -maxdepth 1 -name '*.sql' | sort | tail -n 1)")
api_image_id=$(docker image inspect --format '{{.Id}}' "verilio-api:$version")
gateway_image_id=$(docker image inspect --format '{{.Id}}' "verilio-gateway:$version")
postgres_image_id=$(docker image inspect --format '{{.Id}}' postgres:17.9-alpine)

cat >"$release_dir/release-manifest.txt" <<EOF
verilio_version=$version
source_commit=$commit
platform=linux/amd64
api_image=verilio-api:$version
api_image_id=$api_image_id
gateway_image=verilio-gateway:$version
gateway_image_id=$gateway_image_id
postgres_image=postgres:17.9-alpine
postgres_image_id=$postgres_image_id
latest_migration=$latest_migration
created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

(
  cd "$release_dir"
  find . -type f ! -name checksums.txt -print0 | sort -z | xargs -0 sha256sum >checksums.txt
)

archive="$output_root/verilio-$version-release.tar.gz"
tar --create --gzip --file "$archive" --directory "$output_root" "verilio-$version"
(
  cd "$output_root"
  sha256sum "$(basename "$archive")" >"$(basename "$archive").sha256"
)

echo "$archive"

#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
version=${1:-}
platform=${VERILIO_PLATFORM:-linux/amd64}

if [[ ! "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || [[ "$version" == "latest" ]]; then
  echo "Usage: $0 <explicit-version>; 'latest' is not allowed." >&2
  exit 64
fi

commit=$(git -C "$repo_root" rev-parse HEAD)

if [[ "${VERILIO_ALLOW_UNRELEASED_BUILD:-false}" != "true" ]]; then
  if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
    echo "Release builds require a clean working tree." >&2
    exit 1
  fi
  if ! git -C "$repo_root" tag --points-at HEAD | grep --fixed-strings --line-regexp --quiet "$version"; then
    echo "Release version '$version' must be a Git tag on the checked-out commit." >&2
    exit 1
  fi
fi

docker buildx build \
  --file "$repo_root/deploy/Dockerfile" \
  --platform "$platform" \
  --target api \
  --build-arg VERILIO_VERSION="$version" \
  --build-arg VCS_REF="$commit" \
  --tag "verilio-api:$version" \
  --load \
  "$repo_root"

docker buildx build \
  --file "$repo_root/deploy/Dockerfile" \
  --platform "$platform" \
  --target gateway \
  --build-arg VERILIO_VERSION="$version" \
  --build-arg VCS_REF="$commit" \
  --tag "verilio-gateway:$version" \
  --load \
  "$repo_root"

docker pull --platform "$platform" postgres:17.9-alpine

echo "Built verilio-api:$version and verilio-gateway:$version for $platform."

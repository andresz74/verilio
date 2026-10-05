#!/usr/bin/env bash
# Shared fail-closed source/contract gate; performs no registry or Docker actions.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
version=${1:-}
fail() { echo "$*" >&2; exit 1; }
if [[ $# != 1 || ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9]+([.-][A-Za-z0-9]+)*)?$ ]]; then
  fail "Usage: $0 <explicit-vX.Y.Z[-prerelease]>; latest, floating aliases and snapshots are forbidden."
fi
[[ "${GITHUB_REPOSITORY:-andresz74/verilio}" == andresz74/verilio ]] || fail 'Only the canonical repository may publish.'
origin=$(git -C "$repo_root" remote get-url origin)
case "$origin" in
  https://github.com/andresz74/verilio|https://github.com/andresz74/verilio.git|git@github.com:andresz74/verilio.git) ;;
  *) fail 'Source origin must be the canonical andresz74/verilio repository.' ;;
esac
status=$(git -C "$repo_root" status --porcelain) || fail 'Cannot establish source cleanliness.'
[[ -z "$status" ]] || fail 'Official publication requires a clean source tree.'
if git -C "$repo_root" symbolic-ref --quiet HEAD >/dev/null; then
  fail 'Official publication requires a detached exact-tag checkout, not a branch.'
else
  [[ $? == 1 ]] || fail 'Cannot establish detached checkout identity.'
fi
commit=$(git -C "$repo_root" rev-parse HEAD)
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || fail 'Expected a full 40-character source SHA.'
tag_commit=$(git -C "$repo_root" rev-parse --verify "refs/tags/$version^{commit}") || fail 'Exact requested Git tag does not exist.'
[[ "$tag_commit" == "$commit" ]] || fail 'Exact requested Git tag must point to HEAD.'
# Validate literal contents before sourcing: no executable assignments/overrides.
expected=$(printf '%s\n' \
  'VERILIO_OFFICIAL_API_IMAGE=ghcr.io/andresz74/verilio-api' \
  'VERILIO_OFFICIAL_GATEWAY_IMAGE=ghcr.io/andresz74/verilio-gateway' \
  'VERILIO_OFFICIAL_PLATFORM=linux/amd64')
[[ "$(cat "$repo_root/deploy/official-images.env")" == "$expected" ]] || fail 'Official image contract must match the exact D03 repositories and linux/amd64 platform.'
printf '%s\n' "$commit"

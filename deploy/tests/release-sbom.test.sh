#!/usr/bin/env bash
# Offline: all Docker/scanner/registry operations are mocks in disposable directories.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
bash -n "$repo_root/deploy/generate-release-sbom.sh"
node --test "$repo_root/deploy/tests/release-sbom.test.mjs"

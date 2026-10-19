#!/usr/bin/env bash
# Standalone sibling signing/ directory required; no Node/pnpm/Docker daemon.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
exec python3 "$root/signing/release_signatures.py" verify "$@"

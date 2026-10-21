#!/usr/bin/env bash
# Metadata only. Official signing is disabled pending separately approved experiments.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
exec python3 "$root/signing/release_signatures.py" sign "$@"

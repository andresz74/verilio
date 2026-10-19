#!/usr/bin/env bash
# No build, login, registry fallback, or publication. Output must not exist.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ $# != 6 || $1 != --qualification || $3 != --output-dir || $5 != --syft ]]; then
  echo "Usage: $0 --qualification <record> --output-dir <new-directory> --syft <pinned-executable>" >&2
  exit 64
fi
node "$repo_root/deploy/release-evidence.mjs" generate "$2" "$4" "$6"

#!/usr/bin/env bash
# Bootstrap the build driver with the locked Imba compiler; generated bootstrap
# code stays in node_modules, alongside the compiler, instead of becoming source.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -x node_modules/.bin/imbac ]] || { echo 'Run npm ci before compiling Imba.' >&2; exit 1; }
DRIVER=node_modules/.cache/ffxiv-imba
mkdir -p "$DRIVER"
node_modules/.bin/imbac --platform node --silent --output "$DRIVER" tools/compile.imba
node "$DRIVER/compile.js" "$@"

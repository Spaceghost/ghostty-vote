#!/usr/bin/env bash
# Reproduce CI exactly, here, in one command:
#
#   tools/ci/local.sh [stage...]     default: all
#
# It is a thin wrapper: the stages, their order and everything they do live in
# tools/ci/run.sh, which is also what GitHub Actions and a self-hosted runner
# call, so there is no second definition of "what CI does" to drift.
#
# The whole run is plain node with no dependencies, so there is nothing to
# containerise and no remote host worth farming it out to; the one thing that
# leaves the machine is deploy-dry's npx fetch of the pinned wrangler (and that
# stage still never authenticates and never deploys). There is deliberately no
# CI_LOCAL_REMOTE -- see docs/CI.md, "Running it locally".
#
# The environment is passed straight through: NODE, WRANGLER_VERSION,
# CI_CACHE_DIR, SKIP_DEPLOY_DRY (documented in tools/ci/run.sh --help and
# docs/CI.md).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

case "${1:-}" in
  -h | --help)
    sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

printf '== local: tools/ci/run.sh %s (in %s)\n' "${*:-all}" "$ROOT"
exec "$ROOT/tools/ci/run.sh" "${@:-all}"

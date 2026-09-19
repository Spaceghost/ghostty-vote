#!/usr/bin/env bash
# The one CI entry point: GitHub Actions, a self-hosted runner and a local shell
# all run this. Nothing else knows how to build, check or test this repository.
#
#   tools/ci/run.sh <stage>...   stages: deps check test build deploy-dry all
#
#   deps        node is present and new enough for `node --test` (>= 20; the
#               version is printed), and npm and npx exist. Nothing is
#               installed: this repository has no dependencies.
#   check       `node scripts/build.js --check` -- the generated files
#               (ideas.json, version.json, seed/seed.sql, src/almanac-schema.js)
#               must already match data/catalogue.json. Then the only lint this
#               repository has: ShellCheck over tools/ci/*.sh and actionlint
#               over .github/workflows/, each skipped with a line saying so when
#               the tool is not installed.
#   test        `node --test` over tests/*.test.js (the D1 shim and the request
#               harness; no network, no Cloudflare, no wrangler).
#   build       `node scripts/build.js` -- regenerates the files `check` verifies.
#   deploy-dry  `wrangler deploy --dry-run --outdir <tmp>`: wrangler parses
#               wrangler.toml, runs the [build] command and bundles the Worker
#               into a temporary directory. It NEVER AUTHENTICATES AND NEVER
#               DEPLOYS -- no API token, no account id and no Cloudflare API
#               call are involved, and nothing about the live Worker, its
#               routes, D1 or KV is touched. It does need the network once, to
#               fetch the pinned wrangler from npm (see WRANGLER_VERSION).
#               If that fetch or the dry run fails for want of network or
#               credentials the stage prints `skipped: needs network/credentials`
#               and succeeds, so an offline runner does not turn red; anything
#               else is a real failure. SKIP_DEPLOY_DRY=1 skips it outright.
#   all         check test build deploy-dry (not deps: the workflows probe for
#               node themselves, and `deps` is what they call to do it).
#
# Configured only by the environment (see docs/CI.md):
#   NODE              node binary, default `node` on PATH. npm and npx are
#                     taken from PATH either way.
#   WRANGLER_VERSION  wrangler for deploy-dry, default the pin below. Pinned so
#                     a CI run is reproducible; `npx wrangler` unpinned would
#                     silently move.
#   CI_CACHE_DIR      npm's cache directory for the npx download,
#                     default ${XDG_CACHE_HOME:-~/.cache}/ghostty-vote-ci.
#                     This is the only thing worth caching in CI.
#   SKIP_DEPLOY_DRY   1 = do not run deploy-dry at all (also skipped inside
#                     `all`), for a runner with no network.
#
# No stage reads a secret, and no stage can change anything on Cloudflare.
# Deploying for real is .github/workflows/deploy.yml, which is separate on purpose.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

NODE="${NODE:-node}"
WRANGLER_VERSION="${WRANGLER_VERSION:-4.135.0}"
CACHE="${CI_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/ghostty-vote-ci}"
# npx downloads wrangler into this cache, so a CI cache of it makes deploy-dry cheap
export npm_config_cache="$CACHE/npm"
export NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

log() { printf '== ci: %s\n' "$*"; }
die() { printf 'ci: error: %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,46p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# node >= 20: `node --test` runs files without a runner and reports non-zero on
# failure, and `--test-reporter` exists. The workflows deliberately do not
# install node, so this is where a too-old runner has to fail loudly.
ensure_node() {
  command -v "$NODE" >/dev/null || die "node is required (NODE=$NODE is not on PATH); install Node.js 20 or newer"
  local ver major
  ver="$("$NODE" --version)" # v26.8.2
  major="${ver#v}"
  major="${major%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] || die "cannot read a major version out of node --version = $ver"
  ((major >= 20)) || die "node $ver is too old: \`node --test\` needs Node.js 20 or newer (install it, or set NODE=/path/to/node20+)"
  log "node $ver ($(command -v "$NODE"))"
}

stage_deps() {
  ensure_node
  # Nothing is installed here. There are no dependencies to install: the only
  # thing CI ever downloads is the pinned wrangler in deploy-dry, through npx.
  command -v npm >/dev/null || die "npm is required (it ships with Node.js)"
  command -v npx >/dev/null || die "npx is required (it ships with npm)"
  log "npm $(npm --version), npx present; no dependencies to install"
}

stage_check() {
  ensure_node
  log "node scripts/build.js --check (generated files match data/catalogue.json)"
  "$NODE" scripts/build.js --check
  if command -v shellcheck >/dev/null; then
    log "shellcheck -x tools/ci/*.sh"
    shellcheck -x tools/ci/*.sh
  else
    log "shellcheck not installed: skipping the shell lint"
  fi
  if command -v actionlint >/dev/null; then
    log "actionlint"
    actionlint
  else
    log "actionlint not installed: skipping the workflow lint"
  fi
}

stage_test() {
  ensure_node
  # --test-reporter has been in node since 19.6, so it is there on every node
  # this script accepts; probed anyway, because being wrong about it would fail
  # the whole stage for a cosmetic flag.
  local reporter=()
  if "$NODE" --test-reporter=dot -e '' >/dev/null 2>&1; then reporter=(--test-reporter=dot); fi
  log "node --test ${reporter[*]:-(default reporter)}"
  "$NODE" "${reporter[@]}" --test
}

stage_build() {
  ensure_node
  log "node scripts/build.js"
  "$NODE" scripts/build.js
}

# Parses wrangler.toml, runs the [build] command and bundles the Worker. It does
# not log in, does not read a token and does not call the Cloudflare API; the
# bundle goes to a temporary directory that is deleted again. CLOUDFLARE_ACCOUNT_ID
# is passed through only if the environment already has one, because a dry run
# has never needed it here -- see docs/CI.md.
stage_deploy_dry() {
  if [[ "${SKIP_DEPLOY_DRY:-0}" == 1 ]]; then
    log "deploy-dry: skipped (SKIP_DEPLOY_DRY=1)"
    return 0
  fi
  ensure_node
  command -v npx >/dev/null || { log "deploy-dry: skipped: needs network/credentials (no npx to fetch wrangler)"; return 0; }
  local out rc=0
  out="$(mktemp -d "${TMPDIR:-/tmp}/ghostty-vote-dryrun.XXXXXX")"
  log "wrangler@$WRANGLER_VERSION deploy --dry-run (no credentials, nothing deployed)"
  npx --yes "wrangler@$WRANGLER_VERSION" deploy --dry-run --outdir "$out" || rc=$?
  rm -rf "$out"
  if ((rc != 0)); then
    # The dry run needs npm once and nothing else. A failure here is almost
    # always a runner with no network (or an npm registry that is down), which
    # must not fail a run that has already checked, tested and built.
    log "deploy-dry: skipped: needs network/credentials (wrangler@$WRANGLER_VERSION dry run exited $rc)"
    return 0
  fi
  log "deploy-dry: the Worker and public/ bundle cleanly"
}

[[ $# -gt 0 ]] || { usage; exit 2; }
for s in "$@"; do
  case "$s" in
    deps | check | test | build | deploy-dry | all) ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; printf 'ci: error: unknown stage: %s\n' "$s" >&2; exit 2 ;;
  esac
done
for s in "$@"; do
  case "$s" in
    deps) stage_deps ;;
    check) stage_check ;;
    test) stage_test ;;
    build) stage_build ;;
    deploy-dry) stage_deploy_dry ;;
    all) stage_check; stage_test; stage_build; stage_deploy_dry ;;
  esac
done
log "done: $*"

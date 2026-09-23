# CI

Checks, tests, the generated-file build and a credential-free wrangler dry run
all come from one script, `tools/ci/run.sh`, whether it is GitHub Actions, a
self-hosted runner or a local shell running it. The workflows only check out the
repository, restore one cache and call it, so there is no second definition of
"what CI does" to drift.

This repository has no dependencies: everything below is plain node plus, for
the dry run only, one pinned wrangler fetched through `npx`.

## What runs where

| Trigger | Workflow | Job | Runs | Output |
| --- | --- | --- | --- | --- |
| push to any branch, pull request, manual | `.github/workflows/ci.yml` | `hosted` | `tools/ci/run.sh all` | artifact `ghostty-vote-public-<sha>` = `public/` (kept 14 days) |
| the same, but never a fork pull request, and only with `CI_SELF_HOSTED=true` | `.github/workflows/ci.yml` | `self-hosted` | node probe, then `tools/ci/run.sh all` | artifact `ghostty-vote-public-self-hosted-<sha>` (kept 14 days) |
| push to `master`, manual; never forks | `.github/workflows/deploy.yml` | `deploy` | `tools/ci/run.sh check test build`, then `wrangler deploy` through the `cloudflare` environment | the live Worker and `public/` on `spacegho.st` |

Changes that touch only Markdown or `docs/` start nothing. A newer push to the
same branch or pull request cancels the older CI run; a deploy is never
cancelled halfway through an upload.

`ci.yml` has `permissions: contents: read`, no secrets and no way to reach
Cloudflare. `deploy.yml` has `contents: read` and exactly one secret, which
lives in the `cloudflare` environment. Third-party actions are pinned by commit
SHA. No workflow uses `pull_request_target`.

**Nothing installs node.** GitHub's `ubuntu-latest` image ships a node far newer
than the 20 this repository needs, so `actions/setup-node` (and another pinned
SHA to keep current) would buy nothing. Instead `tools/ci/run.sh` fails loudly on
a too-old or missing node, and the `self-hosted` job probes for node in its first
step and prints what to install. A green run therefore cannot mean "the tests
were skipped".

## `tools/ci/run.sh`

```sh
tools/ci/run.sh --help          # this table, from the script's own header
tools/ci/run.sh check test      # what a pre-commit pass wants
tools/ci/run.sh all             # check, test, build, deploy-dry
```

| Stage | Does |
| --- | --- |
| `deps` | node is on `PATH` and its major version is >= 20 (printed), and npm and npx exist. Installs nothing -- there is nothing to install |
| `check` | `node scripts/build.js --check`: `ideas.json`, `version.json`, `seed/seed.sql` and `src/almanac-schema.js` must already match `data/catalogue.json`. Then the only lint the repository has -- ShellCheck over `tools/ci/*.sh` and `actionlint` over the workflows -- each skipped with a line saying so when the tool is not installed |
| `test` | `node --test` over `tests/*.test.js` (the D1 shim and the request harness; no network, no Cloudflare, no wrangler). `--test-reporter=dot` when this node accepts it, probed |
| `build` | `node scripts/build.js`: regenerates the files `check` verifies |
| `deploy-dry` | `wrangler deploy --dry-run --outdir <tmp>`: wrangler parses `wrangler.toml`, runs the `[build]` command and bundles the Worker into a temporary directory that is then deleted. **It never authenticates and never deploys** -- no API token, no account id, no Cloudflare API call, and nothing about the live Worker, its routes, D1 or KV is touched. It needs the network once, to fetch the pinned wrangler from npm |
| `all` | `check`, `test`, `build`, `deploy-dry`. Not `deps`: that is what a workflow calls to probe its runner |

An unknown stage, or no stage at all, prints the usage and exits **2**;
`--help` prints it and exits 0.

### `deploy-dry` and being offline

A dry run here needs no account id: `npx wrangler@4.135.0 deploy --dry-run` ran
clean in this checkout with no `CLOUDFLARE_API_TOKEN` and no
`CLOUDFLARE_ACCOUNT_ID` set. If a future wrangler does want one, the stage picks
up `CLOUDFLARE_ACCOUNT_ID` from the environment when it is already there and
otherwise carries on without it.

The one thing the stage cannot do without is the network, for the npm fetch. So
if the fetch or the dry run fails, the stage prints
`skipped: needs network/credentials` and **succeeds**, rather than turning a run
that already checked, tested and built into a red one. The trade-off is
deliberate and worth knowing: on an offline runner this stage proves nothing,
and the only signal is that line in the log. `SKIP_DEPLOY_DRY=1` skips it
outright.

### Environment

Nothing else configures the script.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE` | `node` on `PATH` | node binary. npm and npx come from `PATH` either way |
| `WRANGLER_VERSION` | `4.135.0` | wrangler for `deploy-dry`. Pinned so a run is reproducible; an unpinned `npx wrangler` would silently move under CI |
| `CI_CACHE_DIR` | `${XDG_CACHE_HOME:-~/.cache}/ghostty-vote-ci` | npm's cache directory for the npx download -- the only thing in this repository worth caching |
| `SKIP_DEPLOY_DRY` | unset | `1` = do not run `deploy-dry` at all, including inside `all` |

`ci.yml` caches `~/.cache/ghostty-vote-ci/npm`, keyed on the runner OS and
architecture and the hash of `tools/ci/run.sh` (which holds the wrangler pin),
so bumping the pin starts a fresh cache.

## Running it locally

```sh
tools/ci/local.sh              # all
tools/ci/local.sh check test   # just the cheap stages
```

`tools/ci/local.sh` is a thin wrapper that runs `tools/ci/run.sh` with the same
stages the workflows use, so a local pass and a CI pass are the same thing. The
whole run is plain node, takes seconds, and touches nothing outside the checkout
and the npm cache.

There is **no** `CI_LOCAL_REMOTE`. Running the stages on a separate build host
would mean getting this checkout over there first, and with no git remote (see
below) that is a copy step, a container and a node install to keep current --
all to move a few seconds of `node --test`. It was left out rather than
half-implemented; run it here, or point `CI_RUNS_ON` at a self-hosted runner and
let GitHub do it.

## Choosing the runner

Two repository variables (Settings → Secrets and variables → Actions →
Variables); no YAML change is needed for either.

| Variable | Effect |
| --- | --- |
| `CI_RUNS_ON` | The `hosted` job's runner, as JSON. Unset = GitHub's `ubuntu-latest`. `"ubuntu-24.04"` pins an image; `["self-hosted","Linux","X64","ghostty-vote"]` sends it to a runner carrying all four labels |
| `CI_SELF_HOSTED` | `true` enables the separate `self-hosted` job. Anything else (including unset) skips it, so nobody waits on an offline runner |

```sh
gh variable set CI_SELF_HOSTED --body true
gh variable set CI_RUNS_ON --body '"ubuntu-24.04"'
gh variable delete CI_RUNS_ON       # back to ubuntu-latest
```

The `self-hosted` job runs on `[self-hosted, Linux, X64, ghostty-vote]`; the
label `ghostty-vote` is declared for actionlint in `.github/actionlint.yaml`.

**Why a fork pull request can never reach it.** A self-hosted runner executes
whatever the workflow in the checkout says, and a pull request from a fork can
edit that workflow. The job's `if:` therefore requires
`github.event.pull_request.head.repo.full_name == github.repository` for any
pull request event -- so only a branch of this repository, a push or a manual
dispatch qualifies -- *and* `vars.CI_SELF_HOSTED == 'true'`. Register the runner
**ephemeral** (one job, then it deregisters) and only while you want it working.
Set Settings → Actions → General → *Approval for running fork pull request
workflows* to *Require approval for all external contributors* as well.

## Deploying

`deploy.yml` runs `check test build` and then
`npx --yes wrangler@4.135.0 deploy`, which uploads `public/` as Static Assets and
`src/worker.js` as the script in one deployment, and finally checks that
`GET https://spacegho.st/mods/ffxiv/term/vote/` answers 200 (GET, not `curl -I`:
the Worker answers HEAD on a GET route with 405).

It deliberately does **not** run D1 migrations or the seed. Those are ordered,
occasionally destructive steps run by hand against the live database *before*
deploying -- see README.md, "Deploy".

What it needs, all set by the owner (this is not something CI or an agent can do
for you -- **do not paste a token into a file in this repository**):

1. A GitHub environment named `cloudflare`. The API token exists only there, so
   no other workflow or job can read it, and required reviewers on that
   environment make every deploy wait for a click.
2. `secrets.CLOUDFLARE_API_TOKEN` in that environment: a Cloudflare API token
   that can edit Workers, Workers Routes on the `spacegho.st` zone, and D1.
3. `vars.CLOUDFLARE_ACCOUNT_ID` in that environment.

If either is missing the job fails on its first step with a message naming what
is missing, and nothing is deployed.

```sh
R=Spaceghost/ghostty-vote
ID="$(gh api users/Spaceghost --jq .id)"

# the environment, with yourself as required reviewer and master as the only branch
gh api -X PUT "repos/$R/environments/cloudflare" --input - <<EOF
{"reviewers":[{"type":"User","id":$ID}],
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
gh api -X POST "repos/$R/environments/cloudflare/deployment-branch-policies" -f name=master

# the token, straight from the password manager into GitHub; never through a file
op read 'op://VAULT/ITEM/credential' |
  gh secret set CLOUDFLARE_API_TOKEN --env cloudflare --repo "$R"

gh variable set CLOUDFLARE_ACCOUNT_ID --env cloudflare --repo "$R" --body '<account id>'
```

`deploy.yml`'s fork gate is `github.repository_owner == 'Spaceghost' && !github.event.repository.fork`.
If the repository ever moves to another owner, that string has to move with it or
the job will simply stop running.

## What is and is not verified

Run here, on this workstation, against this checkout (node v26.8.2, ShellCheck
0.11.0, actionlint 1.7.12):

* `shellcheck -x tools/ci/*.sh` -- clean.
* `actionlint` over both workflows -- clean.
* `tools/ci/run.sh --help` -- exits 0; an unknown stage and no arguments both
  exit 2.
* `tools/ci/run.sh check test` -- passed: the generated files were current and
  all `tests/*.test.js` passed.
* `tools/ci/run.sh deploy-dry` -- passed, with **no** Cloudflare credentials in
  the environment: `npx --yes wrangler@4.135.0 deploy --dry-run` read 25 files
  from `public/`, listed the KV, D1 and vars bindings and exited 0 without
  contacting the Cloudflare API.

Not verified, because it can only be verified on GitHub:

* **Neither workflow has ever run.** `actionlint` checks syntax, expressions and
  action references; it does not run anything. The first run on GitHub is their
  test -- including the cache, the artifact upload, and whether `ubuntu-latest`'s
  node really is >= 20 on the day (if it is not, `deps` fails loudly, which is
  the point).
* **No self-hosted runner exists for this repository.** The `self-hosted` job,
  its label `ghostty-vote`, its node probe and its fork gate have never been
  exercised. The fork gate is argued from GitHub's documented `if:` semantics,
  not observed.
* **`deploy.yml` has never deployed anything.** Neither the missing-secret
  failure path nor a real `wrangler deploy` from Actions nor the 200 check has
  been run. The site's live deployments so far were made by hand (README.md,
  "Deploy").
* **There is no git remote.** At the time of writing `git remote -v` in this
  checkout is empty, so nothing here has been pushed and no GitHub repository,
  environment, secret or variable has been created. Every `gh` command above is
  for the owner to run after the remote exists.

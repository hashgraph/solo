---
name: solo-test-release
description: Smoke-test a Solo release candidate before dispatching the release workflow — pack the npm tarball with the exact release packaging code, install it globally in isolation, verify the version, then run a full one-shot network deploy/verify/destroy cycle against the packed CLI in a fully isolated Solo home and Kind cluster, including functional checks that submit a real transaction and confirm it through consensus, mirror node ingestion, and the JSON-RPC relay. Optionally runs a second full pass with the block node enabled (`ONE_SHOT_WITH_BLOCK_NODE=true`) to also prove the consensus -> block node -> mirror node path. Use when the user asks to "test the release", "smoke test before releasing", "verify the release candidate", "sanity check before running the release workflow", or "also test with the block node".
license: Apache-2.0
allowed-tools: Bash, Read
metadata:
  version: "0.4.1"
  domain: release-management
  scope: hiero-ledger/solo
  triggers: test the release, smoke test release, verify release candidate, test before release workflow, pre-release check, test release with block node, include block node in release test
  related-skills: solo-prepare-release
---

# Solo Test Release

Validate that the current checkout would actually work if shipped, by packing it exactly the way
`flow-deploy-release-artifact.yaml` does, installing that tarball globally in an isolated prefix
(not the developer's real global `solo`), and running a real one-shot network deploy against it —
entirely inside a scratch `SOLO_HOME` and a scratch `KUBECONFIG`, so nothing here can touch the
developer's real `~/.solo` state or their real Kubernetes clusters.

This is a **manually-invoked, standalone check**. It does not read or modify `solo-prepare-release`
output, does not compute the next semantic version, and does not dispatch or otherwise touch the
GitHub Actions release workflow. It just answers: "does the package that workflow would build and
publish actually boot a network?"

Run everything from the `solo/` repo root (the directory containing `version.ts`, `package.json`, and
`scripts/Taskfile.release.yml`). Verify with `git rev-parse --show-toplevel` before starting.

## When to use

- The user wants to sanity-check a release candidate (any branch/commit — main, a release PR branch,
  a `chore-prepare-release-*` branch) before someone runs `flow-deploy-release-artifact.yaml`.
- The base flow (Steps 0-9) always runs. If the user additionally asks to test with the block node —
  phrases like "also test with the block node", "include the block node", "test the block node too" —
  also run the **Step 10** variant below, which is a second, independent full deploy/verify/destroy
  pass with `ONE_SHOT_WITH_BLOCK_NODE=true`. Without that ask, do not run it: it roughly doubles total
  wall-clock time and the block node is off by default in a real one-shot deploy too.

Do **not** use for:
- Actually cutting/publishing the release (that's the GitHub Actions workflow).
- Preparing the release PR / README version table (that's `solo-prepare-release`).
- Full regression coverage (that's `task test`, `task test-e2e-standard` / `-integration`, run separately).

## Requirements

Docker/Podman (12 GB RAM, 6 CPU cores), `task`, `kind`, `helm`, `kubectl`, Node.js >= 22 / npm >= 9.8.1.
The deploy step below spins up a real Kind cluster and a full network (consensus, mirror, relay,
explorer nodes; block node only in the Step 10 variant) — expect **20–60+ minutes** wall clock, and
confirm with the user before starting if this hasn't been made explicit already. If the user also
wants the block node variant (Step 10), that is a second full pass of the same duration — confirm it
separately.

## Isolation — why this design, read before running anything

A first-pass version of this skill relied on `--deployment <name>` for isolation and installed the
tarball into the default global npm prefix. Both were insufficient, and running it caused a real
collision on a developer machine. What actually happened, and why the design below fixes it:

- `solo one-shot single deploy` **skips creating its own Kind cluster whenever the current kubectl
  context is already set and reachable** — it doesn't check what that cluster is named or whether it
  has anything to do with Solo (`skipKindSetup()` in `src/core/cluster-task-manager.ts`). On the
  affected machine it silently reused the developer's real, already-active `kind` cluster.
- When it *does* create its own cluster, the name is **hardcoded** to `constants.DEFAULT_CLUSTER`
  (`'solo-cluster'` in `src/core/constants.ts`) — there is no CLI flag to rename it. `--deployment`
  only renames the entry in local config; it does not change the Kubernetes namespace (`one-shot`,
  also hardcoded), the cluster-ref name (`one-shot`, also hardcoded), or which cluster gets used.
- Solo's local state (`local-config.yaml`, logs, cache, downloaded toolchain) lives under `~/.solo`
  regardless of where the CLI binary itself was installed from — installing the tarball into a
  scratch npm prefix does **not** isolate this. The affected run wrote a real, permanent entry into
  the developer's real `~/.solo/local-config.yaml`.
- `one-shot single destroy` **never deletes the underlying Kind cluster** — only the deployed
  resources — so a manually-created test cluster always needs an explicit `kind delete cluster`.

The fix: isolate via two environment variables that Solo already respects, so nothing here can reach
the developer's real state, and so `skipKindSetup()` legitimately finds no active context and creates
its own cluster exactly the way it would for a first-time user:

- **`SOLO_HOME`** — relocates all of Solo's state (config, logs, cache, toolchain) to a scratch
  directory instead of `~/.solo`.
- **`KUBECONFIG`** — points kubectl/kind/Solo's k8s client at a scratch, empty kubeconfig file instead
  of `~/.kube/config`, so there is no "current context" for `skipKindSetup()` to find.

One thing this does **not** fix: the cluster Solo creates is still always named `solo-cluster` at the
Docker/kind level (cluster names are global, independent of `KUBECONFIG`). If the developer already
runs a persistent `solo-cluster` Kind cluster for their own (non-one-shot) Solo work, `kind create
cluster` will fail loudly with "already exists" instead of silently reusing it — which is safe, but
wastes a deploy attempt. **Check for this before starting** (Step 0) so a real conflict is caught and
handed to the user immediately instead of discovered 20 minutes into a deploy.

## Step 0 — Pre-flight

```bash
git rev-parse --show-toplevel   # confirm repo root
kind get clusters 2>/dev/null | grep -Fx "solo-cluster" && echo "COLLISION: a real solo-cluster Kind cluster already exists"
```

If `solo-cluster` already exists, **stop and ask the user** how to proceed (reuse it, ask them to
rename/remove it first, or pick another day) — do not delete it yourself; it may be real work.

**Also check the fixed one-shot host ports are free**, not just the cluster name. One-shot always
publishes `38080` (explorer), `38081` (mirror REST), `37546` (relay), `35211` (consensus gRPC), and
`30004` on the Kind cluster's `extraPortMappings` — these are hardcoded in
`ONE_SHOT_EXPLORER_HOST_PORT` / `ONE_SHOT_MIRROR_REST_HOST_PORT` / `ONE_SHOT_RELAY_HOST_PORT` /
`ONE_SHOT_CONSENSUS_GRPC_HOST_PORT` in `src/core/constants.ts` with no flag or env var to relocate
them, so a collision here cannot be worked around by reconfiguring the test — only by freeing the
port. Confirmed by testing: an unrelated pre-existing `kubectl port-forward` on `38081`/`35211` made
`kind create cluster` fail outright with `address already in use`, discovered only once the real
20+-minute deploy had already started. Check before starting, not after:

```bash
for p in 38080 38081 37546 35211 30004; do
  echo -n "port ${p}: "
  lsof -nP -iTCP:${p} -sTCP:LISTEN 2>/dev/null >/dev/null && echo "IN USE" || echo "free"
done
```

If any port is in use, identify the process (`lsof -nP -iTCP:<port> -sTCP:LISTEN`, then
`ps -p <pid> -o pid,ppid,etime,command`) before touching it — it is very likely the developer's own
unrelated work (e.g. a `kubectl port-forward` to a real deployment), not something this skill created.
**Never kill it without asking the user first.** If it turns out to be a Solo-managed port-forward
(tracked in a real deployment's remote config), prefer `solo deployment port-forwards stop --deployment
<name>` over a raw `kill` — it cleanly deregisters the forward, and the developer can restore it
afterward with `solo deployment port-forwards refresh --deployment <name>`. Figure out `<name>` from
the developer's real `~/.solo/local-config.yaml` (e.g. `grep -B5 <namespace> ~/.solo/local-config.yaml`
to find the deployment name owning that namespace) — do this read-only, against their real config, not
the scratch one from Step 3.

Confirm the required tools are present (`task`, `kind`, `helm`, `kubectl`, `node`, `npm`) and Docker
is running, and confirm with the user that the 20–60+ minute run is acceptable before continuing.

## Step 1 — Pack the release candidate

Use the exact packaging code the release workflow uses for the published artifact (`npm ci`,
`eslint --fix`, `task build`, `npm pack`) — not a manual `npm pack`, so this catches anything that
Taskfile step could break:

```bash
task -t scripts/Taskfile.release.yml pack OUTPUT_DIR=output/release-smoke-test
```

**Verify `dist/` is actually real before trusting the tarball.** `Taskfile.yml`'s `build`/`build:compile`
tasks declare `sources: [src/**/*.ts, ...]` but no `generates:`, so Task's checksum cache can report
`Task "build" is up to date` and skip compiling entirely — even if `dist/` was deleted out-of-band
(e.g. by an earlier cleanup) without `src/` changing. This silently produces a tarball with **zero**
files under `dist/`: no `bin`/`main` entry points at all, a completely non-functional package. This is
not hypothetical — it happened while validating this skill. Confirm before proceeding:

```bash
TARBALL="$(ls output/release-smoke-test/*.tgz | head -n 1)"
tar -tzf "${TARBALL}" | grep -qE '^package/dist/solo\.js$' && tar -tzf "${TARBALL}" | grep -qE '^package/dist/src/index\.js$' \
  && echo "dist/ entry points present" \
  || { echo "BROKEN PACK: dist/ entry points missing — forcing a real rebuild and repacking"; \
       rm -rf dist output/release-smoke-test; \
       task build --force; \
       task -t scripts/Taskfile.release.yml pack OUTPUT_DIR=output/release-smoke-test; }
```

If this triggers, also tell the user afterward — a task caching bug that can silently ship a broken
package is worth fixing in `Taskfile.yml` itself (e.g. adding `generates:` so Task verifies output
existence, not just source checksums), independent of whatever release candidate is being tested.

## Step 2 — Verify version consistency

```bash
bash scripts/verify-package-version-consistency.sh "output/release-smoke-test/*.tgz"
```

This fails loudly if the tarball's root `package.json` version or `dist/package.json` version
disagrees with the top-level `package.json` — the same check `create-github-release` runs before
publish.

## Step 3 — Set up isolation and install the tarball

Create the scratch directories/files up front and record their paths (each Bash tool call is a fresh
shell, so persist these to a small env file and `source` it in every subsequent step instead of
re-deriving them):

```bash
SCRATCH_PREFIX="$(mktemp -d)"      # isolated npm global prefix for the packed CLI
SOLO_HOME_SCRATCH="$(mktemp -d)"   # isolated Solo state (local-config.yaml, logs, cache, toolchain)
KUBECONFIG_SCRATCH="$(mktemp -d)/kubeconfig"  # isolated kubeconfig
cat > /tmp/solo-release-smoke-test-env.sh <<EOF
export SCRATCH_PREFIX="${SCRATCH_PREFIX}"
export SOLO_HOME="${SOLO_HOME_SCRATCH}"
export KUBECONFIG="${KUBECONFIG_SCRATCH}"
EOF

# The kubeconfig FILE must exist and be valid YAML with no current context — a merely
# nonexistent path is not equivalent. Solo's k8s client throws a plain file-load error
# (not MissingActiveContextError) when the file is absent, and skipKindSetup() treats any
# *unrecognized* error as "a cluster already exists", silently skipping cluster creation.
# Confirmed by testing: pointing KUBECONFIG at a nonexistent path made deploy skip both
# "Install Kind" and "Create default cluster" and fail at Initialize instead.
cat > "${KUBECONFIG_SCRATCH}" <<'EOF'
apiVersion: v1
kind: Config
clusters: []
contexts: []
current-context: ""
preferences: {}
users: []
EOF

TARBALL="$(ls output/release-smoke-test/*.tgz | head -n 1)"
npm install -g --prefix "${SCRATCH_PREFIX}" "${TARBALL}"
export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
export SOLO_HOME="${SOLO_HOME_SCRATCH}"
export KUBECONFIG="${KUBECONFIG_SCRATCH}"
solo --version
```

`npm install -g --prefix` puts the global bin shim in a `bin/` subdirectory of the prefix on
macOS/Linux, but directly in the prefix root on Windows — there is no `bin/` subdirectory there at
all. Confirmed by testing on Windows: `${SCRATCH_PREFIX}/bin` alone left `solo` unresolvable on PATH.
Prepending both `${SCRATCH_PREFIX}/bin` and `${SCRATCH_PREFIX}` covers both layouts without needing to
detect the OS — whichever one doesn't exist on a given platform is simply never matched.

Confirm the printed version matches `package.json`'s version. From here on, every `solo`/`kind`/
`kubectl` command in this skill must run with `PATH`, `SOLO_HOME`, and `KUBECONFIG` set from that env
file (`source /tmp/solo-release-smoke-test-env.sh; export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"`).
Also run from a directory **outside** the repo checkout (e.g. `cd "$(mktemp -d)"`) — this mirrors the
CI "global-package" matrix leg and catches any code that resolves bundled resources relative to the
current working directory instead of the installed package.

## Step 4 — Deploy a real network with the packed CLI

```bash
source /tmp/solo-release-smoke-test-env.sh
export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
solo one-shot single deploy --dev
```

With `KUBECONFIG` pointed at an empty scratch file, there is no current context, so this legitimately
creates its own fresh `solo-cluster` Kind cluster (already confirmed non-conflicting in Step 0) with
Solo's normal port-mapping config — no separate `kind create cluster` step is needed. `--dev` surfaces
full error output instead of collapsing it; drop it if the developer prefers the default quieter
output.

## Step 5 — Verify the deployment actually works

```bash
source /tmp/solo-release-smoke-test-env.sh
export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
solo deployment diagnostics connections -d one-shot --check
```

Then poll the mirror node REST API:

```bash
for i in $(seq 1 30); do
  response=$(curl -sf http://localhost:38081/api/v1/accounts 2>/dev/null || true)
  echo "${response}" | grep -q '"accounts"' && { echo "Mirror REST API is up."; break; }
  echo "Attempt ${i}/30: not ready yet, retrying in 10s..."
  sleep 10
done
```

Optionally also check `solo one-shot show accounts` to confirm predefined accounts were created.

## Step 6 — Functional smoke tests: submit real transactions and queries

The checks above only prove the services are reachable — they don't prove a transaction actually
flows through consensus → mirror → relay. This step submits a real transaction and confirms it is
independently observable through every component, using known ports/values from Steps 4-5. All
commands below are exact and validated (run live against a real deployment while writing this step) —
adjust only if a future Solo version changes the CLI output shape.

**Consensus — submit a real transaction:**

```bash
source /tmp/solo-release-smoke-test-env.sh
export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
solo ledger account create --hbar-amount 50 --deployment one-shot
```

Output includes a JSON block — capture the new account id:

```json
{
  "accountId": "0.0.1012",
  "publicKey": "302a300506032b6570...",
  "balance": 50
}
```

```bash
NEW_ACCOUNT_ID="$(solo ledger account create --hbar-amount 50 --deployment one-shot 2>&1 | grep -o '"accountId": "[^"]*"' | head -1 | cut -d'"' -f4)"
echo "Created: ${NEW_ACCOUNT_ID}"
```

**Consensus — query it back:**

```bash
solo ledger account info --account-id "${NEW_ACCOUNT_ID}" --deployment one-shot
```

Confirm the returned `"balance"` is `50` — this proves the consensus node itself accepted and
persisted the transaction (independent of the mirror node).

**Mirror node — confirm ingestion, not just liveness:**

```bash
curl -sf "http://localhost:38081/api/v1/accounts/${NEW_ACCOUNT_ID}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('balance (tinybar):',j.balance.balance);})"
# expect 5000000000 (50 HBAR * 1e8 tinybar/HBAR)

curl -sf "http://localhost:38081/api/v1/transactions?account.id=${NEW_ACCOUNT_ID}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('types:',j.transactions.map(t=>t.name));})"
# expect [ 'CRYPTOCREATEACCOUNT' ]
```

Polling on `/api/v1/accounts` (Step 5) only proves genesis accounts are visible — it does not prove
new transactions actually propagate through the ingestion pipeline. This does.

**JSON-RPC relay — confirm it serves live chain state, not just that the port answers:**

```bash
curl -s -X POST http://localhost:37546 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# expect {"result":"0x12a", ...} — Solo's local network chain id

curl -s -X POST http://localhost:37546 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
# expect a non-error hex result, e.g. {"result":"0x5", ...}

# Balance check against a known predefined ECDSA alias account (from the deploy's "ECDSA Alias
# Accounts" output, e.g. 0.0.1002 -> 0x67d8d32e9bf1a9968a5ff53b87d777aa8ebbee69, funded with
# 1,000,000 HBAR at genesis) — cross-checks the relay's Ethereum-style balance against the
# Hedera-side funding amount, proving relay -> mirror node integration end to end.
curl -s -X POST http://localhost:37546 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x67d8d32e9bf1a9968a5ff53b87d777aa8ebbee69","latest"],"id":1}'
node -e "console.log(BigInt('<paste the 0x... result here>') / (10n**18n), 'HBAR-equivalent')"
# expect 1000000n HBAR-equivalent
```

**Explorer — basic reachability (not a deep check, just confirms the UI serves):**

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:38080/
# expect HTTP 200
```

If any of these fail, treat it the same as a deploy failure — proceed to Step 7 (diagnostics) before
tearing down, and report which specific check failed (consensus write, consensus read, mirror
ingestion, relay chain-state, or explorer reachability) rather than a generic "verification failed".

## Step 7 — On failure, collect diagnostics before tearing down

```bash
source /tmp/solo-release-smoke-test-env.sh
export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
solo deployment diagnostics logs -q --dev || true
```

Report the failure to the user with this output rather than just "it failed" — this is the same
diagnostic the release CI captures on failure.

## Step 8 — Always tear down (success or failure)

```bash
source /tmp/solo-release-smoke-test-env.sh
export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
solo one-shot single destroy --quiet-mode --dev || true
kind delete cluster --name solo-cluster || true
rm -rf output/release-smoke-test "${SCRATCH_PREFIX}" "${SOLO_HOME}" "$(dirname "${KUBECONFIG}")"
rm -f /tmp/solo-release-smoke-test-env.sh
```

Do this even when Step 4, 5, or 6 failed — leaving a half-deployed cluster behind is worse than a failed
smoke test. `kind delete cluster --name solo-cluster` is required even after a successful
`one-shot single destroy` — that command never removes the underlying Kind cluster itself. If any
teardown command fails, tell the user directly (don't silently swallow it) so they can run
`kind delete cluster --name solo-cluster` manually — since everything here lived in scratch
`SOLO_HOME`/`KUBECONFIG`, this never risks the developer's real Solo state or real clusters.

## Step 9 — Report the result

State clearly: pass/fail per check (reachability in Step 5, and each functional check in Step 6 —
consensus write, consensus read, mirror ingestion, relay chain-state, explorer reachability), the
version tested, and the new account id created during Step 6. If it passed, note that this only
proves the packed CLI deploys a *functionally working* network, not that
`flow-deploy-release-artifact.yaml` itself will succeed (that workflow's own `dry-run-enabled` input,
npm/JFrog publish steps, and docs build are still untested by this skill). The user still triggers
that workflow manually.

If Step 10 was also run, report it as its own pass/fail line in the same message (reachability, Block
Nodes count/version, the pod-ready check, and whether Step 6's checks passed under the block-node
deploy) — don't fold it silently into the base-pass result, since it validates a materially different
code path (consensus -> block node -> mirror node, instead of consensus -> mirror node directly).

## Step 10 (optional) — Also test with the block node included

Only run this when the user asked for it (see "When to use"). It is a **second, independent full
pass** — pack/verify-version/install, deploy, verify, functional checks, diagnostics, and teardown —
with one difference: `ONE_SHOT_WITH_BLOCK_NODE=true` exported for the whole run. This flag is read by
`ONE_SHOT_WITH_BLOCK_NODE` in `src/core/constants.ts`, which gates
`DeployArgvBuilders.shouldDeployBlockNode()` — with it unset (the base pass), `one-shot single deploy`
never adds a block node component at all.

Expect another 20-60+ minutes on top of the base pass, and confirm this with the user separately
before starting — the Step 0 confirmation covers only the base run.

Repeat Steps 0 through 8 exactly as written, with these deltas:

- **Step 3**: also append `export ONE_SHOT_WITH_BLOCK_NODE=true` to
  `/tmp/solo-release-smoke-test-env.sh` so every later `source` of that file picks it up, and export
  it in the current shell before Step 4's deploy. If this variant is run back-to-back with the base
  pass in the same session, repeat Steps 1-3 in full rather than reusing the base pass's tarball/
  install — Step 8 of the base pass deletes `output/release-smoke-test` and the scratch install.
- **Step 4**: deploying with the block node enabled can take longer than the base pass — the deploy
  orchestrator gates completion on a `BlockNodeDeployed` event with up to a 10-minute wait on top of
  normal network bring-up, so don't treat a longer Step 4 as a hang on its own.
- **Step 5, additional check** — the reachability checks prove the deploy succeeded, but not that a
  block node was actually created. Confirm the component is present (not `one-shot single info` —
  that subcommand does not exist; the actual command is `one-shot show deployment`, confirmed by
  testing, and it auto-detects the most recent one-shot deployment with no `--deployment`/`-d` flag
  needed):

  ```bash
  source /tmp/solo-release-smoke-test-env.sh
  export PATH="${SCRATCH_PREFIX}/bin:${SCRATCH_PREFIX}:${PATH}"
  solo one-shot show deployment | grep -E "Block Node(s|.*Version):"
  ```

  Expect a `✓ Block Nodes: 1` line and a non-empty `Block Node Version` line. Then confirm the pod
  itself is actually ready, not just registered in remote config:

  ```bash
  kubectl get pods -n one-shot -l "block-node.hiero.com/type=block-node" -o wide
  ```

  Expect exactly one pod, `Running` / `1/1 Ready`.

- **Step 6 still applies, and now proves more**: with the block node enabled, the consensus network's
  block stream is written to the block node instead of being read directly by the mirror node
  importer (wired via the "Copy block-nodes.json" step). So a passing mirror-ingestion check in Step 6
  (the `/api/v1/transactions` and `eth_...` checks) is no longer just proving consensus -> mirror
  connectivity — under this variant it is proving the full consensus -> block node -> mirror node
  path, which is the entire point of running it. No separate transaction needs to be submitted
  specifically "through" the block node; Step 6's existing transaction already routes through it.
- **Step 7**: `solo deployment diagnostics logs` already understands block node logs
  (`blocknode-<n>.log`) and already suppresses known-transient block-node read retries (the mirror
  importer retrying a block read while the block node catches up, which a later successful read
  proves recovered). A genuine, persistent block-node failure still surfaces as a finding — treat it
  as a real failure, the same as any other component's.
- **Step 8**: identical — `one-shot single destroy` already tears down the block node component when
  the remote config shows `components.state.blockNodes.length > 0`, and `kind delete cluster --name
  solo-cluster` still applies regardless of which components were deployed.

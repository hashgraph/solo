# Solo TCK — Design

**Status:** Draft, aligned to Keith's PRD v0.2 (Notion — **not mirrored into GitHub**) ·
[roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) · **Related:**
[#4269](https://github.com/hiero-ledger/solo/issues/4269) (`--edge`),
[#5021](https://github.com/hiero-ledger/solo/issues/5021) (local component build)

> **Source inputs.** The PRD lives in Notion and roadmap#199 is not readable by everyone reviewing this
> document, yet §3 turns on both. The requirements they impose — G1's 15–30 min budget, the version-resolution
> model, the JDK axis — are restated inline here and must be mirrored into #4272 so §3 can be reviewed without
> Notion access (TCK-D0).

> **Freshness.** Component-by-component facts (§2, §3, §4) were checked against `solo@main` on **2026-10-12**
> and against the consumer repos the same day. They move fast; re-verify before quoting them elsewhere.

## 1. Scope

A versioned compatibility kit, owned by the Solo team, answering one question about a candidate component
build: _does it deploy cleanly via a supported Solo release and produce a functional network?_ It runs in
each consumer's CI against their **branch build** — at PR time where that team already runs Solo per PR,
otherwise on their existing schedule. It is an additional gate, not a replacement for a consumer's existing
Solo tests.

| Axis             | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **Consumers**    | CN, Mirror Node, Block Node, JSON-RPC Relay, JS SDK, Solo itself                          |
| **In scope**     | Explorer **server API** as a verification channel inside `standard` (§7) — not a consumer |
| **Out of scope** | Perf/longevity (SDPT/SDLT/MDLT stay put; memory smoke in scope, §7); Explorer **UI**      |

**Explorer is a channel, not a component.** The "server API" is the proxied `/api/v1/...` route the Explorer
serves in front of Mirror Node, and `test/e2e/commands/tests/explorer-test.ts:81` already probes it. It
therefore needs one assertion inside the `standard` suite, no `component` value in §4, and no new Explorer
CI. Explorer _is_ still deployed and version-resolved like any other component; it is simply never the
candidate in v1.

**Where the gate blocks (TCK-D6).** Epic #4272 asks for a required PR check on every component, but two
consumers run Solo only on a schedule, and a 3-hourly cron blocks nothing. v1 therefore gates at PR time for
Mirror Node, Relay and the JS SDK, and lands as an additive scheduled job for CN and Block Node, with the PR
gate for those two tracked as its own issue and negotiated per team. This is closer than the schedules
suggest: Block Node's `k6-tests.yml` already runs on `pull_request` and installs Solo, and CN's
`001-user-dry-run-extended-test-suite.yaml` can run its Solo panels against any ref. Recording this as a
decision, rather than leaving TCK-7/TCK-9 to pass with a cron, is the point.

Solo's contract — chart structure, config keys, labels, Helm-values schema, image entrypoints, env vars,
CLI behaviour — is **implicit**. Until it is written (TCK-D4) this is an integration gate, not a TCK.

## 2. Architecture

```text
Component CI ─► build candidate ─► load into Kind ─► invoke the kit (§4)
        ▼
Solo TCK runner (Mocha + TypeScript)
  ├─ Solo adapter ─────► subprocess('solo', argv)
  └─ Probe layer ──────► kubectl + mirror REST + JSON-RPC + SDK HCS
```

**Candidate build — largely solved, and no longer the gating dependency.** On `main`, every component can
already be deployed from a branch build; what differs is the artifact:

| Component   | Mechanism on `main`                                                             | Gap                                        |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Mirror node | `--component-image` / `--component-image-archive` (+ `--mirror-node-chart-dir`) | —                                          |
| Relay       | `--component-image` / `--component-image-archive` (+ `--relay-chart-dir`)       | consumer builds no image per PR today (§4) |
| Explorer    | `--component-image` / `--component-image-archive` (+ `--explorer-chart-dir`)    | —                                          |
| Block node  | `--component-image` / `--component-image-archive` (+ `--block-node-chart-dir`)  | not wired into `block node upgrade`        |
| Consensus   | `--local-build-path` (the platform build, side-loaded)                          | provenance only — see below                |

**The consensus node has no vendor image to swap, by design.** The CN pod runs an image _we_ own —
`ghcr.io/hiero-ledger/solo-containers/debian-s6-java25`, built in
[hiero-ledger/solo-containers](https://github.com/hiero-ledger/solo-containers) and pinned by
`SOLO_CONTAINERS_VERSION` in `version.ts` — and the consensus node itself arrives as the platform build copied
into that container. So `--local-build-path` _is_ the CN candidate mechanism, not a stopgap for a missing one,
and "CN lacks an image swap" is the wrong way to describe it.

That also means CN carries **three** candidate axes, all independently able to break a deploy, and the kit
should be able to take any of them as the candidate:

1. the **platform build** (`--local-build-path`, or `--consensus-node-version` for a release),
2. the **runtime container** from `solo-containers` (`SOLO_CONTAINERS_VERSION`),
3. the **chart**, `solo-deployment` in [hiero-ledger/solo-charts](https://github.com/hiero-ledger/solo-charts)
   (`SOLO_CHART_VERSION`, overridable with `--chart-dir`), which also pins the sidecars — cheetah, HAProxy,
   Envoy, backup-uploader, Grafana Alloy.

Axes 2 and 3 are Solo-owned, so a break there is a `solo-defect` (§6) by construction, and they are exactly the
changes no consumer's CI would ever catch. They belong in the nightly tuple even though no external team
triggers them.

`#5021` is four-fifths closed (#4473, #5938, #5940, #5856 merged; only
[#5939](https://github.com/hiero-ledger/solo/issues/5939) — images beyond a single Kind cluster — is open), and
Mirror Node already deploys its branch build through Solo on every PR
(`.github/actions/run-e2e/action.yml`). What remains is narrower than "branch builds are not deployable":

1. `one-shot` accepts no `--component-image`, so the kit's simplest entry point cannot carry a candidate.
2. `block node upgrade` does not accept it either.
3. **Nothing records which image or build a run actually deployed** — the provenance gap that makes a green run
   unfalsifiable (see §3's resolved-tuple requirement). This is the one gap that applies to CN too.
4. **No local image registry.** `--component-image` already accepts a Kind-attached registry reference
   (`localhost:5001/component:1.2.3`), but Solo never stands one up, so a locally built image lives and dies
   inside one Kind cluster — which is #5939, and the piece that lets one built image serve several clusters or
   jobs. The kit depends on it for any multi-cluster topology.
5. The end-state per-component build actions do not exist: `hiero-ledger/solo-build-actions`
   ([TSC#298](https://github.com/hiero-ledger/tsc/issues/298)) was created but is still empty (README +
   `.gitignore`, last pushed 2026-09-08). The registry in (4) is the natural companion to those actions: build
   once, push to the local registry, deploy by reference.

**`candidate` is not one shape.** A platform build directory, a runtime image, or a chart directory for CN; an
image reference — optionally with a chart directory — for the rest. §4's input must be typed per component
rather than as a single string.

**The JS SDK does not fit this flow at all.** Solo never deploys the SDK as an image, so a candidate SDK has
to be exercised two ways, and both belong in the plan:

- **SDK as client** — run the kit's probe transactions (transfer, HCS, mirror and JSON-RPC queries) with the
  candidate SDK against a network Solo deployed. Needs no branch-build machinery at all, which is why it is
  the cheapest first pilot.
- **SDK inside Solo** — inject the candidate into Solo itself (Solo pins `@hiero-ledger/sdk` in
  `package.json`; an npm `overrides` entry or an installed tarball is the npm equivalent of the image swap)
  and run the normal suites. This is where an SDK change actually breaks Solo — account creation, key
  updates, node operations — and it needs its own mechanism.

**Black-box boundary.** What the kit _asserts_ must be observable without Solo internals; only the
distributed entry point (§4) must be out-of-process. In-repo suites may keep invoking `main(argv)`
in-process — a blanket port would forfeit the coverage `zxc-code-analysis.yaml`, c8, CodeCov and Codacy
depend on, across ~100 call sites, half of which use the typed Kubernetes client or test Solo libraries with
no CLI surface. **Decision: recreate suites against the observable contract, scoped narrowly.** The kit
reuses the repo's fixtures, helpers and CI plumbing — that is what living in the Solo repo buys (TCK-D2) —
but not Solo's own imports.

**Verification.** Never trust Solo's own success message — assert through Kubernetes state, mirror REST,
JSON-RPC and an HCS smoke transaction. Pod-readiness alone false-passes on an undersized PVC
([#5875](https://github.com/hiero-ledger/solo/issues/5875)).

## 3. Version resolution — OPEN (PRD vs roadmap#199)

The candidate is the branch build; what the _other_ components use is unresolved. **PRD:** latest-stable, or
hybrid (candidate provided, others latest-stable but overridable), `--edge` an open sub-question.
**roadmap#199:** external pinned-tuple manifests (mainnet/testnet). TCK-D1 recommends **hybrid for PR-time +
a pinned tuple for release/nightly**, and that pairing should be adopted as the default rather than left as a
recommendation. Three constraints on whatever is chosen:

1. **Not "profiles"** — `ProfileManager`, `--profile`/`--profile-file` and `test/data/test-profiles.yaml`
   already mean _resource-sizing presets_. Use **compatibility manifest** / **version tuple**.
2. **Unify the precedence order across entry points.** One-shot already defines one, in
   `DeployArgvBuilders.resolveComponentVersion` (`src/commands/one-shot/orchestrator/deploy/deploy-argv-builders.ts`):
   CLI flag → `solo.config.yaml` → `--edge` → `version.ts` (itself env-overridable), with a Falcon
   `--values-file` section overriding all of them. The step-by-step commands (`mirror node add`, …) honour
   neither `solo.config.yaml` nor `--edge`, so the same tuple deploys differently depending on how the kit
   invokes Solo. Pick one order and apply it to both paths.
3. **Emit the _resolved_ tuple.** `--edge` resolution calls the GitHub releases API unauthenticated
   (`DeployArgvBuilders.fetchLatestStableReleaseTag`) and silently returns the static pin on any non-OK
   response, so a rate-limited runner tests a different tuple than intended with nothing recording it. The
   remote-config ConfigMap does carry component versions (`RemoteConfigSchema.versions`) but **not** the image
   or local build a run used, which is the provenance gap in §2. Note `edge-version-fetcher.ts` is a second,
   **dead** copy of this logic — reachable only from the uncalled private
   `DefaultOneShot.resolveOneShotComponentVersions` — and should be deleted or made the single implementation
   before the kit depends on either.

Bounded by the support window in [#3608](https://github.com/hiero-ledger/solo/issues/3608): two quarters,
≈ six CN versions as of 2026-10-12. Versions inject as CLI flags (preferred) with env fallback:

| Component      | CLI flag                   | Env var                  | `version.ts` constant           |
| -------------- | -------------------------- | ------------------------ | ------------------------------- |
| Consensus node | `--consensus-node-version` | `CONSENSUS_NODE_VERSION` | `HEDERA_PLATFORM_VERSION`       |
| Mirror node    | `--mirror-node-version`    | `MIRROR_NODE_VERSION`    | `MIRROR_NODE_VERSION`           |
| Relay          | `--relay-version`          | `RELAY_VERSION`          | `HEDERA_JSON_RPC_RELAY_VERSION` |
| Block node     | `--block-node-version`     | `BLOCK_NODE_VERSION`     | `BLOCK_NODE_VERSION`            |

Two further axes belong in the tuple even though no consumer sets them, because both are Solo-owned and both
ship inside every deploy: the `solo-deployment` chart (`--chart-dir`, `SOLO_CHART_VERSION`) and the runtime
container from `solo-containers` (`SOLO_CONTAINERS_VERSION`), which the chart pins alongside its sidecars.
A nightly tuple that records the component versions but not these two cannot explain a regression caused by
either.

**Interdependency gating (TCK-D5).** _"CN X requires BN Y"_ belongs inside Solo, not the kit. One real gate
exists — `BlockNodeCommand.assertBlockProofCompatibility` (`src/commands/block-node.ts:503`) checks a CN and a
BN version together — but it is enforcement-only and reachable only by deploying, and the remaining gates are
unary and scattered across five files. So nothing can ask _"is this tuple valid?"_ ahead of time, and
unaddressed the burden falls back on the kit. In-repo template: `component-upgrade-rules.ts` +
`resources/component-upgrade-migrations.json` → a sibling `component-compatibility.json` evaluated against the
resolved tuple before deploy, with `assertBlockProofCompatibility` as the first rule migrated into it.

## 4. Interface

| Trigger                     | Where         | Candidate                    | Purpose                                 |
| --------------------------- | ------------- | ---------------------------- | --------------------------------------- |
| **Consumer gate** (primary) | consumer's CI | the branch build             | gate a component change on Solo compat  |
| **Solo PR**                 | Solo CI       | supported component versions | gate a Solo change on component compat  |
| **Release / nightly tuple** | Solo CI       | a pinned tuple               | roadmap#199 release signal (pending §3) |

| Caller input             | Required | Meaning                                                                                                      |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `component`              | yes      | `consensus-node` \| `mirror-node` \| `block-node` \| `relay` \| `js-sdk`                                     |
| `candidate`              | yes      | platform build, runtime image or chart dir (CN); image ref (+ optional chart dir) for the rest; or a version |
| `solo-version`           | no       | a published Solo version **or** a Solo branch build, inside the kit's range                                  |
| `topology`               | no       | which topology suite(s) to run                                                                               |
| `scope`                  | no       | `pr-core` \| `extended` \| `nightly` — the §6 tiers                                                          |
| `non-candidate-versions` | no       | override for the other components; default per §3                                                            |
| `expected-solo-break`    | no       | a Solo issue URL declaring an intentional break up front (§6)                                                |

**No sixth Solo pin (TCK-D3).** The kit accepts the caller's Solo version. Consumers already pin Solo five
ways — CN `.citr-env` v0.87.1, MN `v0.88.1`, BN input default `0.88.1`, Relay on the deprecated
`@hashgraph/solo@0.85.0`, `hiero-solo-action` default `0.88.0`. Two of those pins are on borrowed time: the
deprecated `@hashgraph/solo` package is no longer published as of
[#6150](https://github.com/hiero-ledger/solo/pull/6150), and Block Node's `k6-tests.yml` installs from it too,
so both break at their next bump regardless of the kit.

**Each kit release declares the Solo range it drives.** The kit is a `solo` CLI caller and the CLI moves under
it: `--component-image` and `--component-image-archive` are recent additions, and four flags the kit might
reach for are slated for removal ([#5385](https://github.com/hiero-ledger/solo/issues/5385)–
[#5388](https://github.com/hiero-ledger/solo/issues/5388)). A kit version therefore publishes a supported Solo
range, checks `solo --version` against it before deploying anything, and fails with that range named — rather
than failing somewhere inside a suite on an unknown flag.

## 5. Distribution

1. **Versioned composite Action** — the org's existing pattern via `hiero-solo-action`, shipped as a
   subdirectory action behind a stub root `action.yml` per TSC#298. **This is the v1 deliverable.**
2. **Docker image — deferred past v1.** The kit must not nest Solo inside a CI container (the runner already
   stacks runner → Kind → component containers; Solo in a container makes four levels). That leaves an image
   that contains only the runner and reaches a Kind cluster and Docker daemon on the host, which is a thin
   wrapper around the composite action with a non-trivial socket/kubeconfig contract. Ship it only if a
   consumer asks for a CI-independent entry point, and specify that contract when they do.
3. **Cross-repo reusable workflow** — optional later enhancement (TCK-6a). No hiero-ledger repo uses one
   today, so Actions-policy and token scope are unknowns; a POC is the first step
   ([community discussion](https://github.com/orgs/community/discussions/175466#discussioncomment-14564408)).

Released on its own tags, independent of the Solo release carrying it (TCK-D2). Tags are repo-wide, so the kit
needs its own prefix (e.g. `tck-v*`) that Solo's `semantic-release` configuration ignores; `.releaserc`
currently assumes it owns the tag namespace.

## 6. Run contract

A fail assigns a **class**, not fault — an intentional component change may legitimately require Solo to
adapt:

| Class                      | Meaning                                     | Gates |
| -------------------------- | ------------------------------------------- | ----- |
| `component-non-conformant` | the candidate violates the contract         | yes   |
| `solo-defect`              | Solo cannot yet support a legitimate change | no    |
| `infrastructure`           | cluster/runner/network flake                | no    |

**How the class is assigned.** Not by heuristic, and not by a human after the fact — either would make the
gate decorative. The rule is the contract (TCK-D4): a failing assertion that cites a contract clause is
`component-non-conformant`; a failure in behaviour the contract does not cover is a `solo-defect`; a failure
before any assertion runs (cluster, image pull, runner) is `infrastructure`. A suite that cannot name the
clause it verifies cannot block a consumer's PR, which is the forcing function behind TCK-D4's "every pr-core
suite cites its clause".

**A `solo-defect` must reach the Solo team.** It does not block the consumer, so by default its only trace is
a CI run in a repo nobody on this side watches, and we would learn about it when the nightly tuple picks up
the released component — too late. The kit therefore opens (or updates, deduplicated on component + candidate
version) an issue in `hiero-ledger/solo` carrying the failing check and a log link, and the triage target is
that the fix lands before that component version enters the #3608 support window. A consumer who knows they
are breaking Solo passes `expected-solo-break` (§4) with the issue URL instead, so the declaration is an input
rather than something the kit infers.

**Planned breaks.** When a component intentionally breaks Solo, the sequence is: flagged `solo-defect` →
Solo fix → Solo release → consumer bumps `solo-version`. Because the kit runs against a _published_ Solo, the
consumer is otherwise exposed for at least one Solo release cycle; `solo-version` accepting a Solo branch
build (§4) is what closes that window, and consumers should be told that explicitly rather than discovering
it.

**Skips are declared, never inferred.** `hiero-sdk-tck` can skip because the SDK under test reports
`NOT_IMPLEMENTED` itself; a CN/MN/BN/Relay image reports nothing. If the kit inferred a skip from a runtime
error, a real regression would present as partial conformance and the gate would pass. So a skip comes only
from a version table the kit evaluates **before** deploying — "this suite requires CN ≥ X" — and every skipped
suite is listed in the verdict, with a run that skipped a pr-core suite never counting as a full pass.

Emit the verdict via a `--output json` mode on `DiagnosticsFinding` (`src/commands/util/diagnostics-finding.ts`),
which is already most of this schema but markdown-only. The false positives that blocked this
([#5203](https://github.com/hiero-ledger/solo/issues/5203),
[#5914](https://github.com/hiero-ledger/solo/issues/5914)) are both fixed, so this is now unblocked work.

**Published record (TCK-13).** A git-tracked entry per `(Solo version, resolved tuple, kit version, date,
verdict)`, modelled on `cncf/k8s-conformance`. Today's only published claim is the README "Current Releases"
table — a Consensus Node column, scraped by literal string.

## 7. Suites and budget

**Budget: 15–30 min per invocation** (PRD G1), measured **wall-clock from the consumer's job start**:
candidate build, cluster setup and teardown included, because that is the number the consumer's PR waits on.
`pr-core` alone is ~20 min today, which leaves the candidate build inside the budget only for components that
already build an image for other reasons — a constraint on the suite list below, not an afterthought. Tiers
still to reconcile with block-node's `single` / `paired-3` / `7cn-3bn-distributed`:

| Topology                       | Tier     | ~Runtime | Gates                                                                              |
| ------------------------------ | -------- | -------- | ---------------------------------------------------------------------------------- |
| `single`                       | pr-core  | ~5 min   | single-node bring-up + transfer smoke                                              |
| `standard`                     | pr-core  | ~15 min  | multi-node + MN + Relay; HCS → mirror catchup → JSON-RPC; Explorer `/api/v1` probe |
| `block-node`                   | extended | ~15 min  | block node attached, BLOCK stream                                                  |
| `node-upgrade`                 | extended | ~10 min  | prior-stable CN → candidate                                                        |
| `dual-cluster` / `external-db` | nightly  | ~30 min  | multi-cluster shard/realm; external Postgres                                       |

Suites are ranked against `version.ts`'s `MINIMUM_*` constants and the component issue history (TCK-2),
which set four requirements on the list:

- **Deploy-and-assert-healthy for MN**, the most frequent breaker.
- **Pod-readiness coverage for Explorer and Relay**, which have no `MINIMUM_*` gates — cheap, not deep.
- **At least one CN+MN and one CN+BN suite.** Cross-component is the highest-value category and no
  single-component suite covers it.
- **A canary per suite.** A canary is an assertion the suite is _required to fail_ — a deliberately invalid
  input (a bogus image tag, a malformed config key) run alongside the real cases. If it passes, the suite has
  stopped asserting and the run is reported as `infrastructure`, not as a pass. Without one, a suite that
  silently degrades into "deploy and exit 0" looks identical to a healthy one.

**Mini-performance check (TCK-5) — `extended`, not `pr-core`.** Reuse the existing perf suite's load types at
~1 min each. Fixed overheads dominate at that length (60 s importer warmup, 30 s cooldown, ~35 s RTT probe)
and the 3000 MB gate is calibrated on _sustained_ load, so report it as evidence the load path works, not a
TPS/latency signal. It does not fit inside a 15-minute PR budget, which is why it sits in `extended` even
though the epic lists it under the PR check — a deviation to confirm with Keith.

## 8. Blocking opens

1. **Version-resolution model** (§3) — reconcile PRD vs roadmap#199 with Keith/leadership first.
2. **The Solo Deployment Contract does not exist** (§1, TCK-D4) — prerequisite to the name, and now also the
   rule that assigns failure classes (§6).
3. **Solo cannot express cross-component constraints** (§3, TCK-D5) — net-new work, with
   `assertBlockProofCompatibility` as the starting point.
4. **Candidate-build gaps** (§2) — `--component-image` on `one-shot` and `block node upgrade`, a record of
   which image or build a run deployed, and a local image registry (#5939) so a built image outlives one Kind
   cluster. Narrow and parallelisable; **no longer gates TCK-1.**
5. **`hiero-solo-action` ownership** — maintained outside the core Solo CI group; confirm write access
   before the design's assumption that we update it.
6. **JDK axis** — chartered by roadmap#199, but Solo has no flag for it; needs an owner or a v1 exclusion.

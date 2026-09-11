# Solo TCK — Compatibility Kit Design

**Status:** Draft (aligned to Keith's PRD v0.2)
**Upstream sources:** [Keith's Solo TCK PRD](https://www.notion.so/) (v0.2) · [hiero-ledger/roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) · **Related:** [#4269](https://github.com/hiero-ledger/solo/issues/4269) (`--edge`), [#5021](https://github.com/hiero-ledger/solo/issues/5021) (local component build)

> This design defers to Keith's PRD where they differ. It translates the PRD into a Solo-side plan and
> records the open questions the PRD leaves for the design phase. One material discrepancy between the
> PRD and roadmap#199 (the version-resolution model) is flagged in §6 for leadership to settle.

## Table of contents

- [1. Summary](#1-summary)
- [2. Motivation — test-ownership inversion](#2-motivation--test-ownership-inversion)
- [3. What it is — and is not](#3-what-it-is--and-is-not)
- [4. Consumers](#4-consumers)
- [5. Current state](#5-current-state)
- [6. Architecture](#6-architecture)
- [7. The compatibility run contract](#7-the-compatibility-run-contract)
- [8. Time budget](#8-time-budget)
- [9. Mini-performance check](#9-mini-performance-check)
- [10. Open questions](#10-open-questions)
- [11. References](#11-references)

## 1. Summary

The Solo TCK is a **versioned, black-box compatibility kit owned by the Solo team**. It answers one
question for a candidate Hiero component build (or JS SDK release):

> *Does this candidate deploy cleanly via a supported Solo release and produce a functional Hiero
> network?*

It runs **at PR time inside each component's own CI**, against that component's **branch build**, and
returns a single pass/fail signal — replacing the inlined, version-branched Solo orchestration each
component maintains today. It drives Solo purely as a **black box** (the `solo` CLI as a subprocess
plus observable outputs — Kubernetes resources, mirror REST, JSON-RPC), so it sees Solo the way a real
user does and never links to Solo internals.

Covered consumers: **Consensus Node (CN), Mirror Node (MN), Block Node (BN), JSON-RPC Relay**, the
**Hiero JS SDK** Solo depends on, and **Solo itself**. In return, Solo's own CI shrinks toward pure
Solo mechanics because cross-version regressions are caught upstream at component PR time.

## 2. Motivation — test-ownership inversion

**Solo compatibility is tested too late.** Solo's CI catches regressions from *Solo* PRs, but
components get no Solo-owned compatibility signal on *their* PRs. A component PR that breaks Solo's
deployment contract (a chart change, a config-key rename, a missing label, a Helm-values schema break)
can pass its own CI, merge, and ship — Solo discovers it later when bumping the pin. The signal sits in
the wrong repo at the wrong time.

**Solo's tests are overloaded with component functionality.** Because Solo is the only place these
regressions surface, its per-PR matrix has accumulated e2e variants that are really *component*
coverage in disguise (block-node attach, mirror external DB, node-upgrade across CN tags, dual-cluster
shard/realm, stream variants).

The goal is a **test-ownership inversion**: components own their Solo-integration tests via the TCK at
*their* PR time; Solo's own tests shrink to pure Solo mechanics (bring-up, memory footprint, CLI
parsing, Helm value injection, multi-cluster lease coordination).

**Release-gate angle (roadmap#199).** Separately, roadmap#199 wants each Solo *release* validated
against a known-good component tuple so a release can be cut with a machine-verifiable signal. That is
a compatible, complementary trigger over the same kit (§6.4) — but note the version-resolution
discrepancy called out in §6.3.

## 3. What it is — and is not

A **TCK** is a test suite that verifies a candidate build satisfies a defined compatibility contract
(see the [general definition](https://grokipedia.com/page/Technology_Compatibility_Kit)). The Solo
compatibility contract is the implicit interface between Solo and a component: chart structure, config
keys, labels, Helm-values schema, image entrypoints, expected env vars, CLI behavior.

- It is **black-box**: it exercises Solo only through the CLI and observable outputs, decoupled from
  Solo's DI container and internal `K8Factory`.
- It is **not** Solo's existing in-process e2e suite relabeled — it drives `solo` as a subprocess and
  is versioned and shipped independently of Solo's release cadence.

**Non-goals (from the PRD):**

- **Not** a full performance / longevity suite (SDPT/SDLT/MDLT stay put); a lightweight memory-footprint
  smoke (~5–15 min) is in scope (§9).
- **Not** a replacement for Solo's own unit/integration tests.
- **Not** a workload generator (NLG/chewie stay out).
- **Not** a coverage layer for the **Hiero Explorer UI** — a UI-only repo with no Solo/Kubernetes in CI;
  adding a dedicated TCK job there is negligible gain. However, Explorer's **server API is in scope** as a
  verification channel: where Explorer is deployed, the TCK hits its REST endpoints to confirm Explorer is
  connecting correctly to the mirror node. *(This reverses the earlier draft, which treated the Explorer UI
  as a first-class target.)*

## 4. Consumers

The TCK protects each consumer from a set of compatibility risks:

- **hiero-consensus-node**
  - the default settings that CN ships with do not break the ability to deploy or operate the network
  - new requirements shipping before Solo is enhanced with those requirements
  - new requirements that break older CN versions, properly version gated in Solo
  - deprecated/old settings that cause errors — should be ignored, version gated, with updates to Solo
  - new CN configurations that must integrate correctly, added to Solo and version gated
  - increased memory/cpu footprint requirements
- **hiero-mirror-node**
  - breaking existing Solo MN configuration defaults when enhancements are made
  - MN version dependency without Solo version gates
  - Solo defaults need to be adjusted
  - increased memory/cpu footprint requirements
- **hiero-block-node**
  - breaking with older versions of BN — Solo may need version gate logic and proper version collision handling
  - requiring new BN configurations as the Solo defaults
  - increased memory/cpu footprint requirements
- **hiero-json-rpc-relay**
  - a Relay PR breaking Solo deployment for JSON-RPC consumers
- **Hiero JS SDK** (a library Solo depends on, not a deployed component)
  - deprecated calls being removed but not updated in Solo
  - call signature changes
  - connection changes
- **hiero-ledger/solo (self)**
  - a Solo PR breaking compatibility with currently supported component versions

## 5. Current state

The kit is largely **extraction and decoupling**, not greenfield authoring:

- Solo already has a mature e2e framework in `test/e2e` with reusable command wrappers (`InitTest`,
  `ConsensusNodeTest`, `MirrorNodeTest`, `BlockNodeTest`, `RelayTest`, …), composed topology suites, and
  runtime smoke that already submits HCS transactions via `@hiero-ledger/sdk`. The work is to drive these
  through a **subprocess** `solo` instead of in-process `main(argv)`, and to replace the DI container /
  `K8Factory` with shell-out `kubectl` + direct HTTP probes.
- **`hiero-solo-action`** is the existing minimal "stand up a Solo network" primitive; the TCK is the
  *assertion layer on top* of bring-up, not a replacement.
- Today, inlined Solo CLI orchestration and version-branched CLI workarounds are duplicated across CN,
  MN, BN, and Relay workflows; each pins a different Solo version by hand. The TCK can absorb this
  shared bring-up — but it **augments rather than replaces** each consumer's existing tests, which
  cover behavior outside the TCK's scope.
- Solo's current per-PR matrix (`e2e-test-matrix.json`, ~12 suites, ~80+ min wall-clock) is the pool
  that shrinks as coverage moves upstream.

## 6. Architecture

### 6.1 Black-box subprocess model

```text
Component CI (CN / MN / BN / Relay / SDK / Solo PR)
  1. Build candidate images → kind load
  2. Invoke the Solo TCK (see §6.5) with: solo-version, candidate build, topology
        │
        ▼
Solo TCK runner (Mocha + TypeScript)
  ├─ Topology suites
  ├─ Solo adapter ─────► subprocess('solo', argv)      (black box; CLI only)
  └─ Probe layer ──────► kubectl + mirror REST + JSON-RPC + SDK HCS
        │
        ▼
  JUnit XML + mochawesome + exit code
```

**Building the candidate (step 1).** The end-state flow uses per-component build actions consolidated
into a **single new repo** — planned name `solo-build-actions` (governance-approved; maintainers
nathanklick / jeromy-cannon / jan-milenkov). It replaces the five separate `solo-build-*-action` repos
originally floated. A component PR calls the matching action, which builds the branch image and feeds
`hiero-solo-action` (which our team updates to accept a built component image); the TCK then runs
against that network. `#5021` (local component build) is the interim mechanism until this lands. This
consolidation is only about the **build actions** — it does not merge the component repos, so the
cross-repo invocation model (§6.5) still applies.

**Test-authoring strategy (recommendation).** Three options were considered: (1) reuse the existing
`test/e2e` suites in-process as-is, (2) **recreate them using their logic** as black-box subprocess
suites, or (3) author entirely new tests. We recommend **(2)** — extract the existing command wrappers
and topology suites but drive them via subprocess `solo` + `kubectl`/REST probes. (1) couples to Solo
internals and breaks the black-box contract; (3) discards proven coverage. (2) is a **one-time,
bounded** port (the real complexity Jeromy flagged in swapping `k8`→`kubectl` and in-process→subprocess
is acknowledged) and is the only option that is both black-box *and* preserves existing coverage.

### 6.2 Independent verification

A run passes only if every `solo` subcommand exits 0, all expected pods reach `Ready`, an HCS smoke
transaction returns `SUCCESS` and is observable via mirror REST within the catchup window, JSON-RPC is
reachable where the relay is deployed, and teardown is clean. The TCK never trusts Solo's own success
message — it observes the real network.

### 6.3 Version resolution — OPEN QUESTION (PRD vs roadmap#199 discrepancy)

The candidate component is the **branch build** under test in the consumer's PR (leveraging
[#5021](https://github.com/hiero-ledger/solo/issues/5021) for local component builds). The unresolved
question is what versions the **other** components in the topology use. The two upstream sources differ:

- **Keith's PRD (Q3):** non-candidate components resolve to **latest-stable** (dynamic), or a **hybrid**
  (candidate provided; others latest-stable but overridable); an **edge** mode (very latest of each,
  regardless of stability) is an open sub-question.
- **roadmap#199:** non-candidate versions come from **external pinned-tuple profile files**
  (mainnet/testnet) that Solo reads as data.

**These are different models and must be reconciled before the resolution strategy is locked** (§10).
This design does not pick one; it records both.

Whatever the source, versions are injected into Solo. Solo already exposes each as a **CLI flag**
(preferred, per Solo UX) with an env-var fallback for non-`one-shot` paths:

| Component | CLI flag (preferred) | Env var (fallback) | `version.ts` constant |
| --- | --- | --- | --- |
| Consensus node | `--consensus-node-version` | `CONSENSUS_NODE_VERSION` | `HEDERA_PLATFORM_VERSION` |
| Mirror node | `--mirror-node-version` | `MIRROR_NODE_VERSION` | `MIRROR_NODE_VERSION` |
| Relay | `--relay-version` | `RELAY_VERSION` | `HEDERA_JSON_RPC_RELAY_VERSION` |
| Block node | `--block-node-version` | `BLOCK_NODE_VERSION` | `BLOCK_NODE_VERSION` |

`version.ts` also carries `*_EDGE_VERSION` (dynamically resolved) used by
[#4269](https://github.com/hiero-ledger/solo/issues/4269)'s `--edge`. Component *interdependency*
gating (e.g. CN X requires BN Y) belongs **inside Solo's** existing version-gate logic, not the TCK —
the TCK supplies one candidate and lets Solo enforce constraints.

### 6.4 Triggers

The same kit runs under more than one trigger:

| Trigger | Where it runs | Candidate | Purpose |
| --- | --- | --- | --- |
| **Component PR** (primary) | the component's own CI | the PR's branch build | gate the component change on Solo compatibility |
| **Solo PR** | Solo CI | supported component versions | gate a Solo change on component compatibility |
| **Release / nightly tuple** | Solo CI | a pinned tuple | roadmap#199 release signal (pending §6.3 reconciliation) |

### 6.5 Invocation surface

Because a gate needs a **synchronous** verdict and GitHub does not import reusable workflows across
repos the way GitLab does, the component runs the TCK **inline in its own pipeline** — not by
dispatching into Solo and awaiting an async result. Candidate mechanisms (design-phase decision):

- A **reusable cross-repo workflow** (primary) — the consumer calls it with minimal inputs, keeping the
  TCK a black box. **Gated on a POC** (see below): GitHub cross-repo `uses:` reusable workflows are
  less flexible than GitLab's; the POC confirms a consumer repo can call it and get a synchronous
  status back. SMEs who may already use this: Roger / Andrew / Nathan. Fallbacks if the POC fails: a
  **composite Action** (runs inline, portable) or **template-and-clone**.
- A **Docker image** for local / non-GitHub runs. *(Not nested inside Solo's CI containers — Solo-in-a-
  container would add a fourth level to the existing runner→Kind→component-containers nesting.)*

**Inputs the caller (consumer CI) supplies** — kept minimal so the TCK stays black-box:

| Input | Required | Meaning / effect |
| --- | --- | --- |
| `component` | yes | `consensus-node` \| `mirror-node` \| `block-node` \| `relay` \| `js-sdk` — maps to that component's version env var |
| `candidate` | yes | the branch build (via `solo-build-actions` / #5021) or a pinned version to test |
| `solo-version` | no (default: latest release) | a published Solo version **or** a Solo branch/`main` build |
| `topology` | no (default `standard`) | which topology suite(s) to run |
| `scope` | no (default `core+component`) | `core` \| `core+component` \| `full` |
| `non-candidate-versions` | no | override for the other components; default per §6.3 |

### 6.6 End-to-end run (mirror-node PR example)

```text
Actors:  CI   = Mirror-node CI (PR)           Solo = solo CLI (subprocess)
         TCK  = Solo TCK (composite Action)    K8s  = Kind cluster
         Net  = Mirror REST / JSON-RPC

Setup — PR opens; CI builds the branch image
   1. CI   ->  TCK  : invoke (candidate image, solo-version)
   2. TCK  ->  K8s  : create Kind cluster
   3. TCK  ->  K8s  : kind load candidate image
   4. TCK  ->  Solo : subprocess `solo ... deploy` (use local image)
   5. Solo ->  K8s  : deploy network (CN, MN, relay, ...)
   6. K8s  --> Solo : pods scheduled
   7. Solo --> TCK  : exit 0

Black-box verification — never trusts solo's word
   8. TCK  ->  K8s  : kubectl — are pods Ready?
   9. TCK  ->  Net  : submit HCS tx (SDK), then GET mirror REST
  10. Net  --> TCK  : tx visible / JSON-RPC reachable
  11. TCK  ->  Solo : subprocess `solo ... destroy` (teardown)

Result
  12. TCK  --> CI   : pass / fail (exit code) — synchronous, blocks the PR
```

The candidate (mirror node) runs as the **branch build**; the other components resolve per §6.3. The
verdict is produced **inline in the mirror-node pipeline**, so a broken PR is caught before it merges.

## 7. The compatibility run contract

### 7.1 Inputs

| Input | Required | Meaning |
| --- | --- | --- |
| `solo-version` | yes | which supported Solo release to test against (a separate `CITR_SOLO_TCK_VERSION`, not the component's `CITR_SOLO_VERSION`) |
| candidate build | yes | the component branch build / images under test (via #5021) |
| non-candidate versions | no | per §6.3 resolution strategy (latest-stable / hybrid / profile) |
| `topology` | no | which topology suite(s) to run (§8) |

### 7.2 Verdict

`pass | fail | skip`, decided by the independent verification of §6.2. A **fail** surfaces an
incompatibility; it does not by itself assign blame — an intentional component change may require Solo
to adapt. Reporting is JUnit XML + mochawesome + a non-zero exit code.

## 8. Time budget

Target **15–30 minutes per invocation** (PRD G1). Proposed topology tiers (adapted from the PRD's
struck-through v0.1 architecture — treat as a starting proposal, and reconcile vocabulary with
block-node's existing `single / paired-3 / 7cn-3bn-distributed`):

| Topology | Tier | ~Runtime | Gates |
| --- | --- | --- | --- |
| `single` | PR core | ~5 min | single-node bring-up + transfer smoke |
| `standard` | PR core | ~15 min | multi-node + MN + Relay; HCS submit → mirror catchup → JSON-RPC reachable |
| `block-node` | extended | ~15 min | block node attached, BLOCK stream |
| `node-upgrade` | extended | ~10 min | prior-stable CN → candidate |
| `dual-cluster` / `external-db` | nightly | ~30 min | multi-cluster shard/realm; external Postgres |

PR-core total ≈ 20 min. Which suites are actually PR-blocking should be grounded empirically by mining
the CN/BN issue history (recreation steps authored by the component teams) for the changes that most
often broke Solo — not chosen structurally.

## 9. Mini-performance check

A lightweight memory-footprint / stability smoke (~5–15 min), not a full perf suite. Rather than build
new perf infrastructure, **reuse the load types the existing perf suite exercises** (it runs several
load types at roughly 5 minutes each) but **run each for a shorter window (~1 minute each)** — a bounded
signal without new tooling. (Not a single long run sampled at a fixed point.)

## 10. Open questions

- **PRD vs roadmap#199 version-resolution model** (§6.3) — latest-stable/hybrid/edge vs external
  mainnet/testnet profiles. **Load-bearing; reconcile with Keith/leadership first.**
- **Repo home** — standalone `hiero-ledger/solo-tck` (independent versioning, clean boundary, setup
  overhead) vs inside the Solo repo (immediate `test/e2e` reuse, always in sync, weaker boundary).
  Deferred to design phase per the PRD.
- **Version variable** — separate `CITR_SOLO_TCK_VERSION` (recommended) vs reuse `CITR_SOLO_VERSION`.
- **Empirical suite selection** — mine component-team issue recreation steps to ground which suites
  are PR-blocking.
- **Topology vocabulary reconciliation** with block-node's existing names.
- **JDK axis** — whether/how a JDK version is pinned and injected (via the CN image/build); it has no
  current Solo flag.
- **Distribution mechanism** — composite Action vs reusable workflow vs Docker image (§6.5).

## 11. References

- Keith's Solo TCK PRD (Notion, Draft v0.2) — the authoritative upstream document
- [hiero-ledger/roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) — roadmap driver (2026 Q3)
- [#4272](https://github.com/hiero-ledger/solo/issues/4272) — Initiative: create Solo TCK (epic)
- [#4269](https://github.com/hiero-ledger/solo/issues/4269) — `--edge` latest component versions
- [#5021](https://github.com/hiero-ledger/solo/issues/5021) — local component build support
- [hiero-sdk-tck](https://github.com/hiero-ledger/hiero-sdk-tck) — independent-versioning / shipping precedent
- `test/e2e` — the framework the black-box kit is extracted from
- `hiero-solo-action` — the bring-up primitive the TCK asserts on top of

# Solo TCK — Implementation Plan

**Status:** Draft (aligned to Keith's PRD v0.2) · **Roadmap:** [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
· **Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
· **Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)
· **Overview:** [solo-tck-overview.md](./solo-tck-overview.md)

Breaks the initiative into filable child issues of #4272. The kit is **extraction and decoupling** of
Solo's existing `test/e2e` into a black-box subprocess runner, distributed to each component's CI —
not a greenfield build. Several PRD-level **decisions** gate the engineering work and come first.
Sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks.

## Phasing

| Phase | Goal | Issues |
| --- | --- | --- |
| **0 — Decisions** | Resolve the PRD/roadmap open questions that gate everything | TCK-D1, TCK-D2, TCK-D3 |
| **1 — Foundations** | Branch-build flow + empirical suite selection | TCK-1, TCK-2 |
| **2 — Black-box kit** | Subprocess runner + core suites + mem smoke | TCK-3, TCK-4, TCK-5 |
| **3 — Distribution** | A synchronous, portable invocation surface | TCK-6 |
| **4 — Consumer rollout** | Wire the kit into each consumer's CI | TCK-7 … TCK-12 |

## Dependency graph

```text
TCK-D1 ─┐
TCK-D2 ─┼─► TCK-1 ─► TCK-3 ─► TCK-4 ─► TCK-6 ─► TCK-7 / TCK-8 / TCK-9 / TCK-10 / TCK-11 / TCK-12
TCK-D3 ─┘        TCK-2 ─► TCK-4        TCK-5 ─► TCK-6
```

---

## TCK-D1 — Decide the version-resolution model (PRD vs roadmap#199)

**Phase 0 · Size: S (decision) · Depends on: none**

**Why.** The candidate is a branch build, but the versions of the *other* components need a model.

**Options.**

- **(a) Latest-stable (dynamic)** — always current, but non-reproducible over time.
- **(b) Hybrid** — candidate provided; others latest-stable but overridable. Attributable (vary-one),
  flexible; a few more inputs.
- **(c) Edge** — very latest of each; catches bleeding-edge breaks but noisy/hard to attribute.
- **(d) Pinned tuple profiles** (mainnet/testnet, roadmap#199) — reproducible, good for release-gating;
  needs profile files + upkeep.

**Recommendation.** **(b) Hybrid** for per-team PR runs + **(d) pinned profile** for nightly/release —
they serve different consumers and compose. **Pending ratification:** reconcile PRD (hybrid) vs
roadmap#199 (profiles) with Keith/leadership. See design §6.3.

**Acceptance criteria.** Decision recorded (with Keith/leadership); design §6.3 updated to the chosen model.

---

## TCK-D2 — Decide the repo home

**Phase 0 · Size: S (decision) · Depends on: none**

**Options.**

- **(a) Standalone `hiero-ledger/solo-tck`** — independent semver (consumers pin a stable TCK), clean
  black-box boundary, mirrors `hiero-sdk-tck` + the new `solo-build-actions` tooling-repo pattern;
  one-time new-repo setup.
- **(b) Inside the Solo repo** — immediate `test/e2e` reuse, always in sync; but couples the release
  cadence and weakens the boundary.
- **(c) In each consumer repo** — rejected: defeats reuse, N copies to maintain.

**Recommendation.** **(a) Standalone `solo-tck`** — independent versioning is the point of a black-box
kit; extraction from `test/e2e` is a one-time port.

**Acceptance criteria.** Decision recorded, with runner/governance/release implications for the choice.

---

## TCK-D3 — Decide the version variable

**Phase 0 · Size: S (decision) · Depends on: none**

**Options.** Separate `CITR_SOLO_TCK_VERSION` vs reuse each consumer's `CITR_SOLO_VERSION`.

**Recommendation.** **Separate `CITR_SOLO_TCK_VERSION`** — so a TCK bug doesn't force a Solo bump and
vice versa; decouples cadences. Matches Keith's PRD.

**Acceptance criteria.** Naming/ownership of the pin agreed; consumers know which variable to set.

---

## TCK-1 — Branch-build flow (leverage #5021)

**Phase 1 · Size: M · Depends on: TCK-D1, TCK-D2**

**Why.** The candidate is a component's **branch build**, not a pinned release. The TCK must deploy a
locally-built component image through Solo. See design §6.1, §6.3. Interim mechanism:
[#5021](https://github.com/hiero-ledger/solo/issues/5021). End state: the consolidated
`solo-build-actions` repo (governance-approved) → `hiero-solo-action` (our team updates it to accept a
built image) → TCK.

**Scope.** Build a component branch → `kind load` → deploy through Solo with that image; confirm the
deployed pod runs the built image, not a registry default. Validate for CN and MN first.

**Acceptance criteria.** Documented evidence a branch build reaches the deployed pod for at least two
components; any component where it doesn't is filed as a follow-up.

---

## TCK-2 — Empirical suite selection

**Phase 1 · Size: M · Depends on: none**

**Why.** Which suites gate a PR should be grounded in what actually breaks Solo, not chosen
structurally. The component teams (CN/BN authors) file issues with recreation steps. See design §8.

**Scope.** Mine CN/MN/BN/Relay issue history for Solo-breaking changes and their recreation steps;
produce the ranked PR-blocking suite list and the coverage each must assert.

**Acceptance criteria.** A prioritized suite list mapped to real breakage categories per component.

---

## TCK-3 — Extract the black-box subprocess runner

**Phase 2 · Size: L · Depends on: TCK-1**

**Why.** The kit drives `solo` as a subprocess, decoupled from Solo internals — not the in-process
e2e suite relabeled. See design §3, §6.1.

**Scope.** From `test/e2e`: replace in-process `await main(argv)` with `spawn('solo', argv)`; drop the
`tsyringe-neo` DI container and `K8Factory` in favor of shell-out `kubectl` + direct HTTP probes;
parametrize on candidate images + `solo-version` instead of reading `version.ts`. Reuse the existing
command wrappers (`ConsensusNodeTest`, `MirrorNodeTest`, `BlockNodeTest`, `RelayTest`).

**Acceptance criteria.** The runner deploys and verifies a network via subprocess `solo` with no Solo
internal imports.

---

## TCK-4 — Core topology suites with independent verification

**Phase 2 · Size: M · Depends on: TCK-2, TCK-3**

**Why.** The PR-core signal: `single` (~5 min) and `standard` (~15 min), each verifying a functional
network. See design §6.2, §8.

**Scope.** Bring-up via `solo` → pod-ready probes → HCS smoke → mirror-catchup verification → JSON-RPC
health (where relay is deployed) → clean teardown. Reuse one deployed network across a topology's checks.

**Acceptance criteria.** `single` + `standard` pass within the ~20 min PR-core budget and fail loudly
on any unhealthy channel.

---

## TCK-5 — Memory-footprint smoke

**Phase 2 · Size: S · Depends on: TCK-3**

**Why.** A lightweight mem/stability smoke (~5–15 min), not a perf suite. See design §9.

**Scope.** Reuse the load types the existing perf tests exercise (that suite runs several load types at
roughly 5 minutes each), but run each for a shorter window (~1 minute each) — rather than building new
perf infra or sampling a single long run at a fixed point. Fail on resource-requirement violations.

**Acceptance criteria.** Reports mem/cpu for each shortened load type against Solo's resource requirements.

---

## TCK-6 — Distribution / invocation surface

**Phase 3 · Size: M · Depends on: TCK-4, TCK-D2, TCK-D3**

**Why.** A gate needs a **synchronous** verdict in the consumer's own pipeline; GitHub can't import
reusable workflows cross-repo like GitLab. See design §6.5.

**Scope.** Package the runner as a **composite GitHub Action** (primary) the consumer calls inline;
optionally a reusable workflow where org `uses:` is allowed, and a Docker image for local runs. Do
**not** nest Solo inside a CI container. Semver, independent of Solo's cadence.

**Acceptance criteria.** A consumer workflow runs the TCK inline and blocks on a synchronous pass/fail.

**POC prerequisite (TCK-6a).** Before committing to the reusable cross-repo workflow, run a POC:
(1) a minimal `workflow_call` workflow in a test repo → (2) call it from a second repo with inputs →
(3) confirm synchronous status flows back to the caller PR → (4) verify secret/permission passing.
Ask Roger/Andrew/Nathan whether they already use this. If it fails, fall back to a composite Action
(runs inline) or template-and-clone. Cannot be validated by design alone — needs live CI.

---

## TCK-7 … TCK-11 — Consumer rollout

**Phase 4 · Size: M each · Depends on: TCK-6**

Wire the kit into each consumer per the PRD's integration model. The TCK is added as an **additional**
gate — it does **not** replace a consumer's existing Solo tests, which cover behavior outside its scope
(replacing duplicated *bring-up orchestration* with a TCK call is fine; retiring any now-redundant
*tests* is a best-case, per-team follow-up, coordinated with each team):

- **TCK-7 — CN:** add a Solo-TCK regression panel to CN PR checks and XTS; delete inline Solo
  orchestration / version-branching.
- **TCK-8 — MN:** replace the inline Solo orchestration in `acceptance.yaml` with a single TCK call;
  preserve the RECORD/BLOCK stream matrix as a TCK input.
- **TCK-9 — BN:** additive PR-blocking job (fills the current PR gap); a later RFC delegates the
  bring-up portion of `solo-e2e-test.yml`, keeping BN-specific workload.
- **TCK-10 — Relay:** replace the duplicated Solo bring-up across the relay's acceptance/conformity
  workflows with a TCK call.
- **TCK-11 — JS SDK:** invoke the TCK to gate SDK PRs against Solo's SDK-dependent logic (library
  consumer, different invocation shape).

**Acceptance criteria (each).** The consumer's PRs gate on a synchronous Solo-compat signal; inline
orchestration removed where it existed.

---

## TCK-12 — Shrink Solo's own per-PR matrix

**Phase 4 · Size: M · Depends on: TCK-7 … TCK-11**

**Why.** Once compatibility coverage moves upstream, Solo's per-PR e2e collapses toward Solo mechanics.
See design §2, §5.

**Scope.** Reduce `e2e-test-matrix.json` toward Unit + Integration + One-Shot smoke; move the dropped
component-coverage suites to Solo's nightly scheduled CI against latest components.

**Acceptance criteria.** Solo per-PR wall-clock drops materially; dropped coverage demonstrably runs
upstream (in consumers) and/or in Solo nightly.

---

## Suggested issue metadata

- **Parent:** all issues are children of #4272.
- **Blocked-by:** TCK-D1 (version model) and TCK-D2 (repo home) gate most engineering; resolve first.
- **Labels:** `Testing Improvements`; `P1-💎` for the decisions + black-box kit (TCK-D1…TCK-6).
- **Cross-repo:** TCK-7…TCK-11 land in the component repos (CN/MN/BN/Relay/SDK), coordinated with
  those teams.

# Solo TCK — Implementation Plan

**Status:** Draft (PRD v0.2) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) ·
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

Filable child issues of #4272. Rationale lives in the design doc; this file carries scope and acceptance
only. **S** ≈ 1–2 days, **M** ≈ 3–5 days, **L** ≈ 1–2 weeks.

| Phase                    | Issues                                   | Blocked by                     |
| ------------------------ | ---------------------------------------- | ------------------------------ |
| **0 — Decisions**        | TCK-D0, D1, D2 (decided), D3, D4, D5, D6 | —                              |
| **1 — Foundations**      | TCK-1, TCK-2                             | — (TCK-1 does **not** need D1) |
| **2 — Kit**              | TCK-3, TCK-4, TCK-5                      | TCK-1, TCK-2                   |
| **3 — Distribution**     | TCK-6, TCK-13                            | TCK-4, D2, D3                  |
| **4 — Consumer rollout** | TCK-7 … TCK-12, TCK-14                   | TCK-6; TCK-12 on 7..11         |

**TCK-1 is not blocked by D1.** Loading a branch build into Kind and deploying it is independent of how the
_other_ components' versions resolve, and four of five components can already do it (design §2). It is also
on the critical path for four consumers, so it starts now rather than waiting on a leadership decision.

**TCK-11's first mode is not blocked by Phase 2.** Running the candidate JS SDK as a _client_ against a
Solo-deployed network needs no image swap and no runner — a script plus `hiero-solo-action`, which the SDK
repo already uses. It can run in parallel with Phase 1 and buy early consumer feedback (design §2).

## Phase 0 — Decisions

**TCK-D0 — Mirror the PRD requirements into GitHub · S.** The PRD is in Notion and roadmap#199 is not
readable by every reviewer, yet §3's open decision depends on both. **Done when:** the G1 budget, the
version-resolution requirement and the JDK axis are restated in #4272 or in the design doc, and §3 is
reviewable without Notion access.

**TCK-D1 — Version-resolution model · S.** Options: (a) latest-stable — non-reproducible; (b) hybrid —
candidate provided, others latest-stable but overridable; (c) edge — noisy; (d) pinned-tuple manifests
(roadmap#199) — needs upkeep. **Recommend (b) for PR runs + (d) for nightly/release as the default**, pending
ratification with Keith/leadership. Also settle design §3's three constraints: not "profiles", one precedence
order across one-shot and step-by-step commands, and emitting the _resolved_ tuple. **Done when:** decision
recorded, design §3 updated, all three specified.

**TCK-D2 — Repo home · S · DECIDED: inside the Solo repo,** for reuse of the repo's fixtures, helpers and CI
plumbing, and because the harness cannot move without a rewrite (design §2). Note this is reuse of the
_repository_, not of Solo's internals: §2 still recreates the suites against the observable contract and
TCK-3 still bans Solo imports. Standalone and per-consumer copies were the rejected alternatives.
**Obligation:** the best argument for standalone was consumption-time pinning, so **the kit must be released
on its own tags** — a dedicated prefix (e.g. `tck-v*`) that Solo's `semantic-release` config ignores — or
in-repo carries the standalone costs with none of the benefits. **Done when:** that release/tagging mechanism
is specified and implemented before the first consumer is onboarded (TCK-6).

**TCK-D3 — Version variables · S.** The **kit** version and the **Solo** version it tests against need
opposite answers: pin the kit independently, but **accept the caller's Solo version** — a sixth pin drifts
against the five that already exist (design §4). Each kit release must also declare, and check at startup,
the Solo CLI range it supports. **Done when:** consumers know which variable sets which, the default Solo
version is tied to the support window in [#3608](https://github.com/hiero-ledger/solo/issues/3608), and an
out-of-range Solo fails immediately with the range named.

**TCK-D4 — Write the Solo Deployment Contract · M · blocks the name "TCK" and the failure-class rule.**
Scope: `docs/design/test/solo-deployment-contract.md`, versioned — chart structure and location, required
config keys, labels, Helm-values schema, image entrypoints, env vars, health endpoints, CLI behaviour. v0.1
with ten real clauses beats a complete document later; format modelled on `hiero-sdk-tck`'s
`docs/test-specifications/`. **Done when:** merged, every pr-core suite cites the clause it verifies (which is
what makes `component-non-conformant` assignable, design §6), and the clause-change approval process is
recorded.

**TCK-D5 — Make the Solo-side interdependency boundary real · M.** Scope: a declarative constraint registry
modelled on `component-upgrade-rules.ts` + `resources/component-upgrade-migrations.json` — a sibling
`component-compatibility.json` evaluated against the resolved tuple before deploy, then migrate the ad-hoc
gates into it, starting with `BlockNodeCommand.assertBlockProofCompatibility`. **Done when:** a tuple can be
validated without deploying it, ≥3 existing gates are migrated, and constraints the registry cannot express
have a documented failure mode.

**TCK-D6 — Where the gate blocks · S.** #4272 asks for a required PR check per component; CN and Block Node
run Solo only on schedules, and a cron gates nothing. Decide and record: PR gate for MN, Relay and JS SDK in
v1; additive scheduled job for CN and BN, with a PR gate as a follow-up issue per team. **Done when:** the
decision is recorded and the two follow-up issues exist, so TCK-7 and TCK-9 cannot be closed by a cron alone.

## Phases 1–4 — Engineering

| Issue                                              | Scope                                                                                                                                                                                                                                                                                   | Done when                                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TCK-1** Branch-build flow<br>M                   | Close the four gaps in design §2: a CN image swap (today only `--local-build-path`), `--component-image` on `one-shot` and on `block node upgrade`, and a record of the image a run deployed. MN/Relay/Explorer/BN already deploy a branch image.                                       | The deployed pod demonstrably runs the built image, not a registry default, for ≥2 components, and the run output names the image it used.                  |
| **TCK-2** Suite selection<br>M                     | Confirm design §7's `MINIMUM_*` findings, extend against CN/MN/BN/Relay issue history, rank the pr-core list. Many past breakages had **no test at all**.                                                                                                                               | A prioritised list, each entry citing its motivating issue or gate, plus an explicit uncovered list.                                                        |
| **TCK-3** The runner<br>L · after 1                | A subprocess `solo` adapter and `kubectl`+HTTP probe layer for the distributed path; parametrise on candidate images + `solo-version` instead of `version.ts`. **Scope the port** per design §2. Includes the startup Solo-range check (D3).                                            | Verifies a network via subprocess `solo` with no Solo internal imports; in-process suites still run under coverage.                                         |
| **TCK-4** Core topology suites<br>M · after 2, 3   | `single` (~5 min) + `standard` (~15 min), one network per topology, including the Explorer `/api/v1` probe. Assertions cite TCK-D4 clauses, and each suite carries a canary (design §7).                                                                                                | Both pass within the ~20 min budget and fail on any unhealthy channel, not just pod-readiness ([#5875](https://github.com/hiero-ledger/solo/issues/5875)).  |
| **TCK-5** Memory smoke<br>S · after 3 · `extended` | The existing perf suite's load types at ~1 min each (design §7). Lives in `extended`, not `pr-core` — it does not fit a 15-minute PR budget.                                                                                                                                            | Reports mem/cpu per load type against Solo's resource requirements, with the "not a TPS signal" caveat in the output.                                       |
| **TCK-6** Distribution<br>M · after 4, D2, D3      | Versioned composite Action (design §5); the Docker image is deferred past v1. **Carries TCK-D2's obligation**: own release tags under a prefix `semantic-release` ignores.                                                                                                              | A consumer workflow blocks on a synchronous pass/fail, the kit pins at a version that is not a Solo version, and a kit tag does not trigger a Solo release. |
| **TCK-6a** Reusable workflow<br>optional           | POC only: minimal `workflow_call` repo → call from a second repo → confirm synchronous status reaches the caller PR → verify secret/permission passing. Ask Roger/Andrew/Nathan first.                                                                                                  | The Actions-policy and token-scope unknowns are answered, or the path is dropped.                                                                           |
| **TCK-13** Conformance record<br>M · after 4       | A git-tracked entry per `(Solo version, resolved tuple, kit version, date, verdict)`; extend publication beyond the README "Current Releases" table (design §6).                                                                                                                        | A record exists for ≥1 Solo release, reachable without running CI, covering all five components.                                                            |
| **TCK-12** Shrink Solo's matrix<br>M · after 7–11  | Reduce `e2e-test-matrix.json` toward unit + integration + one-shot smoke; move dropped component coverage to nightly.                                                                                                                                                                   | Each drop **earned per consumer** — only once equivalent coverage demonstrably runs upstream, mapping kept explicit.                                        |
| **TCK-14** User-facing guide<br>S · after 6        | A guide in `solo-docs/content/en/docs/…`: adding the kit to your CI, inputs, reading a verdict and its failure class, pinning the kit, and what to do when a run is classed `solo-defect`. Needs a new top-level section — the existing ones all address someone _deploying_ with Solo. | Live on solo.hiero.org. The site rebuilds only on a Solo release dispatch, so time it accordingly.                                                          |

## TCK-7 … TCK-11 — Consumer rollout · M each · after TCK-6

Replacing duplicated _bring-up orchestration_ is in scope; retiring now-redundant _tests_ is a per-team
follow-up. **Done when (each):** the consumer gates on a synchronous Solo-compat signal and duplicated
orchestration is removed where it existed. Per TCK-D6, "gates" means a PR check for MN, Relay and the SDK, and
a scheduled job plus a tracked PR-gate follow-up for CN and BN.

- **TCK-7 — CN:** add a panel to the XTS suite. CN runs Solo 3-hourly, **not** on PR checks, so a PR gate is
  a separate conversation (`001-user-dry-run-extended-test-suite.yaml` can already run against any ref).
  CN's panels build CN locally, which the kit does not replace.
- **TCK-8 — MN:** MN's Solo bring-up lives in `.github/actions/run-e2e/action.yml`, with a second copy in
  `wrb-differential.yaml` — not in `acceptance.yaml`. Replace both with one kit call; preserve the
  RECORD/BLOCK stream matrix as an input. MN also deploys its branch _chart_, so the kit needs a chart-dir
  input alongside the image.
- **TCK-9 — BN:** additive job. BN's `k6-tests.yml` already runs Solo on `pull_request`, so a PR-blocking kit
  job is a smaller step than the daily/weekend/RC schedule suggests — negotiate it. BN also installs the
  deprecated `@hashgraph/solo`, which is no longer published
  ([#6150](https://github.com/hiero-ledger/solo/pull/6150)); fix that in the same change.
- **TCK-10 — Relay:** the Relay does **not** deploy itself through Solo today — seven workflows pass
  `--deploy-relay=false` and run the relay on the host. So this is not a replacement of duplicated bring-up
  but a new capability: build a relay image per PR, hand it to the kit as the candidate, and let Solo deploy
  it. Size accordingly.
- **TCK-11 — JS SDK:** **best first pilot**, in two modes (design §2). Mode 1 (candidate SDK as a client
  against a Solo-deployed network) needs no branch-build work and can start during Phase 1 —
  `hiero-sdk-tck`'s `js_compatibility.yml` already stands up its network with `hiero-solo-action@v0.19.0` and
  a hand-pinned `solo-version`. Mode 2 (candidate SDK injected into Solo via an npm `overrides` entry or an
  installed tarball, then Solo's own suites) needs its own mechanism and follows Phase 2.

_(Explorer is a verification channel, not a consumer — design §1. Its `/api/v1` probe ships inside TCK-4, and
no Explorer CI is created.)_
Note TCK-12's benefit is contingent on all five adoptions, two of which run Solo only on schedules.

## Issue metadata

Parent **#4272**; labels `Testing Improvements`, `P1-💎`. File with the native sub-issue link, not body
references. TCK-D0/D1/D3/D4/D5/D6 and TCK-1 as **Ready**; the rest **Backlog** until their blockers clear.

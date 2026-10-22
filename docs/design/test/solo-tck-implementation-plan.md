# Solo TCK - Implementation Plan

**Status:** Delivery plan for the proposed architecture.
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272).
**Tracker:** [#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md).

## Architecture handoff

The handoff contains the caller and artifact schemas, version resolution, deployment boundary, lane specifications,
release process, role responsibilities and acceptance criteria. The integration requirements in design §16 identify
the validation gates for each implementation capability. Assignment and scheduling belong in implementation issues.

Architecture approval and implementation acceptance are separate milestones. Runtime measurements, kit publication
and required-check adoption are implementation outcomes, with the exit evidence below.

## Order of work

| Slice | Work | Dependencies | Exit evidence | Responsible role |
| --- | --- | --- | --- | --- |
| 0 | Release the node-account ping fix and prepare Solo/TCK co-release metadata, npm exclusion and verification workflow | #6228; release integration in design §6 | Released CLI with the fix; Linux pilot on that release; verified publication workflow | Solo and CI/release engineering |
| 1 | Implement the runner and JS SDK lane: artifact identity, functional probes, complete short profile, resource checks, results and cleanup | Slice 0; design §4, §8, §9 | Full lane and negative controls pass on Linux; measured full-workflow budget; verified shared Solo release ref | Solo and SDK teams |
| 2 | Implement the MN lane, deployment contract and caller workflow; add Explorer coverage after component-image isolation | Slice 1; #6225 for Explorer/Relay extension | amd64 multi-image identity proof, branch-chart checks, negative controls, complete six-image build/workflow timings | Solo and MN teams |
| 3 | Implement released-kit/candidate-Solo and development-kit/released-Solo checks, then nightly coverage | Slice 1; release-transition contract | Separate results preserve the released-kit baseline when kit and CLI change together | Solo team |
| 4 | Make JS SDK, then MN checks required | Slices 1/2; design §14 observation gate | At least 10 working days, 20 runs, no false red, 90th percentile under 30 minutes; ruleset and bypass audit configured | Component teams and CI/release engineering |
| 5 | Add Relay and CN lanes, then BN | Slice 2; qualified SHA-256 CN/BN/MN tuple and component-image fixes for BN | Lane-specific functional and identity probes pass; each caller completes its adoption gate | Solo and component teams |
| 6 | Activate memory ceilings, publish the user guide and reduce redundant Solo matrix coverage | Each lane's own two-week observations; slice 4 for matrix reduction | Verified release includes peak-plus-25% ceilings; every removed E2E case maps to a required lane | Solo team |

The JS SDK lane exercises both Solo's SDK dependency and the candidate as a client. The MN lane adds the external
multi-image and chart-injection path. This order qualifies the shared runner before extending it to the remaining
components.

## Dependencies and evidence

- [#6228](https://github.com/hiero-ledger/solo/pull/6228) fixes the node-account ping used by current SDKs. The
  [local pilot](./solo-tck-conformance-gate.md#111-local-sdk-pilot-evidence) passes with the fixed source, but does not
  qualify a released CLI or the complete Linux Falcon lane.
- [#6234](https://github.com/hiero-ledger/solo/issues/6234) and
  [#6235](https://github.com/hiero-ledger/solo/pull/6235) track release/package isolation. Retain npm exclusion;
  replace independent TCK release/tag assumptions with the co-release process in design §6.
- [#6237](https://github.com/hiero-ledger/solo/issues/6237) and
  [#6238](https://github.com/hiero-ledger/solo/pull/6238) track the shared SDK lane. Qualify its load profile,
  deadlines, supported CLI list and Linux acceptance against this contract before release.
- [#6225](https://github.com/hiero-ledger/solo/issues/6225) gates Explorer and Relay beside an MN candidate. The
  initial MN lane runs with both disabled and the pinger off.
- Registry preservation [#6226](https://github.com/hiero-ledger/solo/issues/6226), implemented by
  [#6240](https://github.com/hiero-ledger/solo/pull/6240), is available in Solo 0.94.0. Definitive-image-failure handling
  [#6227](https://github.com/hiero-ledger/solo/issues/6227), implemented by
  [#6239](https://github.com/hiero-ledger/solo/pull/6239), is on main. Each selected released CLI still needs lane
  verification; a merged fix alone does not qualify a release.
- [#6202](https://github.com/hiero-ledger/solo/issues/6202) tracks the SHA-256 compatibility boundary. Solo validates
  the selected CN/BN/MN tuple; TCK does not maintain a second compatibility table.

## Work map

TCK-D*/TCK-* are plan identifiers. Linked issues remain the implementation records.

| ID | Deliverable | Contract |
| --- | --- | --- |
| TCK-D0 | Requirements | Design §1 |
| TCK-D1 | Version model | Design §5 and §6.3 |
| TCK-D2 | Repository and release boundary | `tck/` in Solo, shared Solo version and release cycle, immutable caller pins; design §6 |
| TCK-D3 | Version inputs | Design §4.1 and §5 |
| TCK-D4 | Deployment contract | One lane spec and component-assumption inventory; design §7.4 |
| TCK-D5 | Component constraints | Solo's `ComponentCompatibility`; design §5.3 |
| TCK-D6 | Required checks | Consumer rollout; design §14 |
| TCK-1 | Branch artifacts | Candidate/companion schema and provenance; design §4.1 and §5.3 |
| TCK-2 | Probe specifications | Fixed lane probes and reproducible component failures; design §7 |
| TCK-3 | Runner | Slice 1 |
| TCK-4 | Lane implementations | Slices 1, 2 and 5 |
| TCK-5 | Short profile and resource ceilings | Initial stability/load in each lane; calibrated ceilings in slice 6 |
| TCK-6 | Distribution | Solo co-release workflow and verified action refs; design §6 |
| TCK-6a | Reusable workflow | Optional wrapper around the composite action; outside initial delivery |
| TCK-7..11 | Consumer rollout | CN, MN, BN, Relay and JS SDK respectively |
| TCK-12 | Solo matrix reduction | Slice 6 |
| TCK-13 | Conformance record | CI artifacts and summaries in v1; separate public ledger outside initial delivery |
| TCK-14 | User guide | Slice 6 |

## Implementation acceptance

### Runner and branch artifacts

- Inputs, preflight, supported releases, source-SHA builds and Solo tarballs follow design §4 and §5.
- A default image left in a target container, missing probe or incomplete cleanup prevents a pass.
- The complete workflow fits 30 minutes, including all build jobs, setup, deploy, the five-class profile,
  diagnostics, cleanup and export. Stage caps and the three-minute cleanup reserve are qualified on the target runner.
- BN candidate + CN branch, CN candidate + BN branch and SDK candidate + CN branch pass using the manifest in
  design §4.1. Missing, duplicate, conflicting and unsupported entries fail without release fallback. Results record
  source provenance, artifact hashes and observed identity for every supplied component.
- The runner follows Solo's class/static-helper conventions; `.mjs` lint includes executable TCK code.
- Reused actions preserve one cluster owner, isolated context/state, candidate injection and cleanup handoff.
- Unit tests cover failure attribution and exit codes, including `unknown`. Results are finalized after cleanup.

### Co-release and distribution

- Solo's release workflow synchronizes TCK version metadata and includes TCK changes in the Solo release notes.
- The final publication ref, supported CLI list and exact artifacts pass release verification and negative controls.
- A newly supported CLI's release-candidate artifact is verified before admission; supported metadata is immutable
  at an existing action ref. Published artifacts match the verified source/artifact manifest.
- Solo's `releases/latest` and `install.sh` retain the complete Solo release assets.
- `npm pack --dry-run` of Solo excludes `tck/`. The action remains available at `solo/tck@<verified release SHA>`.
- Publication and migration preserve the independent released-kit compatibility check in design §13.

### Short profile and resources

- The profile covers Token, NFT, Crypto, HCS and Smart Contract phases, including assertions, warm-up/cooldown,
  pacing and measurement export. Approximately five minutes of exercise fits inside the complete workflow budget.
- Missing phases fail. A concise profile that skips phases or a cutoff of the long suite does not qualify.
- JS SDK lane traffic uses the candidate SDK; other lanes use the kit's pinned probe SDK.
- Results include phase completion/timing, container timelines and peaks, plus failure diagnostics.
- OOM kills and post-deploy restarts fail immediately. Memory ceilings activate only after each lane has two weeks
  of observations, a peak-plus-25% limit and a new verified release pin.

### Lanes and consumer adoption

- Each lane has a component-reviewed specification and inventory of Solo's assumptions, with source references.
- Negative controls fail with the expected reasons and stage timings are recorded.
- Each consumer first runs non-required, then passes the observation and ruleset gates in design §14.
- JS SDK replaces the dedicated pilot script with the shared lane and validates a released CLI containing #6228.
- MN runs beside existing acceptance tests, initially in RECORD mode; its six-image build uses one cached Gradle
  invocation before considering a larger runner or a measured runtime exception.
- CN runs beside MATS and reuses `data/apps` and `data/lib` from the candidate build.
- BN uses a CN that writes SHA-256 blocks and an MN configured to ingest only from the candidate BN.
- Relay is deployed through Solo from the candidate image and passes EVM transaction and subscription probes.

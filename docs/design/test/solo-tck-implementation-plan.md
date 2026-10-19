# Solo TCK - Implementation Plan

**Status:** Revised October 19, 2026 after maintainer feedback. SDK-first order remains accepted; the co-release
model, exact short profile, branch-artifact interface and action-reuse wiring retain their confirmation needs.
Child issues of [#4272](https://github.com/hiero-ledger/solo/issues/4272), tracked in
[#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md). Decisions are recorded in design §16.
The `mirror-node` lane and #6225 have an assigned owner on the Solo team; the SDK lane implementer is still to be
confirmed. Other owner entries remain proposals for the named teams to confirm.

## Architecture completion and handoff

The architecture phase is complete when:

- The maintainer review of the architecture is complete and its outcome is recorded.
- Each decision in design §16 has an answer or an explicit deferral with an owner and linked follow-up; proposals
  remain identified as proposals until accepted.
- The implementation handoff records the component contracts, interfaces, lane order, dependencies and acceptance
  criteria, with confirmed owners distinguished from ownership still to agree.
- The co-release/PRD conflict, branch-companion schema, all-phase profile and action-reuse boundary are agreed or
  explicitly deferred with accepted owners, linked follow-ups and return gates; a review comment alone closes none
  of those details.

Implementation, releases, runtime measurements and required consumer checks are separate delivery work. Their
acceptance criteria below do not gate completion of the architecture phase.

## Order of work

| Slice | Work                                                                                                                         | Depends on                                         | Exit evidence                                                                                          | Owner                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 0 | Solo: merge/release #6228; reconcile #6234/#6235 with the co-release decision, preserving Latest/installer and npm exclusion | Release model/owner agreement | A Solo release with #6228; released-version Linux pilot green; approved publication sequence | Solo maintainers and release owner; to be confirmed |
| 1 | Kit core and JS SDK lane: candidate proof, proposed all-phase profile, results and verified publication; confirm action reuse, ESM lint and branch-artifact contracts | 0; design OPEN-03/05/07/09/11 | Release verification/negative controls green; caller pins verified ref; measured full-workflow time | Solo team with SDK team; implementer to be confirmed |
| 2 | MN lane/spec/inventory and a non-required caller workflow; publish at the next agreed verified ref. Explorer/Relay join after #6225 | 1 | amd64 identity proof, negative controls, measured complete build/workflow and reviewed probes | Solo team (owner assigned), with MN team |
| 3 | Solo branch/main compatibility, proposed released-kit and kit-development checks, nightly runs | 1; transition/workflow agreement | Independent results cannot hide a Solo regression behind a paired kit change | Solo team; workflow/upkeep owner to confirm |
| 4     | Required checks: `js-sdk`, then `mirror-node`                                                                                | 1, 2, and the observation bar (design §14)         | 10 working days, 20 runs, no false red, 90th percentile under 30 minutes; the rulesets changed          | SDK team; MN team with CI and release engineering |
| 5     | The `relay` and `consensus-node` lanes, then `block-node`                                                                    | 2; for BN, a CN that writes SHA-256 blocks, #6226 and #6202 | Each lane required by its team                                                                         | Solo team, with each component team   |
| 6     | Memory ceilings (TCK-5), the user guide (TCK-14), the Solo matrix reduction (TCK-12)                                         | Ceilings: per lane, two weeks of its `main` runs after the slice that adds it (design §8). Guide and matrix reduction: 4 | Ceilings in a kit release; the guide live; each dropped Solo E2E case mapped to a required lane         | Solo team                             |

The `js-sdk` lane goes first because the SDK team contributes to both projects, it exercises every kit stage except
image loading, and it already found a real break. The MN lane follows in parallel as the first external pilot,
because it proves image injection.

## Implementation checkpoint - October 19

- The SDK 2.90.1 pilot passed locally against the #6228 Solo source: identity, deployment, account creation/key
  update, transfer/topic receipts, both MN readbacks and cleanup. It took 344.45 seconds from install through cleanup,
  excluding builds and Kind preparation. See [the run evidence](./solo-tck-conformance-gate.md#111-local-sdk-pilot-evidence).
- #6228 remains open at `24dc1ffc`. Slice 0 still needs its merge and Solo release, followed by a green #4537 run
  pinned to that release on Linux CI. The local proof does not complete those exit criteria.
- The SDK pilot [#4537](https://github.com/hiero-ledger/hiero-sdk-js/pull/4537) merged October 16. It is distinct
  from the shared kit and does not complete the released-Solo adoption criteria above.
- Release isolation is tracked in [#6234](https://github.com/hiero-ledger/solo/issues/6234) and open
  [PR #6235](https://github.com/hiero-ledger/solo/pull/6235). The first shared SDK lane is tracked in
  [#6237](https://github.com/hiero-ledger/solo/issues/6237) and open
  [PR #6238](https://github.com/hiero-ledger/solo/pull/6238), stacked on #6235. The latter includes Falcon deploy,
  candidate identity, probes, load/resource checks and cleanup, with two passing local macOS arm64 runs. Linux
  network acceptance, the agreed release model, supported-release admission, caller migration and resource ceilings
  remain. Those local runs do not verify the newly proposed all-phase profile or branch-companion combinations. Passing PR checks do not establish those results.
- #6235's release rules and #6238's load/deadlines need reconciliation with the new feedback; neither PR is
  automatically accepted or obsolete. No implementation change is made by this architecture update.
- The MN lane work includes measuring the complete six-image build, trying one cached Gradle invocation, then a
  larger runner if needed. A runtime exception requires a further decision with those measurements (design §9);
  none is approved. #6225 is assigned; the MN handoff and delivery date still need coordination.

## Issue map

The task IDs stay, so existing references keep working.

| ID        | Was                         | Now                                                                                                               |
| --------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TCK-D0    | Mirror the PRD requirements | Done in design §1, from #6223. The PRD owner confirms (OPEN-01).                                                  |
| TCK-D1    | Version model               | Version policy accepted (design §5), including visible temporary Solo SHA pins and verified supported versions    |
| TCK-D2    | Repo home and tags          | Home decided; co-release/PRD alignment and mechanics pending in design §6                                                                       |
| TCK-D3    | Version variables           | Design §5.2 and §6.3                                                                                               |
| TCK-D4    | Deployment contract         | One spec and one "what Solo assumes" inventory per lane (design §7.4), first for `js-sdk` and `mirror-node`       |
| TCK-D5    | Interdependency rules       | Solo's `ComponentCompatibility` (#6179) plus #6202; the kit adds no rules                                          |
| TCK-D6    | Where the gate blocks       | Every lane is a PR check (design §14). Schedules are never the end state                                          |
| TCK-1     | Branch-build flow           | Design §4.1/§5.3: multi-component branch artifacts, immutable provenance, identity and CLI wiring; proposal to review                                    |
| TCK-2     | Suite selection             | The lane probes in design §7.3, plus each team's top breakages of the last six months as new probes               |
| TCK-3     | Runner                      | Slice 1                                                                                                           |
| TCK-4     | Core suites                 | The lanes: slices 1, 2 and 5                                                                                       |
| TCK-5     | Memory smoke                | Stability in every lane from slice 1; memory ceilings in slice 6                                                  |
| TCK-6     | Distribution                | Slice 1: action pin and verified publication; co-release workflow/permissions to agree                                                               |
| TCK-6a    | Reusable workflow           | Deferred. The composite action is the interface; a reusable workflow can wrap it later                           |
| TCK-7..11 | Consumer rollout            | CN (slice 5), MN (slices 2 and 4), BN (slice 5), Relay (slice 5), JS SDK (slices 1 and 4)                         |
| TCK-12    | Shrink Solo's matrix        | Slice 6                                                                                                           |
| TCK-13    | Conformance record          | Deferred; CI artifacts are the record (OPEN-10)                                                                   |
| TCK-14    | User guide                  | Slice 6                                                                                                           |

## Implementation acceptance

These criteria apply to the implementation owners and full initiative delivery, separately from architecture
completion above.

**TCK-3, the kit core:**

- Inputs, preflight, the three Solo sources (release, commit, tarball), the Falcon values file, the pod watcher, stage
  deadlines, result files and exit codes work as design §4, §9 and §10 describe.
- No run that left a default image in a target container can pass (negative control).
- No run can pass with a probe that did not run.
- The full compatibility workflow fits 30 minutes, including all build jobs, setup, deploy, the short profile,
  diagnostics, cleanup and export. Stage caps and the proposed three-minute reserve must be measured/reviewed;
  do not reuse the old three-minute load cap for five minutes of phase coverage. Results follow cleanup.
- Cover BN candidate + CN branch, CN candidate + BN branch, and SDK candidate + CN branch with immutable provenance
  and observed identity. Validate the proposed manifest and reject missing/conflicting artifacts without fallback.
  An agreed deferral must name its owner/link and reopen before the affected lane needs the missing combination.
- Use Solo's class/static-helper conventions, extend `.mjs` lint coverage and verify automated review scope.
  For action reuse, prove one cluster owner, isolated context/state and artifact/cleanup handoff before changing the
  verified Falcon path. The current action and placeholder build repository are not a ready-made TCK adapter.
- Unit tests cover the reason assignment for each stage, including `unknown`.

**TCK-6, distribution and releases:**

- First agree the co-release/PRD disposition, version metadata, publishing order, failure handling and responsible
  Solo/CI owners (OPEN-09). Do not assume a separate `tck-release.yaml` or kit tag is required.
- Verify the exact published kit/Solo artifacts and supported list before admission; no retroactive support.
- `GET /repos/hiero-ledger/solo/releases/latest` and its `install.sh` still resolve/install Solo, not a kit-only Release.
- Record whether the selected model needs the existing `tck` scope/tag-reader safeguards; review #6234/#6235 accordingly.
- `npm pack --dry-run` of Solo excludes `tck/`; sharing a release ref does not require npm packaging the action.

**TCK-5, short profile and resources:**

- Define and review all five workload classes, phase/warm-up/cooldown timing, pacing, adapter and measurements;
  target approximately five minutes total exercise time and keep the complete workflow inside 30 minutes.
- Do not use the existing concise mode or a first-five-minutes cutoff as full-phase coverage. A one-minute override
  alone still exceeds five minutes with fixed waits. Candidate-SDK traffic must be proven; a Java NLG run does not
  establish that the JS candidate generated its load.
- Capture/export phase completion, actual durations and container timelines/peaks, including failure evidence;
  missing phases cannot pass. OOM/restarts fail from day one. Ceiling activation still requires each lane's own
  two weeks of data, peak +25%, review and a new verified release pin.

**Each lane (TCK-4, TCK-7 to TCK-11):**

- The lane spec and the "what Solo assumes" inventory are merged and reviewed by the component team.
- The negative controls fail with the expected reasons.
- The caller job runs non-required, then required after the observation bar.
- Stage times are recorded in the lane spec.

Lane specifics:

- **TCK-11, JS SDK:** the kit replaces #4537's script; required in hiero-sdk-js (ruleset 650010); green on SDK `main`
  with the Solo release that carries #6228.
- **TCK-8, MN:** `solo-tck.yaml` runs on PRs and `main`, in RECORD mode; BLOCK mode becomes a lane option once the BN
  lane works. MN's `run-e2e` stays: the kit adds a check, it replaces none.
- **TCK-7, CN:** runs on CN PRs that change runtime code, beside MATS; reuses CN's build output (`data/apps`,
  `data/lib`); overrides the companions to the MN and BN prereleases CN `main` needs.
- **TCK-9, BN:** blocked until a CN writes SHA-256 blocks. BN PRs then build the `solo-dev` image with a unique version.
- **TCK-10, Relay:** a new capability, since the relay runs outside Solo today: Solo deploys the PR's relay image.

## Issue metadata

Parent #4272; tracker #6223. TCK-D*/TCK-* are plan identifiers, not assertions that each child issue has been filed.
Reuse the existing linked issues and PRs above before creating further sub-issues. Proposed new-issue labels are
`Testing Improvements` and `P1`; confirm implementation owners and board status with the Solo maintainers and the
component teams.

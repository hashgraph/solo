# Solo TCK - Implementation Plan

**Status:** Proposed, revised October 16, 2026. Child issues of [#4272](https://github.com/hiero-ledger/solo/issues/4272),
tracked in [#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md). Owners are proposals until the review
confirms them.

## Order of work

| Slice | Work                                                                                                                         | Depends on                                         | Exit evidence                                                                                          | Proposed owner                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 0     | Solo: merge and release #6228; add the `.releaserc` rule for scope `tck`, `tck/` to `.npmignore`, and `--match 'v[0-9]*'` to the `solo-prepare-release` skill | none                                               | A Solo release with #6228; the hiero-sdk-js Solo Compatibility job green on it                         | Dian                                  |
| 1     | Kit core and the `js-sdk` lane (TCK-3, TCK-4, TCK-6): move #4537's logic into `tck/`, add the pod watcher, load, results and `tck-release.yaml`; release `tck-v0.1.0` | 0                                                  | Release verification green, negative controls included; hiero-sdk-js calls the kit; measured times     | Dian, Ivaylo Georgiev                 |
| 2     | The `mirror-node` lane: lane spec and inventory with the MN team; `tck-v0.2.0`; an MN workflow PR, non-required. Explorer and Relay join the lane after #6225 | 1                                                  | Identity on an amd64 runner; the negative controls fail as expected; measured build and run times      | Solo team, with the MN team           |
| 3     | On Solo PRs, the Solo compatibility check with the released kit and the kit development check; the nightly workflow        | 1                                                  | Solo PRs run both checks; one nightly result per lane                                                  | Solo team                             |
| 4     | Required checks: `js-sdk`, then `mirror-node`                                                                                | 1, 2, and the observation bar (design §14)         | 10 working days, 20 runs, no false red, 90th percentile under 30 minutes; the rulesets changed          | SDK team; MN team with CI and release engineering |
| 5     | The `relay` and `consensus-node` lanes, then `block-node`                                                                    | 2; for BN, a CN that writes SHA-256 blocks, #6226 and #6202 | Each lane required by its team                                                                         | Solo team, with each component team   |
| 6     | Memory ceilings (TCK-5), the user guide (TCK-14), the Solo matrix reduction (TCK-12)                                         | 4                                                  | Ceilings in a kit release; the guide live; each dropped Solo E2E case mapped to a required lane         | Solo team                             |

The `js-sdk` lane goes first because our team owns both sides, it exercises every kit stage except image loading, and
it already found a real break. The MN lane follows in parallel as the first external pilot, because it proves image
injection.

## Issue map

The task IDs stay, so existing references keep working.

| ID        | Was                         | Now                                                                                                               |
| --------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TCK-D0    | Mirror the PRD requirements | Done in design §1, from #6223. Keith confirms.                                                                    |
| TCK-D1    | Version model               | Recommended in design §5: pinned, with explicit overrides                                                          |
| TCK-D2    | Repo home and tags          | Home decided; release mechanics in design §6                                                                       |
| TCK-D3    | Version variables           | Design §5.2 and §6.3                                                                                               |
| TCK-D4    | Deployment contract         | One spec and one "what Solo assumes" inventory per lane (design §7.4), first for `js-sdk` and `mirror-node`       |
| TCK-D5    | Interdependency rules       | Solo's `ComponentCompatibility` (#6179) plus #6202; the kit adds no rules                                          |
| TCK-D6    | Where the gate blocks       | Every lane is a PR check (design §14). Schedules are never the end state                                          |
| TCK-1     | Branch-build flow           | Solo already loads branch builds; the remaining Solo changes are in design §15                                    |
| TCK-2     | Suite selection             | The lane probes in design §7.3, plus each team's top breakages of the last six months as new probes               |
| TCK-3     | Runner                      | Slice 1                                                                                                           |
| TCK-4     | Core suites                 | The lanes: slices 1, 2 and 5                                                                                       |
| TCK-5     | Memory smoke                | Stability in every lane from slice 1; memory ceilings in slice 6                                                  |
| TCK-6     | Distribution                | Slice 1: composite action, `tck-release.yaml`, tags                                                               |
| TCK-6a    | Reusable workflow           | Deferred. The composite action is the interface; a reusable workflow can wrap it later                           |
| TCK-7..11 | Consumer rollout            | CN (slice 5), MN (slices 2 and 4), BN (slice 5), Relay (slice 5), JS SDK (slices 1 and 4)                         |
| TCK-12    | Shrink Solo's matrix        | Slice 6                                                                                                           |
| TCK-13    | Conformance record          | Deferred; CI artifacts are the record (OPEN-10)                                                                   |
| TCK-14    | User guide                  | Slice 6                                                                                                           |

## Done when

**TCK-3, the kit core:**

- Inputs, preflight, the three Solo sources (release, commit, tarball), the Falcon values file, the pod watcher, stage
  deadlines, result files and exit codes work as design §4, §9 and §10 describe.
- No run that left a default image in a target container can pass (negative control).
- No run can pass with a probe that did not run.
- The kit step keeps one 20-minute deadline: test stages stop at minute 17, and diagnostics, cleanup and the result
  use the last 3 minutes. The result is written after cleanup and records whether cleanup worked.
- Unit tests cover the reason assignment for each stage, including `unknown`.

**TCK-6, distribution and releases:**

- `tck-release.yaml` pushes a `tck-v*` tag after verification, and creates no GitHub Release.
- After the first kit release, `GET /repos/hiero-ledger/solo/releases/latest` still returns the newest Solo `v*`
  release, and `install.sh` from `releases/latest` still installs Solo.
- A kit-only commit does not cut a Solo release, and the `solo-prepare-release` skill still finds the last Solo
  release.
- `npm pack --dry-run` of Solo lists nothing under `tck/`.

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

Parent #4272, linked as native sub-issues. Labels `Testing Improvements` and `P1`. Slices 0 and 1 are Ready; the rest
stay in Backlog until their dependencies clear.

# Solo TCK - Design

**Status:** Revised October 19, 2026 after maintainer feedback. The October 16 decisions remain accepted;
October 19 confirmations, conditional agreements and remaining decisions are distinguished in §16. Feedback
received is not blanket architecture approval.
This document specifies the architecture; implementation is tracked separately in the plan. Statements marked
"proven" were run and retain their stated platform and coverage limits.
**Scope:** the architecture and its implementation handoff. Implementation and release ownership are separate (§14).
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272).
**Tracker:** [#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Overview:** [solo-tck-overview.md](./solo-tck-overview.md).
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md).
**Facts checked against:** Solo `main` at
[`bb9eb765`](https://github.com/hiero-ledger/solo/tree/bb9eb7659f7e894c496a66935d032d70157c9869) and npm
`@hiero-ledger/solo@0.93.0`, October 16, 2026.
**New SDK evidence:** a successful local pilot with SDK 2.90.1 and the unreleased #6228 Solo build (§11.1).

## 1. Requirements

From the PRD v0.2 (Notion), as summarized in #6223:

| ID  | Requirement                                                                        | Met in   |
| --- | ---------------------------------------------------------------------------------- | -------- |
| R1  | Black-box: test only through the Solo CLI and observable network behavior          | §3       |
| R2  | Cover CN, MN, BN, Relay, the JS SDK that Solo uses, and Solo itself                | §7       |
| R3  | PR-time checks, 15 to 30 minutes per invocation (G1)                               | §9       |
| R4  | Real traffic through mirror REST and, when deployed, Explorer REST and JSON-RPC    | §7       |
| R5  | A lightweight resource and stability check                                         | §8       |
| R6  | Original PRD: independent TCK versioning/cadence (G6); proposed co-release needs stakeholder alignment | §6, OPEN-09 |
| R7  | Explorer coverage through the deployed topology, with no separate Explorer check   | §7.3     |

Agreed constraints, also from #6223: the kit lives in the Solo repository; prerelease or branch-built companions are
acceptable; the MN pinger is turned off in the MN lane. The PRD has no JDK matrix, so v1 has none.

The epic asks for a required PR check on each component. Schedules can help during rollout, but they are never the
end state (§14).

## 2. Who owns what

**Solo owns everything inside `solo one-shot falcon deploy` and `destroy`:**

- creating the Kind cluster and installing its pinned kind, helm and kubectl in the verified one-shot path;
  action-based provisioning is a proposed alternative boundary, not a second cluster creator (§3);
- loading the candidate (`--component-image-archive`, `--local-build-path`) and setting `pullPolicy: Never`;
- every chart value, env var, port and default resource limit of each component;
- the default component versions of each Solo release (`version.ts`);
- the compatibility rules checked before deploy (`ComponentCompatibility`);
- fixing the Solo defects the kit finds, with team and tech-lead accountability and the qualified target in §10.5.

**The TCK owns everything around that command:**

- the caller interface, input checks, exit codes and result files (§4);
- choosing and recording versions (§5), and verification for the proposed co-release model (§6);
- writing the Falcon values file and the Solo command line;
- watching pods and failing fast (§10.3);
- proving the candidate runs, the required probes, the short load and the resource check (§7, §8);
- stage deadlines (§9), diagnostics and cleanup;
- one spec and one "what Solo assumes" inventory per lane (§7.4), reviewed by the component team.

**The caller (the component team) owns:**

- building the candidate from the PR commit, with a version unique to the run, in the shape its lane needs (§4.1);
- the compatibility workflow: trigger, path filter, runner and an end-to-end deadline across its jobs;
- the kit pin and when to bump it;
- deciding when the check becomes required, and the first look at a red run (§14).

**CI and release engineering own** the runners, repository rulesets (required checks and the bypass group), the fork
PR policy, and publishing permissions for the release model agreed in §6.

## 3. Architecture

```text
caller job (one job, one commit)
  1  build the candidate                                                      caller
  2  uses: hiero-ledger/solo/tck@<sha> # verified Solo release (proposed co-release ref)
       check inputs                                       exit 2 on a bad input
       preflight the runner                               exit 3 if it cannot run Solo
       install Solo in its own npm project, SOLO_HOME and KUBECONFIG
       write falcon-values.yaml, with the candidate in its component section
       solo one-shot falcon deploy                        Solo creates Kind, loads the candidate, deploys
       watch pods: fail fast on image errors, crash loops and OOM kills
       prove the candidate runs                           exit 1 if it does not
       run the lane's required probes, the short load and the resource check
       solo one-shot falcon destroy, then kind delete as a backstop
       write tck-result.json, junit.xml and the job summary; upload them with Solo's logs
  3  the step's exit code passes or fails the job, and the job is the PR check
```

Rules:

- **One deploy path:** `solo one-shot falcon deploy`. It appends every key of a component section to that
  component's command line, so the kit needs no other deploy command. Proven for MN, including the pinger upgrade
  step (local run 1c, Solo 0.93.0). Lanes turn components on and off with falcon's own flags (`--deploy-explorer`,
  `--deploy-relay`) or with section keys (the MN pinger, §12).
- **No Solo internals:** the kit imports nothing from Solo's `src/`. It runs the `solo` binary of the Solo package it
  installed, and reads cluster state with Solo's pinned `kubectl` from `SOLO_HOME/bin`.
- **No caller Helm values or extra Solo flags.** A setting a lane needs lives in the lane definition in the kit,
  where Solo and the component team review it. Every caller of a lane runs the same contract.
- **Isolation:** each run gets its own `SOLO_HOME`, `KUBECONFIG`, deployment and namespace (both `solo-tck`).
  One-shot always names its Kind cluster `solo-cluster`, so the kit refuses to start if one exists, rather than
  deleting it.
- **No secrets** and no write permissions. The kit runs with the caller's `contents: read`.
- **Reuse before duplication:** evaluate [hiero-solo-action](https://github.com/hiero-ledger/hiero-solo-action/blob/58e17ebca216e1fa0dccb4982b63e9eb41614c17/action.yml)
  before adding another deploy wrapper. It creates Kind and deploys components; current Solo can
  [reuse a reachable context](https://github.com/hiero-ledger/solo/blob/53ac1aded2ea5f71814a90b4bd244230234602a6/src/core/cluster-task-manager.ts#L562),
  but blind composition can reset shared state or collide with an existing deployment. Select one cluster
  owner and prove isolated context, artifact injection and cleanup; a setup-only adapter is not currently available.
  [solo-build-actions](https://github.com/hiero-ledger/solo-build-actions/blob/e8739988c7cdf7a95b0d9ae1510e0f4fb1d0eb5e/README.md) is currently under construction, not a
  usable cluster/build action. Reuse or extension is proposed for review; the verified CLI path remains the reference.
  Component build-action reuse can follow later without changing the caller's artifact contract (§12).
- **Proposed Node runtime (OPEN-07):** the kit and Solo would run on Node 22.x, the runtime Solo documents (README: `lts/jod`), and
  release verification runs on it. If the runner's Node is not 22.x, the action installs Node 22 with
  `actions/setup-node`, which also changes Node for the caller's later steps. Solo's own CI uses Node 24; moving the
  kit to 24 requires confirmation, verification and a new verified release pin (§6).

Package layout:

```text
tck/
  action.yml           composite action; runs the kit and Solo on Node 22.x
  package.json         the kit's version and its own dependencies (the probe SDK)
  package-lock.json
  solo-versions.json   {"default": "0.94.0", "supported": ["0.92.0", "0.94.0"]}
  CHANGELOG.md         kit changes; final release-note placement follows section 6
  src/                 plain ESM JavaScript, no build step
  specs/               one test spec and one "what Solo assumes" inventory per lane
  test/                unit tests, and the negative controls run before each release
```

Plain ESM JavaScript remains proposed so the action runs as checked out. It must follow Solo's class-based
conventions: behavior on classes, static/private helpers as appropriate, and no exported free functions. Include
`.mjs` in applicable ESLint checks and align automated review instructions with the same rules before implementation
acceptance. Current [lint ignores](https://github.com/hiero-ledger/solo/blob/53ac1aded2ea5f71814a90b4bd244230234602a6/eslint.config.mjs#L261)
exclude `.mjs`; implementation must extend coverage and demonstrate that violations fail. This update changes no
lint configuration or review skill. Node 22 and the final implementation language
remain review choices (OPEN-07). Excluding `tck/` from the Solo npm package is separate from sharing a release ref.

## 4. Caller interface

### 4.1 Inputs

| Input                    | Required for              | Meaning                                                                                 |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------------- |
| `component`              | all                       | The lane: `js-sdk`, `mirror-node`, `block-node`, `relay`, `consensus-node` or `solo`    |
| `candidate-version`      | MN, BN, Relay, CN         | Semver of the candidate, unique to the run and built into it (§5.4)                     |
| `candidate-image`        | MN, BN, Relay             | Image reference whose tag equals `candidate-version`. For MN, the prefix Solo expands   |
| `candidate-archive`      | with `candidate-image`    | A `docker save` archive holding every candidate image                                   |
| `candidate-chart-dir`    | MN; optional for BN, Relay | The PR's chart folder, passed as the lane's `--*-chart-dir` flag                       |
| `candidate-packages`     | `js-sdk`                  | Folder of `pnpm pack` tarballs: the SDK and the workspace packages it depends on        |
| `candidate-build-path`   | `consensus-node`          | The built `data` folder (`apps` and `lib`), passed as `--local-build-path`              |
| `candidate-solo`         | `solo`                    | The Solo PR build, as an `npm pack` tarball                                              |
| `solo-version`           | no                        | Default: the kit's pinned Solo release. A supported release or a full Solo commit SHA (§5.2) |
| `consensus-node-version`, `mirror-node-version`, `block-node-version`, `relay-version`, `explorer-version` | no | Companion overrides (§5.3). Not allowed for the lane's own component |

**Proposed additional input, not yet agreed or implemented:** `companion-builds`, a path to a manifest of
branch-built companions. Each entry names a non-candidate component, source repository, full commit SHA and unique
version, plus a CN `build-path` or an image reference and archive for an image-based companion; chart inputs are
included where the lane needs them. Reject duplicate version overrides, an entry for the candidate's component,
missing provenance and artifact shapes Solo cannot deploy. Keep this a typed artifact contract, not extra flags.
Solo/CI and the affected component teams must review the exact schema and CLI wiring (OPEN-11, #6223).

For MN, `candidate-image` is the prefix Solo expands into the module images, for example
`gcr.io/mirrornode/hedera-mirror:0.166.0-tck.38712.1` becomes `gcr.io/mirrornode/hedera-mirror-importer:0.166.0-tck.38712.1`
and so on ([`mirror-node-module-images.ts`](https://github.com/hiero-ledger/solo/blob/bb9eb7659f7e894c496a66935d032d70157c9869/src/commands/mirror-node-module-images.ts#L19-L26)).

### 4.2 Outputs and files

| Output        | Values                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| `outcome`     | `pass` or `fail`                                                              |
| `reason`      | empty on a pass; `candidate`, `invalid`, `environment`, `kit` or `unknown` (§10.2) |
| `result-file` | path of `tck-result.json`                                                     |

The kit uploads these files as the artifact `solo-tck-<component>-<run attempt>`:

- `tck-result.json`: kit version, lane, outcome, reason, failed stage and probe; requested versions (inputs, defaults
  and overrides); observed versions (every container image from `kubectl`, the chart versions Solo records); the
  candidate identity evidence; source SHAs and observed identities of branch-built companions; every probe with its
  result and time; resource peaks; stage times and the load profile/phase configuration and captured measurements.
- `junit.xml`: one test case per probe, for CI test views.
- Solo's logs and, on a failure, pod state, events and `solo deployment diagnostics all`.

The job summary shows the same table in markdown. On a failure it also shows a ready-to-file Solo issue body. The kit
never files issues itself.

### 4.3 Exit codes

| Exit | Reason        | Meaning                                                                                    |
| ---- | ------------- | ------------------------------------------------------------------------------------------ |
| 0    |               | Pass: every required probe passed                                                          |
| 1    | `candidate`   | The evidence names the candidate: its container crashed, was OOM-killed, had an image error or never became Ready; the identity check failed; or a probe the lane spec marks as the candidate's failed |
| 2    | `invalid`     | Bad inputs, an unsupported Solo version, or a version tuple Solo rejects before deploy     |
| 3    | `environment` | The run failed before the candidate was touched, or a non-candidate image cannot be pulled |
| 4    | `kit`         | The kit itself failed, for example an unexpected error or a result it could not write      |
| 5    | `unknown`     | The run failed, and the evidence does not point at one part                                |

Every non-zero exit fails the step. There is no neutral or skipped result.

## 5. Version selection

### 5.1 Four versions per run

| Version    | Selected by              | Default                                          | In the result                |
| ---------- | ------------------------ | ------------------------------------------------ | ---------------------------- |
| Kit        | the caller's `uses:` ref | none, callers pin                                | `kit`                        |
| Solo       | `solo-version`           | `default` in the kit release's `solo-versions.json` | `solo`, with its source   |
| Companions | the override inputs      | the defaults of the selected Solo release        | requested and observed       |
| Candidate  | the caller's build       | none                                             | `candidate`, with its proof  |

A PR's result changes only through the PR's own diff: the candidate, a kit bump or an override. Nothing floats on PR
runs. This answers the review question on hybrid or pinned versions (§16): the candidate is the PR build, and every
other version is pinned but can be overridden explicitly.

### 5.2 Solo version

- **A release** (`0.94.0`) must be in the kit release's `supported` list. Otherwise the run exits 2 and names the
  supported versions.
- **A commit SHA** makes the kit build Solo from `hiero-ledger/solo` at that commit (`npm ci`, build, `npm pack`) and
  install the tarball. This is the planned-break path: a component PR that needs an unreleased Solo fix pins the fix
  commit in its own version-controlled workflow diff, and removes that pin once the fix ships. This is the only
  override for a planned break. The result marks the run as unreleased Solo. It skips the `supported` check, since
  there is no release to check. These conditions were accepted in the October 16 review (§16).

A Solo branch is testable by resolving it to a full commit SHA and using that input; the build and resolved SHA
are recorded. A moving branch name is not a reproducible required-check pin. A direct branch-ref convenience input
can be a linked follow-up after its resolution semantics are agreed (OPEN-02). Solo PRs and nightly runs must also
exercise branch/main builds (§13); released default does not exempt Solo from testing itself.

### 5.3 Companion versions and overrides

- **Default:** the kit passes no version flag, so Solo deploys its own defaults for that release. That is what Solo
  users get from that release, and what Solo's CI tests.
- **Override:** an input such as `mirror-node-version: v0.165.0-alpha2` becomes the matching top-level falcon flag.
  Published releases and prereleases remain available. Branch-built companions are also needed: a BN candidate
  with a CN branch, the reverse pairing, and an SDK candidate with a CN fix branch. The proposed `companion-builds`
  contract (§4.1) keeps the candidate distinct while recording every companion's immutable source and artifact.
  It must prove each supplied companion actually ran; missing support fails explicitly, never falls back to a
  release. These combinations need lane tests and component review. They are not claimed implemented or an accepted
  v1 deferral; any deferral needs an agreed owner, linked follow-up and return gate before the affected lane ships.
- **Solo's rules still apply:** one-shot validates the whole tuple before it deploys
  ([orchestrator L333-L338](https://github.com/hiero-ledger/solo/blob/bb9eb7659f7e894c496a66935d032d70157c9869/src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.ts#L333-L338)),
  so an invalid override exits 2 with Solo's message. The kit adds no compatibility rules of its own (TCK-D5).
- Overrides live in the caller's workflow file, so the caller's review covers them, and the result lists each one.

### 5.4 Candidate version

The caller builds the candidate with a semver version unique to the run and tags its images with it:
`<next release>-tck.<run id>.<run attempt>`, for example `0.166.0-tck.38712.1`.

- **Unique:** no registry has the tag. With `pullPolicy: Never` and a fresh cluster, a container with that tag can
  only be the loaded candidate (§7.2).
- **Below the release it leads to:** Solo's `SemanticVersion` follows semver, so `0.166.0-tck.1` sorts above
  `0.166.0-0` but below `0.166.0`. A gate written with `-0`, as 14 of the 16 `MINIMUM_*` gates in `version.ts` are,
  treats the candidate as the next release. A gate written without `-0` at exactly that release would treat it as
  older; today the two such gates (`MINIMUM_MIRROR_NODE_VERSION_FOR_ARM64_WEB3_NATIVE_IMAGE = 0.155.0` and
  `MINIMUM_SOLO_CHART_VERSION = 0.64.0`) sit far below current candidates. The convention does not preserve every
  gate by itself: each lane spec lists the gates that apply to its component, and the kit's unit tests check the
  convention against them. New component gates in Solo should use the `-0` form.
- **Built with the version, not retagged:** BN uses its image tag as the install path inside the image, so a
  retagged BN image cannot start (local run 2b,
  [block-node L1058-L1066](https://github.com/hiero-ledger/solo/blob/bb9eb7659f7e894c496a66935d032d70157c9869/src/commands/block-node.ts#L1058-L1066)).
  MN tolerates a retag, but one rule for all lanes is simpler.
- The kit passes it as the component's version flag, for example `--mirror-node-version v0.166.0-tck.38712.1`. For MN
  that flag is also the chart version, so the MN lane also needs `candidate-chart-dir` (local run 1a).

### 5.5 Recording

`tck-result.json` holds what was requested and what ran: the inputs and defaults, every container image read from
`kubectl`, and the chart versions Solo records in its remote config (`solo one-shot info` prints them). A version
lookup that fails is a failure, never a silent fallback. PR lanes never use `--edge`.

## 6. Releases and supported Solo versions

### 6.1 Proposed co-release model

October 19 feedback supports shipping the kit with each Solo release instead of separate `tck-v*` releases.
Remaining stakeholder alignment, the PRD's independent-version/cadence requirement (R6), publishing responsibility
and the release sequence still need agreement (OPEN-09). This is the proposed direction, not finalized mechanics.

- Callers would pin the commit of a verified Solo release that contains `tck/`, with its `v*` release name in a comment.
  The examples use placeholders for that verified ref; they do not claim a released kit exists.
- No separate kit GitHub Release may take over Solo's Latest release. The existing Solo release and its `install.sh`
  must remain what `releases/latest` resolves. Shipping the action at the same ref does not require npm packaging it.
- Before publishing that kit ref, verify its supported Solo list and exact artifacts (§6.3, §6.4). Publishing/tag order,
  candidate-artifact equivalence and failure handling need release-owner agreement; do not add support after the fact.
- Reconcile [#6234](https://github.com/hiero-ledger/solo/issues/6234) and
  [#6235](https://github.com/hiero-ledger/solo/pull/6235) with this choice. npm exclusion remains useful; the `tck` scope
  rule, independent tag workflow and tag-reader safeguard are conditional on the final model. Do not assume the
  existing release-isolation implementation is either fully accepted or entirely obsolete.

### 6.2 Changes and caller pins

A caller's behavior changes only when it changes its pin or an explicit override. Release notes must identify
input/output changes, new probes, stricter limits, runtime changes and supported-list changes. The former independent
kit MAJOR/MINOR/PATCH rules are not a settled contract under co-release; agree API migration and version metadata
before publishing. An incompatible Solo/kit change needs a reviewed transition (§13), not a silently replaced pin.

### 6.3 Supported Solo versions

- `tck/solo-versions.json` holds `default` and `supported`.
- A Solo release enters `supported` only if it has every capability its lanes use and every implemented lane passed
  release verification with it. Examples include image-archive loading (#5950, first released in 0.91.0) and six-module
  MN expansion (#6112, first released in 0.93.0); capabilities alone do not establish support.
- Verification must pass before admission. A later run cannot add support retroactively to an existing kit ref;
  a changed list needs a new verified release pin. This October 16 condition still applies to the co-release proposal.
- Solo's support window only identifies releases worth verifying. A failing release stays out. An older caller may
  retain an older verified pin; branch/SHA diagnostics remain explicitly unreleased (§5.2).
- Moving `default`, admitting a Solo release and publishing the shared ref must be one reviewed release plan. The
  former automatic independent kit release after every Solo release is superseded by the pending co-release decision.

### 6.4 Release verification

The verification contract stays required regardless of the eventual publishing workflow:

1. Identify the exact kit ref, metadata, Solo artifacts and supported list being verified.
2. Run every implemented lane against every supported Solo release with released components as candidates. Verify
   identity using the same archive/build contract as callers; no untested retagging substitutes for a real build.
3. Run the negative controls. Each must fail with the expected reason:

   | Control                                      | Expected        |
   | -------------------------------------------- | --------------- |
   | A module image missing from the archive      | exit 2, `invalid` |
   | A candidate image whose process exits at start | exit 1, `candidate`, within 2 minutes |
   | A lane whose deploy leaves a default image in a target container | exit 1, `candidate` (identity) |
   | A probe that cannot find its transaction on the mirror node | exit 1, `candidate` |
   | An unsupported Solo version                  | exit 2, `invalid` |
   | A companion override Solo rejects            | exit 2, `invalid` |
   | Missing branch-companion input/artifact | exit 2, `invalid` |
   | Supplied branch companion not observed running | fail, `unknown` until attributed; no release fallback |

4. Permit publication only for the artifacts/ref verified above, preserving Solo's Latest release and installer.

A `tck-release.yaml` workflow and separate tag permission are no longer unconditional requirements. Solo release
owners and CI/release engineering must agree the actual workflow and permissions before the first kit publication.

## 7. Lanes and required probes

### 7.1 One lane per component, and it always deploys the candidate

`component` selects exactly one lane. There is no suite, scope or topology input on PR lanes, so a caller cannot pick
a set of tests that never deploys its component. Each lane's topology always deploys the candidate: the BN lane always
turns the block node on, for example. A run in which any target container does not run the candidate fails with exit 1.

No skips: the kit release fixes each lane's probe list. A probe that cannot run yet is not in the lane until it can,
and it arrives through a new verified release pin. The result lists every probe, and a probe that did not run counts as failed.

This resolves the review problem of passing without deploying the candidate
([r4257792780](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792780)).

### 7.2 Required in every lane

| ID  | Probe       | Passes when                                                                                    |
| --- | ----------- | ---------------------------------------------------------------------------------------------- |
| P1  | Inputs      | Inputs are valid and the Solo version is supported, before any cluster exists                  |
| P2  | Deploy      | `solo one-shot falcon deploy` exits 0 within the deploy deadline                               |
| P3  | Identity    | Every target container runs the candidate (rules below)                                        |
| P4  | Stability   | All pods Ready; no OOM kill at any time; no restart from the end of the deploy to the end of the run |
| P5  | Consensus   | A new transfer and a new topic message reach SUCCESS receipts                                  |
| P6  | Mirror      | Mirror REST returns that transfer and that message with the same content within 120 seconds    |
| P7  | Lane probes | The lane's own probes (§7.3)                                                                   |
| P8  | Load        | The short load completes, and P4 and P6 still hold after it (§8)                               |

Identity rules for P3:

| Lane          | Proof                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| MN, BN, Relay | Each target container's image is the candidate reference with the unique tag, with `imagePullPolicy: Never` |
| CN            | The jars in `data/apps` and `data/lib` of every node pod have the same hashes as the candidate's        |
| JS SDK        | Solo's npm project holds exactly one copy of each candidate package, its lock `integrity` equals the tarball's sha512, and Solo's `require` and `import` both resolve that copy (proven in hiero-sdk-js#4537) |
| Solo          | The installed Solo has the PR build's version, and its lock `integrity` equals the tarball's            |

### 7.3 Lane probes

| Lane             | Topology                                                                                  | P7 probes                                                                                                                                                                                 | State |
| ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `js-sdk`         | CN and MN; no Explorer or Relay                                                           | Solo runs on the candidate SDK: the deploy itself (node client and initial accounts), `solo ledger account create`, `solo ledger account update` with a new key. The candidate SDK as a client: the account holds the new key and signs the P5 transactions. | Local SDK 2.90.1 pilot passed with the #6228 source (§11.1). Separate local Falcon runs passed in #6238; released-fix adoption and Linux network acceptance remain (plan checkpoint) |
| `mirror-node`    | CN and the candidate MN (five running modules), pinger off. Explorer and Relay off until #6225 is fixed | REST transaction and topic message by ID; the gRPC module streams the topic message to a subscriber; one rest-java and one web3 request that read the run's data (endpoints agreed with the MN team in the lane spec). After #6225: Explorer REST returns the run's transaction, and the Relay answers `eth_blockNumber` and relays a signed transfer. | Identity proven locally (run 1c). Pinger off through a section key, proven by a deploy on October 16 (§12). No Solo blocker for the lane itself |
| `block-node`     | A CN that writes SHA-256 blocks, the candidate BN, and MN reading from that BN           | The path through the BN: with a block node present, Solo turns the MN importer's record download off and points the importer at the BN ([mirror-node L393-L532](https://github.com/hiero-ledger/solo/blob/bb9eb7659f7e894c496a66935d032d70157c9869/src/commands/mirror-node.ts#L393-L532)), so the P6 mirror read-back can only pass if the transaction went through the candidate BN. The lane checks that wiring (record download off, the importer's only block node is the candidate). Also: blocks advance and verify (the BN team names the signal), and a block query returns the block that holds the run's transaction | Blocked: no released CN writes SHA-256 blocks; #6226, #6202 |
| `relay`          | CN, MN and the candidate Relay                                                            | `eth_chainId`, `eth_blockNumber`, a signed EVM transfer and its receipt through the candidate, a WebSocket `newHeads` subscription                                                        | Relay CI builds an image per PR but runs the relay outside Solo today |
| `consensus-node` | The candidate CN and MN; BN when that CN version needs it, with MN reading from it as in the `block-node` lane | P5 and P6 through the candidate; with a BN, the read-back goes through the BN and the BN verifies the blocks                                                                       | CN `main` needs MN 0.165 and BN 0.45 overrides |
| `solo`           | Solo defaults                                                                             | The `js-sdk` lane's Solo-side probes, run on Solo's own pinned SDK                                                                                                                         | The Solo compatibility check on Solo PRs, run with the released kit (§13) |

**Explorer** has no lane of its own (R7). October 19 maintainer feedback confirms that its API inside the MN lane
is sufficient. Add the REST probe once Explorer can be deployed beside an MN candidate (#6225); that issue does not
block the initial MN lane, and this confirmation does not claim the Explorer probe already runs.

### 7.4 Lane specs and the "what Solo assumes" inventory

Each lane has a spec in `tck/specs/<lane>.md`: each probe, its scenario and its pass condition, written like the SDK
TCK's test specifications. Each lane also has an inventory of what Solo assumes about the component: the chart
values, env vars, ports, paths and health endpoints Solo sets or reads, each with its Solo source line. The component
team reviews both, because those are the things it can break by accident. Together they are TCK-D4's deployment
contract, written one lane at a time.

## 8. Resource and stability check

Always required (P4 and P8): no OOM kill in any pod at any time, and no container restart from the end of deploy to
the end of the run. The kit owns the load. These October 16 requirements remain unchanged.

October 19 feedback corrects the mini-perf method: shorten every performance phase to target about five minutes
total; do not stop the long suite five minutes in. The
[source suite](https://github.com/hiero-ledger/solo/blob/53ac1aded2ea5f71814a90b4bd244230234602a6/test/e2e/commands/performance.test.ts)
covers Token, NFT, Crypto, HCS and Smart Contract phases. Its concise mode skips phases and is not an all-phase profile. A one-minute setting per phase still adds
warm-up/cooldown time; it is not evidence of a five-minute end-to-end profile.

**Proposed, to be measured and reviewed:** a kit-owned short profile preserving those phase classes and assertions,
with explicit durations, pacing and warm-up/cooldown inside the approximately-five-minute exercise target; setup
and export still count toward §9. Reuse the
[perf workflow](https://github.com/hiero-ledger/solo/blob/53ac1aded2ea5f71814a90b4bd244230234602a6/.github/workflows/flow-performance-test.yaml)
measurement/export conventions where suitable. The exact settings, artifact fields and runner load adapter are pending
(OPEN-05); the former fixed two-minute/20-TPS load is not the agreed replacement. The `js-sdk` lane must continue to
exercise the candidate SDK; other lanes use the kit's pinned probe SDK. Reusing workload definitions does not
silently introduce a separate load-generator pod or bypass the candidate SDK. Re-run P6 for the final load transaction.

- Sample container memory and CPU through the run; record profile revision, actual phase times, per-container peaks
  and the captured measurements. The source workflow's exports are a starting point, not data already captured here.
- Memory ceilings remain report-only initially. After two weeks of each lane's `main` runs, use its highest observed
  peak plus 25%, reviewed by the component team and shipped at a new verified pin. Compare phase-aligned short-profile
  data with the perf measurements; a single five-minute offset from the long run is not a valid reference.
- After ceiling activation, exceeding one fails the run. CPU stays report-only. OOM/restart failures do not wait for
  the two-week observation or for a ceiling decision.

Resource limits remain Solo's defaults; callers cannot raise them. A released component that cannot run within
those defaults on the CI runner needs a Solo fix before the lane becomes required. Prior local arm64 MN OOMs are
not amd64 results. Profile implementation, phase measurements and ceiling calibration are delivery work, not
architecture completion evidence.

## 9. Runtime budget

**One end-to-end compatibility-workflow budget:** 30 minutes, including candidate and companion builds, setup,
deploy, probes, the complete short profile, diagnostics, cleanup and artifact/result export. October 19 feedback
confirms the full workflow scope. Splitting work into jobs does not reset that budget; a per-job timeout alone is
insufficient for a multi-job caller. The examples keep compatibility work in one job with `timeout-minutes: 30`.

**Internal allocations remain proposed.** The earlier nine-minute build / twenty-minute kit split and three-minute
load cap were not measured for an all-phase profile. Do not retain that load cap while claiming five minutes of
phase coverage. The implementation owners must measure and agree stage caps that fit the full 30 minutes, including
build dependencies. Proposed: reserve the last three minutes for diagnostics, cleanup and results, stop test work
before that reserve and fail any incomplete run. That reserve and the exact stage caps still need confirmation.

The SDK 2.87.0 baseline took 6.3 minutes, without the new load profile. The SDK 2.90.1 local proof (§11.1) excludes
builds and Kind preparation. Neither establishes the new full-workflow timing. Record stage and workflow totals;
write `tck-result.json`, `junit.xml` and the summary after cleanup so cleanup success is represented. A cancelled or
timed-out run is incomplete and cannot pass.

The MN lane must follow the accepted sequence before requesting an exception:

1. Measure the complete six-image build and workflow.
2. Try one Gradle invocation with the build cache.
3. Try a larger runner.
4. If still over budget, present the measurements for a maintainer exception decision or a build improvement.

No exception is approved. A slow build does not automatically extend the deadline. Runtime measurements and any
explicit exception belong to implementation follow-up (OPEN-05), separate from architecture acceptance.

## 10. Verdict and failure handling

### 10.1 Only a complete pass is green

There are two outcomes. A run passes only if every required probe passed; anything else exits non-zero. No reason makes
a failure non-blocking: the reason routes the triage, it never gates.

### 10.2 How the reason is assigned

| Reason        | When                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `invalid`     | P1 failed, or Solo rejected the version tuple before deploying                                                             |
| `environment` | The preflight or the Solo install failed; or the deploy failed before any candidate pod existed, with a known environment error (Kind create, a registry timeout); or a non-candidate image cannot be pulled |
| `candidate`   | The evidence names the candidate: a candidate container that is not Ready in time, crash-loops, is OOM-killed or has an image error; a failed identity check; a failed probe that the lane spec marks as the candidate's, after the probes before it passed (for example a mirror REST read in the MN lane after the consensus transaction succeeded) |
| `kit`         | An unexpected error in the kit's own code, or evidence it could not write                                                  |
| `unknown`     | Every other failure: the run is red, but the evidence does not point at one part                                           |

Reporting and attribution are separate. Every reason fails the check, so a wrong reason can never turn into a pass.
The reason only says where the evidence points; `unknown` says that it points nowhere yet, and people attribute the
failure (§10.5).

Until Solo has a distinct exit code for invalid input (#6223), the kit recognizes Solo's compatibility error by its
message.

Worked examples:

- **An MN PR adds a DB migration that crashes the importer** (the example on
  [r4257792771](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792771)). The importer container enters
  `CrashLoopBackOff`. The pod watcher sees the candidate container's second restart and fails the run at once: exit 1,
  reason `candidate`, stage deploy, with the importer's last log lines in the summary. Once the check is required, it
  blocks the PR.
- **Docker Hub rate-limits the MinIO pull** in the same kind of deploy. MinIO is not a candidate image, so the reason is
  `environment`. The check is still red, and the summary says to re-run it.
- **SDK 2.90.1 inside Solo 0.93.0:** the deploy fails at node start with `NodeAccountId not recognized: 0.0.2`. The
  candidate is in use (P3 passed), but the evidence does not say which side is wrong: the SDK started rejecting unknown
  node IDs, and Solo relied on the old behavior. The reason is `unknown`, and the check is red. People attributed it
  to Solo, and #6228 fixes it.

This resolves the review problem of deployment failures becoming non-blocking infrastructure failures
([r4257792771](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792771)).

### 10.3 Failing fast

Solo waits up to 10 minutes for some events: a BN candidate stuck in `ErrImageNeverPull` took 607 s to fail (#6227).
The kit watches pod events during the deploy:

- `ErrImageNeverPull` or `InvalidImageName` on any container: fail now.
- A candidate container's second restart, or any OOM kill: fail now.
- `ImagePullBackOff` on a non-candidate image for 5 minutes: fail as `environment`.

On a fast fail the kit stops Solo's process group, collects diagnostics, then cleans up.

### 10.4 Retries

The kit retries only work done before the candidate is touched: the npm install, and a deploy that failed with
reason `environment` before any candidate pod existed (once, after a destroy). It never retries after a candidate pod
existed, because that would hide a flaky candidate. People re-run `environment` failures with "Re-run failed jobs".

### 10.5 When red is not the candidate's fault

1. **Reason `environment`:** re-run.
2. **Reason `unknown`, or a `candidate` the team disputes:** compare with the lane's baseline, which is the same kit
   and Solo with the component's last release as the candidate (the nightly run in §13, or the kit's release
   verification). A red baseline says the candidate is probably not the cause. It does not say whether Solo, the kit,
   a companion or the environment is, so the Solo team attributes the failure.
3. The team opens a Solo issue with the body from the job summary.
4. October 19 feedback endorses a small bypass group per caller with the Solo issue linked. The check stays red;
   bypass is a repository-governance action, not a kit outcome. Membership, ruleset permissions and audit procedure
   still need CI/release engineering and the consumer team's agreement before a check becomes required.
5. The Solo team and tech lead are accountable for fixes. Two working days is an initial fix/workaround target if
   realistic for most cases, adjustable with experience; it is not an unconditional service guarantee. The separate
   one-working-day response proposal was not explicitly confirmed. Release owners and the agreed publication model
   deliver the fix, or the caller temporarily pins its full Solo commit (§5.2).
6. **Planned breaks**, where a component change needs a Solo change: Solo merges its change first, and the component
   PR pins `solo-version` to that commit until the Solo release.

## 11. Caller example: a JS SDK pull request

This job replaces the Solo Compatibility job of hiero-sdk-js#4537. The caller keeps its build steps; the kit replaces
the install, deploy, probe, diagnostics and destroy steps.

```yaml
# hiero-sdk-js: dedicated .github/workflows/solo-tck.yaml (proposed)
  solo-tck:
    name: Solo TCK
    runs-on: hiero-client-sdk-linux-large
    timeout-minutes: 30
    steps:
      - name: Harden Runner
        uses: step-security/harden-runner@ccd8616d44fd3846e67624a50d5aad6d37bf2d25 # v2.22.1
        with:
          egress-policy: audit

      - name: Checkout Code
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          submodules: recursive

      - name: Install Task
        uses: arduino/setup-task@c0bc642852239c2689f73f4ea6459c29405f3c52 # v3.0.0
        with:
          version: 3.35.1

      - name: Install PNPM
        uses: step-security/action-setup@8beec6731697ff7a074963eaa56f6d8e02e1c399 # v6.1.0
        with:
          version: 9.15.5

      - name: Setup Node
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: "22"
          cache: pnpm

      # Candidate build. pnpm pack turns workspace:* into real versions, so the SDK
      # tarball asks for the proto and cryptography tarballs packed next to it.
      - name: Build and pack the SDK
        run: |
          task build
          mkdir -p "${RUNNER_TEMP}/candidate"
          for dir in packages/proto packages/cryptography .; do
            (cd "${dir}" && pnpm pack --pack-destination "${RUNNER_TEMP}/candidate")
          done

      # Deployment, verification, cleanup and results.
      - name: Solo TCK
        uses: hiero-ledger/solo/tck@<verified Solo release SHA> # verified release containing the SDK lane
        with:
          component: js-sdk
          candidate-packages: ${{ runner.temp }}/candidate
```

What the kit does:

1. **Inputs (P1).** It finds `hiero-ledger-sdk-2.90.1.tgz`, `hiero-ledger-proto-2.32.0.tgz` and
   `hiero-ledger-cryptography-1.23.0.tgz`, and reads the candidate version 2.90.1 from the SDK tarball. Solo is the
   kit's default; here 0.94.0 stands for the first Solo release that carries #6228. There are no overrides, so CN and
   MN are that Solo release's defaults.
2. **Preflight.** Docker answers; at least 6 CPUs and 12 GiB of memory (Solo's README minimum) and 20 GiB of free
   disk; no Kind cluster named `solo-cluster`. `SOLO_HOME` and `KUBECONFIG` go under `$RUNNER_TEMP/solo-tck`.
3. **Install and identity (P3), before any cluster exists.** In `$RUNNER_TEMP/solo-tck/solo` it writes:

   ```json
   {
     "private": true,
     "dependencies": {"@hiero-ledger/solo": "0.94.0"},
     "overrides": {
       "@hiero-ledger/sdk": "file:<runner temp>/candidate/hiero-ledger-sdk-2.90.1.tgz",
       "@hiero-ledger/proto": "file:<runner temp>/candidate/hiero-ledger-proto-2.32.0.tgz",
       "@hiero-ledger/cryptography": "file:<runner temp>/candidate/hiero-ledger-cryptography-1.23.0.tgz"
     }
   }
   ```

   Then it runs `npm install` and checks that `package-lock.json` holds one copy of each package, with `integrity`
   equal to the tarball's sha512, and that Solo's own `require` and `import` of `@hiero-ledger/sdk` resolve that copy.
4. **Deploy (P2).** The values file has no component section, because the candidate is inside Solo:

   ```bash
   solo one-shot falcon deploy --values-file falcon-values.yaml \
     --deployment solo-tck --namespace solo-tck \
     --deploy-explorer=false --deploy-relay=false --metrics-server --quiet-mode
   ```

   Solo creates Kind and deploys CN and MN, using the candidate SDK for its node client and initial accounts. The
   explicit namespace matters on Kubernetes-pod runners: without it, Solo takes the runner pod's namespace (found in
   #4537). The kit watches pods (§10.3).
5. **Probes (P4 to P7).**

   ```bash
   solo ledger account create --deployment solo-tck --hbar-amount 100
   solo ledger account update --deployment solo-tck --account-id <new account> \
     --ed25519-private-key <key made by the candidate SDK>
   ```

   Then, with the candidate SDK as that account: `AccountInfoQuery` shows the new key; a transfer and a topic message
   get SUCCESS receipts; mirror REST returns both (`/api/v1/transactions/<id>`, `/api/v1/topics/<id>/messages/<seq>`).
6. **Load (P8).** Run the reviewed all-phase short profile (§8) through the candidate SDK, including its phase
   assertions, final mirror read-back and measurement export. Exact phase settings and timings are pending; the
   earlier two-minute/20-TPS example does not prove this coverage. No restart or OOM is allowed, and peaks are recorded.
7. **Cleanup.** `solo one-shot falcon destroy --deployment solo-tck --quiet-mode`, then
   `kind delete cluster --name solo-cluster` if anything is left.
8. **Results.** `tck-result.json`, `junit.xml`, the job summary and the artifact `solo-tck-js-sdk-1`.

Results:

- **With Solo 0.93.0** (`solo-version: 0.93.0`, the situation today): the deploy fails at node start with
  `NodeAccountId not recognized: 0.0.2`, so exit 5, reason `unknown`, stage deploy. Red is right: SDK 2.89.0 and newer
  cannot run inside Solo 0.93.0, as #4537 shows. The reason is `unknown` because the evidence does not say which side
  is wrong; people attributed it to Solo (§10.2).
- **With the first verified Solo release that carries #6228:** the lane must pass the complete contract. Full timing
  needs measurement with the all-phase profile; the former 9-to-10-minute estimate is not evidence for that workload.
  The local candidate SDK pilot below exercises a smaller contract.

Job summary for the first case:

```text
Solo TCK <verified release ref> | js-sdk | FAIL (unknown) at deploy
Solo 0.93.0 (input)   CN v0.77.2 (Solo default)   MN v0.163.0 (Solo default)
Candidate @hiero-ledger/sdk 2.90.1, one copy, lock integrity matches, require and import resolve it

P1 inputs     pass    0 s
P3 identity   pass   10 s
P2 deploy     fail  243 s   consensus node start: Failed to set up node client: NodeAccountId not recognized: 0.0.2
P4 to P8      not run
```

### 11.1 Local SDK pilot evidence

On October 16, the [#4537 helper](https://github.com/hiero-ledger/hiero-sdk-js/blob/73aa1bc1808b187c8c6887101d12ef9294e59f4c/.github/scripts/solo-compat.mjs)
ran unchanged against a local Solo tarball containing the #6228 fix. All pilot stages passed. The portable
[run record](./evidence/sdk-solo-pilot-2026-10-16.json) preserves the source identities, tarball hashes, checks,
timings and limits of the evidence.

| Input | Tested value |
| ----- | ------------ |
| SDK source | [hiero-sdk-js `73aa1bc1`](https://github.com/hiero-ledger/hiero-sdk-js/commit/73aa1bc1808b187c8c6887101d12ef9294e59f4c) |
| Candidate packages | Freshly packed SDK 2.90.1, proto 2.32.0 and cryptography 1.23.0 from that checkout |
| Solo source | [#6228 `2d2adcc6`](https://github.com/hiero-ledger/solo/commit/2d2adcc68355ac9296482cc312f95dcd75fe4972), with the override correction subsequently committed as [`24dc1ffc`](https://github.com/hiero-ledger/solo/commit/24dc1ffcd42d24876bdc422b1b459496afec220e) |
| Solo package | Unreleased #6228 build, packaged as 0.93.0; `SOLO_VERSION` pointed at its local tarball |
| Companions | CN v0.77.2; MN v0.163.0 |
| Platform | macOS arm64, Node 22.23.2, Docker Desktop linux arm64, Kind Kubernetes v1.31.9 |
| Isolation | A fresh `solo-6228-pilot` cluster, separate `KUBECONFIG` and `SOLO_HOME` |
| Deploy command | `solo one-shot single deploy --quiet-mode --namespace one-shot --consensus-node-version v0.77.2 --mirror-node-version v0.163.0` |

The Solo tarball was built before `24dc1ffc` was committed. The installed Solo package, node-client source and
compiled code matched the fixed local build, and its lock integrity matched the tarball. This was not an installation
of released npm Solo 0.93.0.

| Check | Result |
| ----- | ------ |
| Candidate identity | Exactly one copy of each candidate package; lock integrity matches its tarball's sha512; Solo's own SDK `require` and `import` resolve it |
| Deployment | Exit 0 in 300.66 seconds |
| Solo account operations | Created account 0.0.1012 and updated its key; the candidate SDK confirmed the new key and used it to sign |
| Transactions and mirror | Transfer and topic message received SUCCESS receipts; MN REST returned the transfer and the exact message |
| Cleanup | Solo destroy and deletion of the test cluster both exited 0; test ports closed; the existing cluster retained the same 22 Ready pods |
| Elapsed | 344.45 seconds from install through cleanup |

The elapsed time excludes SDK/Solo builds and Kind preparation. This pilot used `one-shot single`, including Explorer
and Relay; the planned SDK kit lane uses Falcon with CN and MN only. It did not exercise the kit's pod watcher,
then-proposed two-minute load, the new all-phase profile, resource sampling/ceilings or release negative controls;
it is not a GitHub Linux CI result.
The next proof is the released Solo fix on Linux CI, followed by verification of the complete Falcon kit lane.

## 12. Caller example: a Mirror Node pull request

A new workflow next to MN's `acceptance.yaml`, which stays as it is (the kit adds a check, it replaces none).

```yaml
# hiero-mirror-node: .github/workflows/solo-tck.yaml
name: Solo TCK

on:
  pull_request:
    branches:
      - "main"
      - "release/**"
    paths-ignore:
      - "docs/**"
      - "**.md"
  push:
    branches:
      - "main"
      - "release/**"

permissions:
  contents: read

jobs:
  solo-tck:
    name: Solo TCK (mirror node)
    runs-on: hiero-mirror-node-linux-large
    timeout-minutes: 30
    steps:
      - name: Harden Runner
        uses: step-security/harden-runner@ccd8616d44fd3846e67624a50d5aad6d37bf2d25 # v2.22.1
        with:
          egress-policy: audit

      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Setup Java
        uses: actions/setup-java@dd06d9cba3e5552c54d9f8ea23572deb30010f7c # v6.0.0
        with:
          distribution: temurin
          java-version-file: .sdkmanrc

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@3f131e8634966bd73d06cc69884922b02e6faf92 # v4

      - name: Setup Helm
        uses: azure/setup-helm@9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310 # v5.0.1

      # Candidate build: the six module images Solo expands the prefix into, tagged
      # with a version unique to this run. Solo turns monitor off, but it is part of
      # the expansion. The chart comes from this commit too.
      - name: Build the candidate
        run: |
          base=$(sed -nE 's/^version=([0-9]+\.[0-9]+\.[0-9]+).*$/\1/p' gradle.properties)
          version="${base}-tck.${GITHUB_RUN_ID}.${GITHUB_RUN_ATTEMPT}"
          echo "CANDIDATE_VERSION=${version}" >> "${GITHUB_ENV}"
          tasks=()
          images=()
          for module in importer grpc rest rest-java web3 monitor; do
            tasks+=(":${module}:dockerBuild")
            images+=("gcr.io/mirrornode/hedera-mirror-${module}:${version}")
          done
          ./gradlew -PimageTag="${version}" -x :rest:monitoring:dockerBuild "${tasks[@]}"
          docker save -o "${RUNNER_TEMP}/mirror-candidate.tar" "${images[@]}"
          helm dependency update charts/hedera-mirror

      # Deployment, verification, cleanup and results.
      - name: Solo TCK
        uses: hiero-ledger/solo/tck@<verified Solo release SHA> # verified release containing the MN lane
        with:
          component: mirror-node
          candidate-version: ${{ env.CANDIDATE_VERSION }}
          candidate-image: gcr.io/mirrornode/hedera-mirror:${{ env.CANDIDATE_VERSION }}
          candidate-archive: ${{ runner.temp }}/mirror-candidate.tar
          candidate-chart-dir: charts
```

The build step uses MN's own commands: `run-e2e/action.yml` builds the changed modules with
`./gradlew :<module>:dockerBuild -PimageTag=<tag>` into `gcr.io/mirrornode/hedera-mirror-<module>:<tag>`, and deploys
the chart with `--mirror-node-chart-dir ./charts`. The TCK job builds all six modules, because every module the chart
runs must be the candidate.

What the kit does:

1. **Inputs (P1).** `0.166.0-tck.38712.1` is semver with a prerelease part, and the image tag equals it. The archive's
   `manifest.json` lists `gcr.io/mirrornode/hedera-mirror-<module>:0.166.0-tck.38712.1` for all six modules.
   `charts/hedera-mirror/Chart.yaml` exists. Solo is the kit default (0.94.0 here), and CN is Solo's default.
2. **Preflight**, as in §11.
3. **Install.** A plain `npm install @hiero-ledger/solo@0.94.0` in its own folder.
4. **Deploy (P2).** The kit writes the values file:

   ```yaml
   mirrorNode:
     --component-image: gcr.io/mirrornode/hedera-mirror:0.166.0-tck.38712.1
     --component-image-archive: <runner temp>/mirror-candidate.tar
     --mirror-node-chart-dir: <workspace>/charts
     --pinger: false
   ```

   and runs:

   ```bash
   solo one-shot falcon deploy --values-file falcon-values.yaml \
     --deployment solo-tck --namespace solo-tck \
     --mirror-node-version v0.166.0-tck.38712.1 \
     --deploy-explorer=false --deploy-relay=false \
     --metrics-server --quiet-mode
   ```

   The pinger goes off through the section key, because the PR chart's pinger image exists in no registry. Falcon
   appends section keys last-write-wins
   ([command-helpers L184-L208](https://github.com/hiero-ledger/solo/blob/bb9eb7659f7e894c496a66935d032d70157c9869/src/commands/command-helpers.ts#L184-L208)),
   so the MN add and the later pinger upgrade step both end with a single `--pinger false`. A deploy with Solo 0.93.0
   on October 16 confirmed it: Helm values `pinger.enabled: false`, no pinger in the rendered manifest, five MN modules
   running. A top-level `--pinger=false` fails instead, because falcon deploy does not accept that flag and Solo
   parses its arguments strictly. Explorer and Relay stay off until #6225 is fixed, because today Explorer inherits the
   MN candidate flags and fails the deploy (local run 1b). Solo loads the archive into Kind, installs the PR's chart and
   sets each module image to the candidate with `pullPolicy: Never`. The kit watches pods.
5. **Identity (P3).** The `importer`, `grpc`, `rest`, `restjava` and `web3` containers run
   `gcr.io/mirrornode/hedera-mirror-<module>:0.166.0-tck.38712.1` with `imagePullPolicy: Never`. Solo turns `monitor`
   off, and the result records it. This is the check that was proven locally with Solo 0.93.0 (run 1c).
6. **Probes (P4 to P7)**, with the kit's probe SDK: a transfer and a topic message; REST returns both by ID; a gRPC
   subscription to the topic receives the message; one rest-java and one web3 request read the run's data.
7. **Load (P8).** As in §11, with the kit's probe SDK. The summary also shows each module's peak memory.
8. **Cleanup.** `solo one-shot falcon destroy --deployment solo-tck --quiet-mode`, then
   `kind delete cluster --name solo-cluster` if anything is left. The candidate archive stays in the runner's temp
   folder, which the runner clears.
9. **Results.** `tck-result.json`, `junit.xml`, the job summary and the artifact `solo-tck-mirror-node-1`, which holds
   Solo's logs and, on a failure, the pod state, events and diagnostics collected before cleanup.

Results:

- **A healthy candidate:** green only after the full workflow passes within the agreed budget; six-image build and
  all-phase timing still need measurement. The earlier 16-to-20-minute estimate is not a measured result.
- **The importer crashes on a bad migration:** the watcher sees the second restart of the candidate `importer`
  container during the deploy and fails at once: exit 1, reason `candidate`, stage deploy, with the importer's last
  log lines in the summary. Red, and blocking once required.
- **A module image missing from the archive:** P1 fails before any cluster exists: exit 2, reason `invalid`, naming the
  missing image.
- **A non-candidate image cannot be pulled** (for example PostgreSQL from Docker Hub): exit 3, reason `environment`.

Job summary for the crash:

```text
Solo TCK <verified release ref> | mirror-node | FAIL (candidate) at deploy
Solo 0.94.0 (kit default)   CN (Solo default)
Candidate 0.166.0-tck.38712.1, chart charts/hedera-mirror 0.166.0-SNAPSHOT

P1 inputs     pass     1 s
P2 deploy     fail   192 s   importer: CrashLoopBackOff after 2 restarts (last 50 log lines below)
P3 to P8      not run
```

## 13. Solo PRs and nightly runs

Solo must test its own branch/main builds against the TCK. **Two independent checks remain the proposed wiring**,
so a paired kit change cannot hide a Solo regression; workflow ownership and release-transition details remain open
(OPEN-15).

- **Solo compatibility.** Solo's CI packs the PR build and runs the newest released kit
  (`uses: hiero-ledger/solo/tck@<sha> # verified Solo release (proposed co-release ref)`, pinned and bumped like any caller's) with `component: solo` and
  `candidate-solo: <tarball>`. It runs on PRs that change `src/`, `resources/`, `version.ts`, `package.json` or
  `package-lock.json`, and proves that the Solo change works with the kit callers pin. If the change also needs a kit
  change, the co-release model needs a reviewed backward-compatible transition or an explicit migration plan; a green
  new-kit/new-Solo pair does not erase a red released-kit check. That transition is pending in OPEN-09/OPEN-15.
  This automates on every PR what the `solo-test-release` skill does by hand
  before a release: pack Solo, deploy with one-shot, and confirm a real transaction through consensus and the mirror
  node. Measure its cost with the new profile before committing a runtime estimate.
- **Kit development.** PRs that change `tck/` run `uses: ./tck` against established baselines: each `supported` Solo
  release from npm, with released components as candidates, as in release verification (§6.4). This tests the kit
  change before it ships, without depending on an unreleased Solo.

**Nightly.** A scheduled workflow in Solo runs the newest released kit against Solo `main`, and the kit on `main` against
the default Solo release, each with the components' latest releases as candidates. One more run uses the newest
published companions, looked up once and written to the result; a failed lookup fails the run. Red nightly runs go to the Solo team channel,
and the kit opens nothing by itself. Later additions: support-window boundaries
([#3608](https://github.com/hiero-ledger/solo/issues/3608)), upgrades, BLOCK mode, several nodes, an external database.

## 14. Rollout and ownership

Every lane goes through the same steps:

1. The kit release that adds the lane passes release verification (§6.4).
2. The component team adds the job as a non-required check.
3. Observation: at least 10 working days and 20 runs on PRs and `main`, with no false red (a red that no fix to the
   candidate would clear), and a 90th percentile full-workflow time under 30 minutes.
4. The component team asks CI and release engineering to make it required, with the bypass group from §10.5.

SDK-first delivery was accepted in the October 16 review (§16). The MN lane and
[#6225](https://github.com/hiero-ledger/solo/issues/6225) have an assigned owner on the Solo team; the MN handoff and
delivery date still need coordination. The SDK lane implementer is still to be confirmed. Other owner entries below
remain proposals for the named teams to confirm.

| Lane             | Kit lane: build and fix | Caller workflow       | Decides "required" | Ruleset change                      | First triage           |
| ---------------- | ----------------------- | --------------------- | ------------------ | ----------------------------------- | ---------------------- |
| `js-sdk`         | Solo team; implementer to be confirmed | SDK team | SDK team         | hiero-sdk-js admins (ruleset 650010) | SDK team               |
| `mirror-node`    | Solo team (owner assigned) | MN team               | MN team            | CI and release engineering          | MN team                |
| `relay`          | Solo team               | Relay team            | Relay team         | CI and release engineering          | Relay team             |
| `consensus-node` | Solo team               | CN team               | CN team            | CI and release engineering          | CN team                |
| `block-node`     | Solo team               | BN team               | BN team            | CI and release engineering          | BN team                |
| `solo`           | Solo team               | Solo team             | Solo maintainers   | Solo admins                         | the PR author          |
| nightly          | Solo team               | Solo team             | not required       | none                                | Solo team, rotating    |

"First triage" covers reason `candidate`. The other reasons go elsewhere first: `invalid` to the caller, `environment`
to a re-run (and to CI and release engineering if it repeats), `kit` and `unknown` to the Solo team.

The architecture deliverable is this design, its decision register and the implementation handoff (#6223). It does
not include implementing or releasing the kit, enabling required consumer checks, or maintaining the kit. The Solo
team is the proposed kit implementation and maintenance owner; named implementers and release owners are confirmed
separately. The plan distinguishes architecture completion from implementation acceptance. The Solo team and tech
lead own defect follow-through; §10.5 records the qualified two-day target, unconfirmed response time and pending
bypass governance. This does not assign kit implementation or release delivery to the architecture owner.

## 15. Solo changes the lanes need

| Change                                                                              | Issue          | Needed for                                                       |
| ----------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| Ping a node account, not the operator account `0.0.2`                               | #6224, PR #6228 | Local SDK 2.90.1 proof passed (§11.1); merge, release and Linux CI still needed for adoption |
| Keep Falcon candidate flags inside their component section                          | #6225          | Explorer and Relay in the MN lane (R4)                           |
| Keep the registry of a BN candidate image                                           | #6226          | `block-node` lane                                                |
| Fail fast on definitive image errors                                                | #6227          | The budget for broken candidates; the kit watches pods meanwhile |
| A one-shot flag for the block node (today only `ONE_SHOT_WITH_BLOCK_NODE`)          | in #6223       | `block-node` lane; the env var works meanwhile                   |
| The reverse SHA-256 rule (BN 0.45 with an older CN), and the real CN boundary       | #6202          | `block-node` and `consensus-node` lanes                          |
| Reconcile the `tck` scope rule and npm exclusion with the chosen release model | #6234, PR #6235 | First kit publication; mechanics pending OPEN-09 |
| Review the tag-reader safeguard if independent kit tags remain | #6234, PR #6235 | Conditional on OPEN-09; not an automatic release prerequisite |
| A distinct exit code for invalid input, and JSON output of what is deployed         | in #6223       | Exact `invalid` reasons and richer results; the kit reads `kubectl` meanwhile |

The MN lane itself needs none of these: it runs with Explorer and Relay off, and turns the pinger off through the
`mirrorNode` section key (§12).

## 16. Decision register

The [October 16 review](https://github.com/hiero-ledger/solo/pull/5165#issuecomment-6213315378) accepted version
policy, SDK-first order and the budget/resource policy. October 19 maintainer feedback confirms released default,
full-workflow timing and Explorer placement, endorses bypass in principle and qualifies the fix target. It also
requests action reuse, branch-companion coverage and Solo style for ESM. The release direction is conditional on
stakeholder alignment; exact load settings, interfaces and ownership are not approved by implication. Review
comments are not blanket approval. IDs stay unchanged; owner entries without confirmed assignments remain roles
asked to confirm, not accepted owned deferrals.

| ID      | Decision                  | Answer or recommendation                                                                                                | Confirmation / remaining review    |
| ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| OPEN-01 | Requirements              | PRD v0.2 as restated in §1                                                                                              | PRD owner                          |
| OPEN-02 | Version policy | Released default and visible temporary SHA pins retained; branch builds resolve to recorded SHAs; Solo tests branch/main (§5.2, §13) | Default confirmed October 19; direct branch-ref UX and exact dual-check wiring remain proposed |
| OPEN-03 | Contract | One lane spec/inventory; assess existing action reuse with one cluster owner and a verified artifact/context handoff (§3, §7.4) | Solo/action maintainers and component teams; reuse boundary not yet agreed |
| OPEN-04 | Adoption                  | Every lane is a PR check: non-required, then required by the component team after observation (§14)                     | Component teams                    |
| OPEN-05 | Runtime and resources | Full workflow <=30 minutes; day-one OOM/restart failures; ceilings after two weeks at peak +25%. Compress all perf phases, target about five minutes; measure/cache/larger runner before an MN exception (§8, §9) | Policy confirmed; exact profile, exports and stage/reserve allocations pending; no exception approved |
| OPEN-06 | First delivery | JS SDK first, then MN; MN lane/#6225 owner assigned; plan slices 0 to 2 | Order accepted October 16; SDK implementer and release owner still to be confirmed |
| OPEN-07 | Platform | Linux amd64/Kind; Node 22 and plain ESM remain proposed. Solo class/static-helper conventions and .mjs lint apply (§3) | Solo maintainers confirm runtime/language; no JDK axis |
| OPEN-08 | Preflight                 | Use one-shot's own tuple check; ask Solo for a distinct exit code for invalid input                                      | Solo maintainers                   |
| OPEN-09 | Release mechanics | Proposed kit/Solo co-release rather than independent tck-v* releases; preserve Latest and verified, non-retroactive admission (§6) | Direction supported October 19; stakeholder/PRD alignment, metadata, workflow and publishing ownership pending |
| OPEN-10 | Evidence                  | CI artifacts and job summaries; no public record until someone needs one                                                | none                               |
| OPEN-11 | Development companions | Cover BN+CN branch pairings both ways and SDK+CN branch; proposed companion-builds manifest, provenance and observed identity (§4.1, §5.3) | Solo/CI and component teams review schema/wiring; no accepted v1 deferral or implementation claim |
| OPEN-12 | Failure policy | Red remains red; baseline attribution. Linked-issue bypass endorsed; Solo team/tech lead own fixes with an adjustable initial two-day target (§10.5) | Bypass membership/rulesets pending; one-working-day response unconfirmed; not a guaranteed SLA |
| OPEN-13 | Trigger, cost and forks   | PRs that change runtime code, plus `main`. Fork PRs depend on the large-runner policy (Solo needs 6 CPUs)               | CI and release engineering         |
| OPEN-14 | Explorer | No separate lane; API coverage in MN after #6225 (§7.3) | Placement confirmed October 19; probe implementation and reviewer handoff remain |
| OPEN-15 | Solo's SDK pin and Solo PRs | Release the ping fix/keep pin current; test Solo branch/main; released-kit compatibility plus kit-development checks remain proposed (§13) | Self-compatibility need confirmed; exact workflows, transition and ongoing owners pending |

Kept from the earlier draft: the kit lives in the Solo repository (TCK-D2). A new repository would need TSC approval,
so the standalone-repository question
([r3876503253](https://github.com/hiero-ledger/solo/pull/5165#discussion_r3876503253)) does not require a second repository.
Immutable caller pins remain possible under co-release. Reviewers decide thread resolution.

Review threads this revision answers:

| Thread | Answer |
| ------ | ------ |
| [r4257792771](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792771): deploy failures classed as infrastructure | §10 |
| [r4257792780](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792780): a pass without deploying the candidate | §7.1, §7.2 |
| [r4257792792](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792792): kit releases and Solo's Latest release | §6.1 |
| [r3876499253](https://github.com/hiero-ledger/solo/pull/5165#discussion_r3876499253): hybrid or pinned versions | §5.1 |
| [r4217105454](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4217105454): CN and BN on schedules only | §14, OPEN-04 |
| [r4217105465](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4217105465): which Solo versions a kit release drives | §6.3 |
| [r4217105477](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4217105477): skips inferred from runtime errors | §7.1 |
| [r4217105500](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4217105500): mirror the PRD requirements | §1 |

October 19 inline feedback is addressed without treating proposed interfaces as implemented:

| Review | Disposition |
| --- | --- |
| [Action reuse](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4313967179) | §3: staged reuse/extension with one isolated cluster/deployment owner; exact adapter remains open |
| [Branch-built companions](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4314270358) | §4.1/§5.3: proposed artifact manifest, all three combinations and provenance/identity checks |
| [Future component builders](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4314401103) | Caller build-action reuse can follow when usable interfaces exist; keep the artifact contract |
| [ESM conventions](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4314489440) | §3/plan: Solo classes/static helpers, lint extension and review-scope acceptance |

## 17. Changes from the October 12 draft

| October 12 draft (`4d215eab`)                                          | This revision                                                                          | Why                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Failure classes `solo-defect` and `infrastructure` do not gate         | Every failure gates; the reason only routes the triage (§10)                           | A crashing candidate was classed `infrastructure` and passed (r4257792771)                           |
| The kit opens or updates a Solo issue on a `solo-defect`               | The job summary carries a ready-to-file issue body; people file it (§4.2)              | Filing needs a write token in every caller's CI, and fork PRs get none. The red check already reaches the team that must act |
| An `expected-solo-break` input                                         | Pin the Solo fix commit in `solo-version` (§5.2, §10.5)                                | Only a full pass is green, so a declared break would have to turn a red run green. With the fix pinned, the run is green because the fix is in it |
| `scope` and `topology` inputs with `pr-core`, `extended` and `nightly` | One lane per component, which always deploys the candidate (§7.1)                      | A BN caller could pass without deploying BN (r4257792780)                                            |
| A canary per suite in every run                                        | An identity check in every run, and negative controls before each kit release (§6.4, §7.2) | The identity check proves the candidate ran; a broken input in every run costs time and proves less |
| Mini-perf only in `extended` | Stability in every lane; proposed shortened all-phase profile (§8) | October 19 feedback rejects sampling only the start of the long suite |
| PR gates for MN, Relay and the SDK; CN and BN on schedules in v1       | Every lane is a PR check, non-required first (§14)                                     | The PRD asks for PR-time checks. Non-required first matches the earlier "optional first" guidance   |
| Hybrid PR runs: the candidate plus latest-stable companions            | Pinned: the kit pins Solo, Solo pins the companions; latest only nightly (§5)          | Reproducible PR results: a new release changes a caller's result only through the caller's own bump PR |
| A verdict through `--output json` on `DiagnosticsFinding`              | The kit's own `tck-result.json` (§4.2)                                                 | The kit must not depend on Solo internals (R1)                                                       |
| A git-tracked conformance record (TCK-13)                              | CI artifacts first (OPEN-10)                                                           | Nobody needs a public record yet                                                                     |
| Kit tags under `tck-v*` | Proposed co-release, pending stakeholder/PRD alignment (§6.1) | Avoid a separate kit Release taking Solo's Latest; keep immutable verified pins |
| Two SDK modes, the client mode first                                   | Both modes in the one `js-sdk` lane (§7.3)                                             | One deploy covers both, as #4537 shows                                                               |

Kept unchanged: the Solo repository home, the black-box boundary, Explorer as a channel rather than a component, the
Docker image deferred past v1, TCK-1 independent of the version decisions, and the build-inclusive budget.

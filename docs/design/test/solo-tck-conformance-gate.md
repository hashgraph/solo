# Solo TCK - Design

**Status:** Proposed architecture, revised October 16, 2026, for a focused review by Jan Milenkov and Jeromy Cannon.
Nothing here is implemented in this repository yet. Statements marked "proven" were run.
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272).
**Tracker:** [#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Overview:** [solo-tck-overview.md](./solo-tck-overview.md).
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md).
**Facts checked against:** Solo `main` at
[`bb9eb765`](https://github.com/hiero-ledger/solo/tree/bb9eb7659f7e894c496a66935d032d70157c9869) and npm
`@hiero-ledger/solo@0.93.0`, October 16, 2026.

## 1. Requirements

From the PRD v0.2 (Notion), as summarized in #6223:

| ID  | Requirement                                                                        | Met in   |
| --- | ---------------------------------------------------------------------------------- | -------- |
| R1  | Black-box: test only through the Solo CLI and observable network behavior          | §3       |
| R2  | Cover CN, MN, BN, Relay, the JS SDK that Solo uses, and Solo itself                | §7       |
| R3  | PR-time checks, 15 to 30 minutes per invocation (G1)                               | §9       |
| R4  | Real traffic through mirror REST and, when deployed, Explorer REST and JSON-RPC    | §7       |
| R5  | A lightweight resource and stability check                                         | §8       |
| R6  | Independent semantic versioning and release cadence for the TCK (G6)               | §6       |
| R7  | Explorer coverage through the deployed topology, with no separate Explorer check   | §7.3     |

Agreed constraints, also from #6223: the kit lives in the Solo repository; prerelease or branch-built companions are
acceptable; the MN pinger is turned off in the MN lane. The PRD has no JDK matrix, so v1 has none.

The epic asks for a required PR check on each component. Schedules can help during rollout, but they are never the
end state (§14).

## 2. Who owns what

**Solo owns everything inside `solo one-shot falcon deploy` and `destroy`:**

- creating the Kind cluster and installing its pinned kind, helm and kubectl;
- loading the candidate (`--component-image-archive`, `--local-build-path`) and setting `pullPolicy: Never`;
- every chart value, env var, port and default resource limit of each component;
- the default component versions of each Solo release (`version.ts`);
- the compatibility rules checked before deploy (`ComponentCompatibility`);
- fixing the Solo defects the kit finds, within the time agreed in §10.5.

**The TCK owns everything around that command:**

- the caller interface, input checks, exit codes and result files (§4);
- choosing and recording versions (§5), and its own releases (§6);
- writing the Falcon values file and the Solo command line;
- watching pods and failing fast (§10.3);
- proving the candidate runs, the required probes, the short load and the resource check (§7, §8);
- stage deadlines (§9), diagnostics and cleanup;
- one spec and one "what Solo assumes" inventory per lane (§7.4), reviewed by the component team.

**The caller (the component team) owns:**

- building the candidate from the PR commit, with a version unique to the run, in the shape its lane needs (§4.1);
- the workflow job: trigger, path filter, runner and `timeout-minutes`;
- the kit pin and when to bump it;
- deciding when the check becomes required, and the first look at a red run (§14).

**CI and release engineering own** the runners, repository rulesets (required checks and the bypass group), the fork
PR policy, and the right to push `tck-v*` tags.

## 3. Architecture

```text
caller job (one job, one commit)
  1  build the candidate                                                      caller
  2  uses: hiero-ledger/solo/tck@<sha> # tck-vX.Y.Z
       check inputs                                       exit 2 on a bad input
       preflight the runner                               exit 3 if it cannot run Solo
       install Solo in its own npm project, SOLO_HOME and KUBECONFIG
       write falcon-values.yaml, with the candidate in its component section
       solo one-shot falcon deploy                        Solo creates Kind, loads the candidate, deploys
       watch pods: fail fast on image errors, crash loops and OOM kills
       prove the candidate runs                           exit 1 if it does not
       run the lane's required probes, the short load and the resource check
       write tck-result.json, junit.xml and the job summary; upload them with Solo's logs
       solo one-shot falcon destroy, then kind delete as a backstop
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
- **One verified Node runtime:** the kit and Solo run on Node 22.x, the runtime Solo documents (README: `lts/jod`), and
  release verification runs on it. If the runner's Node is not 22.x, the action installs Node 22 with
  `actions/setup-node`, which also changes Node for the caller's later steps. Solo's own CI uses Node 24; moving the
  kit to 24 is a MINOR kit release once verification passes on it.

Package layout:

```text
tck/
  action.yml           composite action; runs the kit and Solo on Node 22.x
  package.json         the kit's version and its own dependencies (the probe SDK)
  package-lock.json
  solo-versions.json   {"default": "0.94.0", "supported": ["0.92.0", "0.94.0"]}
  CHANGELOG.md         release notes (there is no GitHub Release, see section 6)
  src/                 plain ESM JavaScript, no build step
  specs/               one test spec and one "what Solo assumes" inventory per lane
  test/                unit tests, and the negative controls run before each release
```

Plain ESM JavaScript, like `.github/scripts/solo-compat.mjs` in hiero-sdk-js#4537, so a tag runs as checked out.
`tck/` goes into Solo's `.npmignore`, so the kit never ships inside the Solo npm package.

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
| `solo-version`           | no                        | Default: the kit release's pinned Solo. A supported release or a Solo commit SHA (§5.2) |
| `consensus-node-version`, `mirror-node-version`, `block-node-version`, `relay-version`, `explorer-version` | no | Companion overrides (§5.3). Not allowed for the lane's own component |

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
  candidate identity evidence; every probe with its result and time; resource peaks; stage times.
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
runs. This answers the hybrid question on this PR (Keith): the candidate is the PR build, and every other version is
pinned but can be overridden explicitly.

### 5.2 Solo version

- **A release** (`0.94.0`) must be in the kit release's `supported` list. Otherwise the run exits 2 and names the
  supported versions.
- **A commit SHA** makes the kit build Solo from `hiero-ledger/solo` at that commit (`npm ci`, build, `npm pack`) and
  install the tarball. This is the planned-break path: a component PR that needs an unreleased Solo fix pins the fix
  commit, and drops the pin once the fix is released. The result marks the run as unreleased Solo. It skips the
  `supported` check, since there is no release to check.

This replaces "run Solo `main`": a component PR uses an unreleased Solo only when it needs one, and the pin shows in
its diff.

### 5.3 Companion versions and overrides

- **Default:** the kit passes no version flag, so Solo deploys its own defaults for that release. That is what Solo
  users get from that release, and what Solo's CI tests.
- **Override:** an input such as `mirror-node-version: v0.165.0-alpha2` becomes the matching top-level falcon flag.
  Published releases and published prereleases are allowed. Companions built from a branch are not an input in v1:
  no lane needs one yet, because the companions CN `main` needs (MN 0.165 and BN 0.45) are now published as
  prereleases.
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

### 6.1 Tags only

- The kit is released as an annotated tag `tck-vMAJOR.MINOR.PATCH` on a Solo `main` commit. Callers pin the tag's
  commit SHA with the tag name in a comment, the way hiero-ledger workflows pin their other actions.
- **No GitHub Release is ever created for the kit.** Only a published GitHub Release can become "Latest", so the
  installer (`releases/latest/download/install.sh`) and `flow-examples-test.yaml` (the `releases/latest` API) keep
  resolving Solo releases. Release notes go into `tck/CHANGELOG.md` and the tag message.
- `semantic-release` already ignores these tags: `.releaserc` sets no `tagFormat`, so it only reads `v${version}`
  tags. No Solo workflow triggers on tag pushes or release events (checked on `bb9eb765`).
- **One `.releaserc` change:** the rule `{"scope": "tck", "release": false}` in `@semantic-release/commit-analyzer`,
  so kit-only commits such as `feat(tck): ...` do not cut a Solo release.
- **One skill change:** the `solo-prepare-release` skill takes the last Solo release from
  `git describe --tags --abbrev=0`, which returns a `tck-v*` tag once one sits on `main`. It needs
  `--match 'v[0-9]*'`. It is the only other tag reader in the repository (checked on `bb9eb765`).
- The kit's own version is in `tck/package.json`. The kit is not published to npm.

This resolves the review problem that a kit release could become Solo's Latest release
([r4257792792](https://github.com/hiero-ledger/solo/pull/5165#discussion_r4257792792)).

### 6.2 What a kit version number means

- **MAJOR:** callers must change their workflow (an input or output renamed or removed, a lane removed).
- **MINOR:** a verdict can change for the same candidate (a new probe, a stricter limit, a new default Solo, a changed
  supported list).
- **PATCH:** fixes that cannot turn a correct pass into a fail (reporting, diagnostics, messages).

A caller sees a change only when it bumps the pin. The check runs on that bump PR, so a kit or Solo change that breaks
the caller's `main` shows up there first.

### 6.3 Supported Solo versions

- `tck/solo-versions.json` holds `default` and `supported`.
- A Solo release enters `supported` only when both hold:
  1. It has every Solo capability the kit's lanes use. The kit lists each capability with the first Solo release that
     has it, for example `--component-image-archive` (#5950, first released in 0.91.0) and the six-module MN image
     expansion (#6112, first released in 0.93.0).
  2. Every lane passed release verification (§6.4) with it.
- Solo's support window (README "Current Releases": one month for odd releases, three months for even LTS releases)
  only says which releases are worth trying. It does not make a release supported. A release that fails verification
  stays out of the list, and the kit's release notes say why.
- After each Solo release, the Solo release owner opens a small PR that adds the release to `supported` and moves
  `default`, then runs the kit release if verification passes. Between Solo releases, the kit releases whenever it
  changes (R6).
- Callers that need an older Solo pin an older kit release.

### 6.4 Release verification

`tck-release.yaml` (`workflow_dispatch`, input: the version) runs on Solo `main`:

1. Checks that `tck/package.json` and `tck/CHANGELOG.md` carry that version.
2. Runs every implemented lane against every `supported` Solo version, with released artifacts as candidates: the
   `js-sdk` lane with the SDK version that Solo pins, the `mirror-node` lane with Solo's default MN images retagged
   with a unique version, and so on.
3. Runs the negative controls. Each must fail with the expected reason:

   | Control                                      | Expected        |
   | -------------------------------------------- | --------------- |
   | A module image missing from the archive      | exit 2, `invalid` |
   | A candidate image whose process exits at start | exit 1, `candidate`, within 2 minutes |
   | A lane whose deploy leaves a default image in a target container | exit 1, `candidate` (identity) |
   | A probe that cannot find its transaction on the mirror node | exit 1, `candidate` |
   | An unsupported Solo version                  | exit 2, `invalid` |
   | A companion override Solo rejects            | exit 2, `invalid` |

4. Pushes the tag.

CI and release engineering grant the push right for `tck-v*` tags to this workflow.

## 7. Lanes and required probes

### 7.1 One lane per component, and it always deploys the candidate

`component` selects exactly one lane. There is no suite, scope or topology input on PR lanes, so a caller cannot pick
a set of tests that never deploys its component. Each lane's topology always deploys the candidate: the BN lane always
turns the block node on, for example. A run in which any target container does not run the candidate fails with exit 1.

No skips: the kit release fixes each lane's probe list. A probe that cannot run yet is not in the lane until it can,
and it arrives in a MINOR release. The result lists every probe, and a probe that did not run counts as failed.

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
| `js-sdk`         | CN and MN; no Explorer or Relay                                                           | Solo runs on the candidate SDK: the deploy itself (node client and initial accounts), `solo ledger account create`, `solo ledger account update` with a new key. The candidate SDK as a client: the account holds the new key and signs the P5 transactions. | Proven in hiero-sdk-js#4537. Red on SDK 2.89.0 and newer until Solo releases #6228 |
| `mirror-node`    | CN and the candidate MN (five running modules), pinger off. Explorer and Relay off until #6225 is fixed | REST transaction and topic message by ID; the gRPC module streams the topic message to a subscriber; one rest-java and one web3 request that read the run's data (endpoints agreed with the MN team in the lane spec). After #6225: Explorer REST returns the run's transaction, and the Relay answers `eth_blockNumber` and relays a signed transfer. | Identity proven locally (run 1c). Pinger off through a section key, proven by a deploy on October 16 (§12). No Solo blocker for the lane itself |
| `block-node`     | A CN that writes SHA-256 blocks, the candidate BN, and MN reading from that BN           | The path through the BN: with a block node present, Solo turns the MN importer's record download off and points the importer at the BN ([mirror-node L393-L532](https://github.com/hiero-ledger/solo/blob/bb9eb7659f7e894c496a66935d032d70157c9869/src/commands/mirror-node.ts#L393-L532)), so the P6 mirror read-back can only pass if the transaction went through the candidate BN. The lane checks that wiring (record download off, the importer's only block node is the candidate). Also: blocks advance and verify (the BN team names the signal), and a block query returns the block that holds the run's transaction | Blocked: no released CN writes SHA-256 blocks; #6226, #6202 |
| `relay`          | CN, MN and the candidate Relay                                                            | `eth_chainId`, `eth_blockNumber`, a signed EVM transfer and its receipt through the candidate, a WebSocket `newHeads` subscription                                                        | Relay CI builds an image per PR but runs the relay outside Solo today |
| `consensus-node` | The candidate CN and MN; BN when that CN version needs it, with MN reading from it as in the `block-node` lane | P5 and P6 through the candidate; with a BN, the read-back goes through the BN and the BN verifies the blocks                                                                       | CN `main` needs MN 0.165 and BN 0.45 overrides |
| `solo`           | Solo defaults                                                                             | The `js-sdk` lane's Solo-side probes, run on Solo's own pinned SDK                                                                                                                         | The Solo compatibility check on Solo PRs, run with the released kit (§13) |

**Explorer** has no lane of its own (R7). Its REST API is probed in the MN lane once Explorer can be deployed beside
an MN candidate (#6225). This differs from Jeromy's May list, which had an Explorer PR check. The PRD decides, unless
Jeromy objects.

### 7.4 Lane specs and the "what Solo assumes" inventory

Each lane has a spec in `tck/specs/<lane>.md`: each probe, its scenario and its pass condition, written like the SDK
TCK's test specifications. Each lane also has an inventory of what Solo assumes about the component: the chart
values, env vars, ports, paths and health endpoints Solo sets or reads, each with its Solo source line. The component
team reviews both, because those are the things it can break by accident. Together they are TCK-D4's deployment
contract, written one lane at a time.

## 8. Resource and stability check

Always required (P4 and P8):

- No OOM kill in any pod at any time. No container restart from the end of the deploy to the end of the run.
- The short load completes: 2 minutes at 20 transactions per second (transfers and topic messages) from the runner,
  every receipt SUCCESS. The `js-sdk` lane sends it with the candidate SDK, the other lanes with the kit's pinned
  probe SDK. Then P6 runs again for the load's last transaction, to show the mirror importer kept up.

Measured and reported, required later:

- The kit adds `--metrics-server` to the deploy, samples `kubectl top pod --containers` every 15 seconds from the end
  of the deploy to the end of the load, and records each container's peak memory and CPU.
- Memory ceilings per lane and container start as report-only. After two weeks of runs on the caller's `main`, each
  ceiling becomes the highest observed peak plus 25%, checked against the perf suite's values about 5 minutes into its
  load (Jeromy's suggestion), so that no ceiling sits far above what the perf suite sees. The ceilings ship in a kit
  MINOR release, reviewed by the component team. From then on, a container above its ceiling fails the run.
- CPU stays report-only, because shared runners make it noisy.

Resource limits are Solo's defaults, and callers cannot raise them: the check is about the configuration Solo users
get. If Solo's defaults are too small for a released component on the CI runner, that is a Solo defect to fix before
the lane becomes required. Local arm64 runs OOM-killed 4 of 5 MN modules at Solo's default limits; the observation
period has to show what amd64 runners do.

The load reuses the probe SDK the kit already has. `solo rapid-fire load start` would add a load-generator pod, its
image pull and its start-up to every run. It stays the upgrade path if the team wants the perf suite's load classes.

## 9. Runtime budget

**One deadline for the PR check:** 30 minutes of wall time for the whole caller job, candidate build included, as the
October 12 draft defines it. Moving the build to another job would change what is counted, not how long the PR waits.

| Part            | Limit  | `js-sdk`, measured ([run 38865703167](https://github.com/hiero-ledger/hiero-sdk-js/actions/runs/38865703167/job/116858893738)) | `mirror-node`, expected |
| --------------- | ------ | ---------------------------------------------- | -------------------------------------------- |
| Job setup       | 1 min  | 38 s                                           | about 1 minute                               |
| Candidate build | 9 min  | 84 s (build and pack)                          | not measured: six images                     |
| Kit step        | 20 min | 4.2 minutes without the load step              | 11 to 13 minutes                             |
| Total           | 30 min | 6.3 minutes end to end                         | fits only if the build stays under 9 minutes |

**One deadline inside the kit step:** 20 minutes from the step's start.

- Test stages may use the first 17 minutes. Inner caps keep one stage from taking the rest: setup and Solo install 3,
  deploy 8, identity and probes 3, load and resource check 3. Measured so far: Solo install 24 s, deploy 187 s for the
  `js-sdk` lane in CI and 263 s for CN and MN locally, probes 16 s.
- The last 3 minutes are reserved for diagnostics, cleanup and the result. When a test stage runs into minute 17, the
  kit stops it, and the run fails.
- The kit writes `tck-result.json`, `junit.xml` and the job summary last, after cleanup, so they record whether cleanup
  worked. A failed cleanup is recorded and changes no verdict.
- If the job is cancelled or hits its timeout, the kit stops Solo and writes what it has, marked incomplete. An
  incomplete run is never a pass.

The MN build is not measured yet. If six images take more than 9 minutes, the MN lane does not fit the 30 minutes. The
options are a faster build (one Gradle invocation with the build cache, or a larger runner) or an agreed exception
for MN. That choice is part of the runtime decision in the review.

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
4. **Proposed, not agreed:** a small bypass group in each caller's ruleset merges the PR with that issue linked, and
   Solo answers within one working day and ships a fix or workaround within two working days (a Solo release followed
   by a kit release, or a Solo commit the caller can pin meanwhile, §5.2). The times need the Solo team's agreement,
   and the bypass groups need CI and release engineering and each component team.
5. **Planned breaks**, where a component change needs a Solo change: Solo merges its change first, and the component
   PR pins `solo-version` to that commit until the Solo release.

## 11. Caller example: a JS SDK pull request

This job replaces the Solo Compatibility job of hiero-sdk-js#4537. The caller keeps its build steps; the kit replaces
the install, deploy, probe, diagnostics and destroy steps.

```yaml
# hiero-sdk-js: .github/workflows/build.yml
  solo-tck:
    name: Solo TCK
    needs:
      - build
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

      # Deployment, verification, results and cleanup.
      - name: Solo TCK
        uses: hiero-ledger/solo/tck@<commit of tck-v0.1.0> # tck-v0.1.0
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
6. **Load (P8).** The candidate SDK sends 20 transactions per second for 2 minutes. Every receipt is SUCCESS, mirror REST
   returns the last one, nothing restarted or was OOM-killed, and the peaks are recorded.
7. **Results.** `tck-result.json`, `junit.xml`, the job summary and the artifact `solo-tck-js-sdk-1`.
8. **Cleanup.** `solo one-shot falcon destroy --deployment solo-tck --quiet-mode`, then
   `kind delete cluster --name solo-cluster` if anything is left.

Results:

- **With Solo 0.93.0** (`solo-version: 0.93.0`, the situation today): the deploy fails at node start with
  `NodeAccountId not recognized: 0.0.2`, so exit 5, reason `unknown`, stage deploy. Red is right: SDK 2.89.0 and newer
  cannot run inside Solo 0.93.0, as #4537 shows. The reason is `unknown` because the evidence does not say which side
  is wrong; people attributed it to Solo (§10.2).
- **With the first Solo release that carries #6228:** green in about 9 to 10 minutes (6.3 minutes measured without the
  load step, plus the load).

Job summary for the first case:

```text
Solo TCK tck-v0.1.0 | js-sdk | FAIL (unknown) at deploy
Solo 0.93.0 (input)   CN v0.77.2 (Solo default)   MN v0.163.0 (Solo default)
Candidate @hiero-ledger/sdk 2.90.1, one copy, lock integrity matches, require and import resolve it

P1 inputs     pass    0 s
P3 identity   pass   10 s
P2 deploy     fail  243 s   consensus node start: Failed to set up node client: NodeAccountId not recognized: 0.0.2
P4 to P8      not run
```

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

      # Deployment, verification, results and cleanup.
      - name: Solo TCK
        uses: hiero-ledger/solo/tck@<commit of tck-v0.2.0> # tck-v0.2.0
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
8. **Results.** `tck-result.json`, `junit.xml`, the job summary and the artifact `solo-tck-mirror-node-1`, which holds
   Solo's logs and, on a failure, the pod state, events and diagnostics.
9. **Cleanup.** `solo one-shot falcon destroy --deployment solo-tck --quiet-mode`, then
   `kind delete cluster --name solo-cluster` if anything is left. The candidate archive stays in the runner's temp
   folder, which the runner clears.

Results:

- **A healthy candidate:** green, in about 16 to 20 minutes including the build.
- **The importer crashes on a bad migration:** the watcher sees the second restart of the candidate `importer`
  container during the deploy and fails at once: exit 1, reason `candidate`, stage deploy, with the importer's last
  log lines in the summary. Red, and blocking once required.
- **A module image missing from the archive:** P1 fails before any cluster exists: exit 2, reason `invalid`, naming the
  missing image.
- **A non-candidate image cannot be pulled** (for example PostgreSQL from Docker Hub): exit 3, reason `environment`.

Job summary for the crash:

```text
Solo TCK tck-v0.2.0 | mirror-node | FAIL (candidate) at deploy
Solo 0.94.0 (kit default)   CN (Solo default)
Candidate 0.166.0-tck.38712.1, chart charts/hedera-mirror 0.166.0-SNAPSHOT

P1 inputs     pass     1 s
P2 deploy     fail   192 s   importer: CrashLoopBackOff after 2 restarts (last 50 log lines below)
P3 to P8      not run
```

## 13. Solo PRs and nightly runs

**Solo PRs run two separate checks**, so a PR that changes Solo and the kit together cannot hide a break:

- **Solo compatibility.** Solo's CI packs the PR build and runs the newest released kit
  (`uses: hiero-ledger/solo/tck@<sha> # tck-vX.Y.Z`, pinned and bumped like any caller's) with `component: solo` and
  `candidate-solo: <tarball>`. It runs on PRs that change `src/`, `resources/`, `version.ts`, `package.json` or
  `package-lock.json`, and proves that the Solo change works with the kit callers pin. If the change also needs a kit
  change, that kit change ships first, as a kit release that works with both the current and the new Solo; otherwise
  the Solo change would break every caller. This automates on every PR what the `solo-test-release` skill does by hand
  before a release: pack Solo, deploy with one-shot, and confirm a real transaction through consensus and the mirror
  node. Expected cost: about 7 minutes per PR, like the `js-sdk` lane.
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
   candidate would clear), and a 90th percentile job time under 30 minutes.
4. The component team asks CI and release engineering to make it required, with the bypass group from §10.5.

Owners, proposed until confirmed:

| Lane             | Kit lane: build and fix | Caller workflow       | Decides "required" | Ruleset change                      | First triage           |
| ---------------- | ----------------------- | --------------------- | ------------------ | ----------------------------------- | ---------------------- |
| `js-sdk`         | Solo team (built by Dian and Ivaylo Georgiev) | SDK team | SDK team         | hiero-sdk-js admins (ruleset 650010) | SDK team               |
| `mirror-node`    | Solo team               | MN team               | MN team            | CI and release engineering          | MN team                |
| `relay`          | Solo team               | Relay team            | Relay team         | CI and release engineering          | Relay team             |
| `consensus-node` | Solo team               | CN team               | CN team            | CI and release engineering          | CN team                |
| `block-node`     | Solo team               | BN team               | BN team            | CI and release engineering          | BN team                |
| `solo`           | Solo team               | Solo team             | Jan                | Solo admins                         | the PR author          |
| nightly          | Solo team               | Solo team             | not required       | none                                | Solo team, rotating    |

"First triage" covers reason `candidate`. The other reasons go elsewhere first: `invalid` to the caller, `environment`
to a re-run (and to CI and release engineering if it repeats), `kit` and `unknown` to the Solo team.

Dian owns delivery of the kit (#6223). After delivery, the Solo team owns the kit. The response and fix times in §10.5
are a proposal until the Solo team agrees to them.

## 15. Solo changes the lanes need

| Change                                                                              | Issue          | Needed for                                                       |
| ----------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| Ping a node account, not the operator account `0.0.2`                               | #6224, PR #6228 | `js-sdk` lane green with SDK 2.89.0 and newer; Solo's own SDK bump |
| Keep Falcon candidate flags inside their component section                          | #6225          | Explorer and Relay in the MN lane (R4)                           |
| Keep the registry of a BN candidate image                                           | #6226          | `block-node` lane                                                |
| Fail fast on definitive image errors                                                | #6227          | The budget for broken candidates; the kit watches pods meanwhile |
| A one-shot flag for the block node (today only `ONE_SHOT_WITH_BLOCK_NODE`)          | in #6223       | `block-node` lane; the env var works meanwhile                   |
| The reverse SHA-256 rule (BN 0.45 with an older CN), and the real CN boundary       | #6202          | `block-node` and `consensus-node` lanes                          |
| The `.releaserc` rule for scope `tck`, and `tck/` in `.npmignore`                   | not filed      | The first kit release                                            |
| `--match 'v[0-9]*'` in the `solo-prepare-release` skill's `git describe`            | not filed      | The first kit release                                            |
| A distinct exit code for invalid input, and JSON output of what is deployed         | in #6223       | Exact `invalid` reasons and richer results; the kit reads `kubectl` meanwhile |

The MN lane itself needs none of these: it runs with Explorer and Relay off, and turns the pinger off through the
`mirrorNode` section key (§12).

## 16. Decision register

Three rows are the decisions for the focused review: version policy (OPEN-02), first delivery (OPEN-06), and runtime
and resources (OPEN-05). The named people can settle the other rows without blocking slice 1 of the plan.

| ID      | Decision                  | Recommended answer                                                                                                      | Confirm with                       |
| ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| OPEN-01 | Requirements              | PRD v0.2 as restated in §1                                                                                              | Keith                              |
| OPEN-02 | Version policy            | The kit pins Solo, Solo pins the companions, callers override explicitly, a Solo commit pin for planned breaks; discovery only nightly (§5). Keith left pinned or latest to the Solo team | Jan, Jeromy: review decision 1 |
| OPEN-03 | Contract                  | One spec and one "what Solo assumes" inventory per lane; Solo maintains them, component teams review them (§7.4)        | Jan, component teams               |
| OPEN-04 | Adoption                  | Every lane is a PR check: non-required, then required by the component team after observation (§14)                     | Component teams                    |
| OPEN-05 | Runtime and resources     | 30 minutes per PR check including the build; one 20-minute kit deadline with 3 minutes kept for cleanup; stability always required, memory ceilings after two weeks; the kit's own short load rather than `solo rapid-fire` (§8, §9) | Jan, Jeromy: review decision 3 |
| OPEN-06 | First delivery            | `js-sdk` first (already running as #4537; Dian and Ivaylo Georgiev), `mirror-node` next (Solo team with the MN team): plan slices 0 to 2 | Jan, Jeromy: review decision 2 |
| OPEN-07 | Platform                  | Linux amd64, Kind, Solo's default runtime image, Node 22.x (§3); no JDK axis (Keith: the PRD has none)                  | Jan for Node; JDK closed           |
| OPEN-08 | Preflight                 | Use one-shot's own tuple check; ask Solo for a distinct exit code for invalid input                                      | Jan                                |
| OPEN-09 | Release mechanics         | `tck-v*` tags only, no GitHub Release; the supported Solo list by capability and verification; a kit release after each Solo release, by the Solo release owner; the `.releaserc` and skill changes (§6) | Jan, CI and release engineering |
| OPEN-10 | Evidence                  | CI artifacts and job summaries; no public record until someone needs one                                                | none                               |
| OPEN-11 | Development companions    | Published releases and prereleases by explicit override; branch-built companions once a lane needs them                 | Jan, CN and BN teams               |
| OPEN-12 | Failure policy            | §10.5: honest red, `unknown` until attributed, a baseline comparison. Proposed: a bypass group with a linked Solo issue, a one-day answer and a two-day fix | Jan for the times, CI and release engineering for the bypass |
| OPEN-13 | Trigger, cost and forks   | PRs that change runtime code, plus `main`. Fork PRs depend on the large-runner policy (Solo needs 6 CPUs)               | CI and release engineering         |
| OPEN-14 | Explorer                  | No separate lane; probed in the MN lane after #6225 (R7)                                                                | Jeromy                             |
| OPEN-15 | Solo's SDK pin and Solo PRs | Fix the ping (#6228) and keep the pin current; the `js-sdk` lane on SDK PRs; on Solo PRs, the Solo compatibility check with the released kit plus the kit development check (§13) | Jan |

Kept from the earlier draft: the kit lives in the Solo repository (TCK-D2). Keith now prefers that too, since a new
repository would need TSC approval; his standalone-repo thread
([r3876503253](https://github.com/hiero-ledger/solo/pull/5165#discussion_r3876503253)) can close. Independent tags give
callers the same pinning a separate repository would.

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

## 17. Changes from the October 12 draft

| October 12 draft (`4d215eab`)                                          | This revision                                                                          | Why                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Failure classes `solo-defect` and `infrastructure` do not gate         | Every failure gates; the reason only routes the triage (§10)                           | A crashing candidate was classed `infrastructure` and passed (r4257792771)                           |
| The kit opens or updates a Solo issue on a `solo-defect`               | The job summary carries a ready-to-file issue body; people file it (§4.2)              | Filing needs a write token in every caller's CI, and fork PRs get none. The red check already reaches the team that must act |
| An `expected-solo-break` input                                         | Pin the Solo fix commit in `solo-version` (§5.2, §10.5)                                | Only a full pass is green, so a declared break would have to turn a red run green. With the fix pinned, the run is green because the fix is in it |
| `scope` and `topology` inputs with `pr-core`, `extended` and `nightly` | One lane per component, which always deploys the candidate (§7.1)                      | A BN caller could pass without deploying BN (r4257792780)                                            |
| A canary per suite in every run                                        | An identity check in every run, and negative controls before each kit release (§6.4, §7.2) | The identity check proves the candidate ran; a broken input in every run costs time and proves less |
| Mini-perf only in `extended`                                           | Stability and a short load in every lane (§8)                                          | Jeromy's risk lists name more CPU or memory for four of five components                             |
| PR gates for MN, Relay and the SDK; CN and BN on schedules in v1       | Every lane is a PR check, non-required first (§14)                                     | The PRD asks for PR-time checks. Non-required first matches Akram's "optional first"               |
| Hybrid PR runs: the candidate plus latest-stable companions            | Pinned: the kit pins Solo, Solo pins the companions; latest only nightly (§5)          | Reproducible PR results: a new release changes a caller's result only through the caller's own bump PR |
| A verdict through `--output json` on `DiagnosticsFinding`              | The kit's own `tck-result.json` (§4.2)                                                 | The kit must not depend on Solo internals (R1)                                                       |
| A git-tracked conformance record (TCK-13)                              | CI artifacts first (OPEN-10)                                                           | Nobody needs a public record yet                                                                     |
| Kit tags under `tck-v*`                                                | Kept, plus: no GitHub Release, the `.releaserc` scope rule and the skill fix (§6.1)    | A GitHub Release would take over Solo's Latest release (r4257792792)                                |
| Two SDK modes, the client mode first                                   | Both modes in the one `js-sdk` lane (§7.3)                                             | One deploy covers both, as #4537 shows                                                               |

Kept unchanged: the Solo repository home, the black-box boundary, Explorer as a channel rather than a component, the
Docker image deferred past v1, TCK-1 independent of the version decisions, and the build-inclusive budget.

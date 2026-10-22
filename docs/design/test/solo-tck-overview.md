# Solo TCK - Overview

**Status:** Proposed architecture.
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272).
**Tracker:** [#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md).
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md).

The Solo Technology Compatibility Kit (TCK) checks whether a component build deploys through Solo and keeps the
resulting network functional. Component repositories run it on their own pull requests.

A pass requires the candidate to run in every target container or package location, every required probe to pass,
and cleanup to complete. Failed deployment, incomplete coverage, timeout and infrastructure failure all produce a
failed check. The failure reason routes investigation; it does not change the verdict.

## Execution flow

```text
component pull request
  build candidate and any branch-built companions
  run hiero-ledger/solo/tck@<verified Solo release SHA>
    validate inputs and immutable artifact provenance
    install the supported Solo CLI in an isolated environment
    deploy through solo one-shot falcon deploy
    verify candidate and companion identities
    run functional probes, short load and resource checks
    collect diagnostics and clean up
    write JSON, JUnit and the job summary; upload artifacts
  report the job as the pull request check
```

## Architecture

| Area | Contract | Design |
| --- | --- | --- |
| Repository | The runner, action and lane specifications live under `tck/` in the Solo repository. Tests use the CLI and observable network behavior. | §2, §3 |
| Releases | TCK uses Solo's version and release cycle. Consumers pin a verified Solo release commit containing `tck/action.yml`. The action has its own locked dependencies and is excluded from the Solo npm package. | §6 |
| Responsibilities | Callers build artifacts. Solo owns deployment and component compatibility rules. TCK owns validation, candidate identity, probes, deadlines, results and cleanup. | §2 |
| Versions | The action commit pins TCK code; `solo-versions.json` pins the default and supported Solo CLI releases. The selected Solo release pins companion defaults. Overrides are explicit and recorded. | §5 |
| Branch builds | Candidate and companion artifacts carry immutable source SHAs and unique versions. Required combinations include BN+CN, CN+BN and SDK+CN branch builds. | §4.1, §5.3 |
| Deployment | Every lane uses Falcon. Exactly one provisioner owns the isolated cluster. Existing actions can be reused when they preserve the artifact, context and cleanup contract. | §3 |
| Candidate identity | Image references, package integrity or jar hashes prove that the supplied build is running. A default image or package cannot satisfy the check. | §7.2 |
| Lanes | One lane per component, with a fixed topology and required probe set. Explorer API coverage belongs to the MN lane. | §7 |
| Resources | OOM kills fail immediately; restarts after deployment fail. A short profile covers every workload class. Memory ceilings activate after two weeks of observations at peak plus 25%. | §8 |
| Runtime | The complete compatibility workflow fits 30 minutes, including builds, setup, diagnostics, cleanup and export. | §9 |
| Rollout | A lane starts non-required. Required-check adoption needs at least 10 working days, 20 runs, no false red and a 90th percentile duration under 30 minutes. | §14 |

## Repository and release boundary

Keeping TCK in Solo gives the deployment CLI and its compatibility contract one release lifecycle. The action is
available to other repositories through `hiero-ledger/solo/tck@<sha>`; sharing a repository does not require importing
Solo implementation code or shipping the action in the npm package.

Component build actions remain caller-side tooling. They produce the same archives, charts, package tarballs or
CN build directories accepted by TCK. Changing a builder does not change the lane's deployment or probe contract.

Co-release identifies the version of the action code. The Solo CLI under test is selected independently from the
verified supported list, so an action release can retain an earlier supported CLI as its default. A release gains
support only after verification, and an existing immutable action ref is never updated retroactively.

## Delivery and acceptance

The first lane is `js-sdk`: it exercises Solo's own SDK use and the candidate SDK as a network client. The MN lane
follows to verify branch-chart deployment and multi-image injection. Relay, CN and BN lanes extend the same runner
and contracts. Solo's own PRs test candidate Solo builds against a released TCK, while TCK changes are tested against
supported released Solo baselines.

The [implementation plan](./solo-tck-implementation-plan.md) defines delivery dependencies and exit evidence.
[Local pilot evidence](./solo-tck-conformance-gate.md#111-local-sdk-pilot-evidence) establishes a limited SDK/Solo
compatibility path. It does not establish the complete Falcon lane, Linux acceptance, short-profile timing or
release qualification.

The [integration requirements](./solo-tck-conformance-gate.md#16-integration-requirements) identify the remaining
release-workflow, branch-artifact, action-adapter, resource-profile and consumer-policy contracts. They are
implementation prerequisites with explicit validation gates, rather than claims that those capabilities already run.

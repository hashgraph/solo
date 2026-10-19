# Solo TCK - Overview

**Status:** Revised October 19, 2026. The three focused review decisions are accepted; the remaining maintainer
review is pending. Implementation is tracked separately. See [review status](#review-status).
**Scope:** the architecture and its implementation handoff. Kit implementation, release and consumer adoption are
separate work (design §14).
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272).
**Tracker:** [#6223](https://github.com/hiero-ledger/solo/issues/6223).
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md).
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md).

The Solo TCK tells a component team, on its own pull request, whether its build breaks Solo:

> Does this build deploy through a supported Solo release, really run, and keep the network working?

**Green means** the candidate ran everywhere it should and passed every required probe. Anything else is red. There
is no neutral, skipped or "infrastructure, ignore it" result.

## The shape

```text
component PR job
  build the candidate, with a version unique to the run
  uses: hiero-ledger/solo/tck@<sha> # tck-vX.Y.Z      component: <lane>
    install the Solo release the kit pins
    solo one-shot falcon deploy, with the candidate in its component section
    prove the candidate runs, probe the network, run a short load and a resource check
    destroy the cluster, write the result, upload the logs
  the job is the PR check
```

## Main decisions (recommended)

| Topic            | Recommendation                                                                                                          | Design |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| Ownership        | Solo owns what happens inside `solo one-shot falcon deploy`; the kit owns everything around it; callers build the candidate | §2     |
| Home, releases   | `tck/` in the Solo repo, released as `tck-v*` tags only. Never a GitHub Release, so Solo's Latest release and `install.sh` cannot change | §6     |
| Versions         | The kit release pins a Solo release, and that Solo release's defaults pin the other components. Callers override explicitly. Nothing floats on PRs; nightly runs discover new versions | §5     |
| Supported Solo   | Each kit release lists the Solo releases that have every capability its lanes use and passed its verification. A Solo commit SHA is the explicit override for planned breaks | §5.2, §6.3 |
| Deploy path      | `solo one-shot falcon deploy` only. Callers cannot pass Helm values or extra flags                                      | §3     |
| Candidate proof  | A version unique to the run, built in, loaded from an archive with `pullPolicy: Never`; every target container must run it. For the SDK, Solo must resolve the PR's packages | §5.4, §7.2 |
| Lanes            | One lane per component, and it always deploys the candidate. No suite or scope input                                    | §7     |
| Verdict          | Pass only when every required probe passed. The reason (`candidate`, `invalid`, `environment`, `kit`, `unknown`) says where the evidence points; it never unblocks, and `unknown` stays until people attribute the failure | §10    |
| Resources        | No OOM kill and no restart after the deploy, always. Memory ceilings after two weeks of data                           | §8     |
| Budget           | 30 minutes per PR check, build included. The kit step has one 20-minute deadline, and its last 3 minutes are kept for diagnostics, cleanup and the result | §9     |
| Rollout          | Non-required first. The component team makes it required after 10 working days with no false red                      | §14    |

Two complete caller examples, an SDK PR and an MN PR, are in design §11 and §12.

## Where it stands

- **The JS SDK pilot runs** as a non-required job in
  merged [hiero-sdk-js#4537](https://github.com/hiero-ledger/hiero-sdk-js/pull/4537). It installs Solo 0.93.0 with the PR's
  SDK and proves that Solo resolves it. The SDK 2.87.0 baseline passed in 6.3 minutes. Released Solo 0.93.0 fails with
  current SDKs at node start (`NodeAccountId not recognized: 0.0.2`); [#6228](https://github.com/hiero-ledger/solo/pull/6228)
  fixes that break.
- **The candidate SDK passed with the Solo fix locally:** SDK 2.90.1, proto 2.32.0 and cryptography 1.23.0 passed
  identity checks, deployment, Solo account creation/key update, transfer/topic receipts and both MN readbacks.
  Install through cleanup took 344.45 seconds, including a 300.66-second deploy, on macOS arm64 / Node 22.23.2.
  This used `one-shot single` and an unreleased #6228 build; it excludes builds and Kind preparation and does not
  verify the planned Falcon lane, load/resource checks or Linux CI. [Full evidence](./solo-tck-conformance-gate.md#111-local-sdk-pilot-evidence).
- **Separate implementation is in review:** [#6235](https://github.com/hiero-ledger/solo/pull/6235) isolates kit
  releases and packaging; [#6238](https://github.com/hiero-ledger/solo/pull/6238), stacked on it, adds the first SDK
  lane. Both remain open as of October 19. Local Falcon runs passed, but Linux network acceptance, kit release and
  consumer migration remain. These PRs do not establish acceptance of this architecture.
- **The MN candidate proof works locally:** all five running MN modules ran a unique tag from the archive with
  `pullPolicy: Never` (Solo 0.93.0, Kind, arm64).
- **The MN lane has no Solo blocker:** it runs with Explorer and Relay off and turns the pinger off with a `mirrorNode`
  section key, which a deploy confirmed on October 16. [#6225](https://github.com/hiero-ledger/solo/issues/6225)
  (Falcon flags leak into Explorer) only blocks adding Explorer and Relay to it.
- **The BN lane is blocked** by [#6226](https://github.com/hiero-ledger/solo/issues/6226),
  [#6227](https://github.com/hiero-ledger/solo/issues/6227) and the CN and BN SHA-256 pairing
  ([#6202](https://github.com/hiero-ledger/solo/issues/6202)).

## Review status

The three focused decisions were accepted in the October 16 review (design §16):

1. **Version policy** (design §5, §6.3): released Solo by default, pinned companions with explicit overrides, and a
   Solo commit SHA for planned breaks. The SHA pin must appear in the component PR's own diff and be removed once the
   fix ships. A Solo release enters a kit release's supported list only after its verification passed; support is
   never added retroactively.
2. **First delivery order** (plan slices 0 to 2): `js-sdk` first, reusing #4537, then `mirror-node`. The `mirror-node`
   lane and [#6225](https://github.com/hiero-ledger/solo/issues/6225) have an assigned owner on the Solo team; the SDK
   lane implementer is still to be confirmed.
3. **Runtime and resources** (design §8, §9): 30 minutes including the build; OOM kills and restarts fail the run
   from day one; memory ceilings at observed peak plus 25% after two weeks; the kit's own load. For MN's six-image
   build, measure first, then try one Gradle invocation with the build cache, then a larger runner. Bring the
   measurements for an exception decision only if those steps still do not fit; no exception is agreed.

The remaining maintainer review is pending. The acceptance covers these three decisions; the other choices retain
their individual review status in design §16. What changed from the October 12 draft, and why, is in design §17.

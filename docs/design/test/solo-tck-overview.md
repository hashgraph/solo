# Solo TCK - Overview

**Status:** Proposed architecture, revised October 16, 2026, for a focused review by Jan Milenkov and Jeromy Cannon.
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
    write the result, upload the logs, destroy the cluster
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

- **The JS SDK lane already runs** as a non-required job in
  [hiero-sdk-js#4537](https://github.com/hiero-ledger/hiero-sdk-js/pull/4537). It installs Solo 0.93.0 with the PR's
  SDK and proves that Solo resolves it. With the SDK version Solo pins (2.87.0) every step passes in 6.3 minutes. With
  current SDKs the deploy fails at node start (`NodeAccountId not recognized: 0.0.2`): a real Solo break, fixed by
  [#6228](https://github.com/hiero-ledger/solo/pull/6228).
- **The MN candidate proof works locally:** all five running MN modules ran a unique tag from the archive with
  `pullPolicy: Never` (Solo 0.93.0, Kind, arm64).
- **The MN lane has no Solo blocker:** it runs with Explorer and Relay off and turns the pinger off with a `mirrorNode`
  section key, which a deploy confirmed on October 16. [#6225](https://github.com/hiero-ledger/solo/issues/6225)
  (Falcon flags leak into Explorer) only blocks adding Explorer and Relay to it.
- **The BN lane is blocked** by [#6226](https://github.com/hiero-ledger/solo/issues/6226),
  [#6227](https://github.com/hiero-ledger/solo/issues/6227) and the CN and BN SHA-256 pairing
  ([#6202](https://github.com/hiero-ledger/solo/issues/6202)).

## For the review

Three decisions, for Jan and Jeromy. Short answers are fine.

1. **Version policy** (design §5, §6.3): released Solo by default rather than Solo `main`, with a Solo commit pin for
   planned breaks; the other components pinned to that Solo release's defaults on PR checks, with explicit overrides
   and latest only nightly; a supported Solo list that holds only releases the kit verified. Keith left pinned or latest
   to the Solo team.
2. **First delivery scope and owners** (plan slices 0 to 2): the `js-sdk` lane first, built by Dian and Ivaylo Georgiev
   and moving #4537 into the kit; then the `mirror-node` lane, built by the Solo team with the MN team. Who on the Solo
   team takes the MN lane and #6225?
3. **Runtime and resource acceptance** (design §8, §9): 30 minutes per PR check including the build, and what to do if
   MN's six-image build does not fit; no OOM kill and no restart from day one; memory ceilings from two weeks of `main`
   runs plus 25%; the kit's own 2-minute load rather than `solo rapid-fire`.

The other open choices are in the decision register (design §16). What changed from the October 12 draft, and why, is
in design §17.

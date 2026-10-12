# Solo TCK — Overview

**Status:** Draft (PRD v0.2) · [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199) ·
**Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272) ·
**Design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md) ·
**Plan:** [solo-tck-implementation-plan.md](./solo-tck-implementation-plan.md)

A compatibility kit, owned by the Solo team, answering one question about a candidate component build:

> **Does this build deploy cleanly via a supported Solo release and produce a functional network?**

**Consumers.** CN, Mirror Node, Block Node, JSON-RPC Relay, the JS SDK, and Solo itself. The Explorer is not
a consumer: its _UI_ is out of scope and its _server API_ is a verification channel the `standard` suite
probes, so no new Explorer CI is created.

**Where it runs.** In each component's own CI against its branch build — as a PR gate where that team already
runs Solo per PR (Mirror Node, Relay, JS SDK), and as an additive scheduled job for CN (3-hourly) and Block
Node (daily/weekly), with a PR gate for those two tracked separately (TCK-D6). A cron gates nothing, so that
split is recorded as a decision rather than left implicit.

**Home.** The Solo repo, released as a versioned action on its own release tags under a prefix Solo's
`semantic-release` ignores (TCK-D2). The reuse that buys is of the _repository_ — fixtures, helpers, CI
plumbing — not of Solo's internals: the suites are recreated against the observable CLI contract and the kit
imports nothing from `src/`.

**Default version model.** Hybrid at PR time (the candidate is provided, the other components track
latest-stable but stay overridable) plus a pinned tuple for nightly and release runs — TCK-D1's
recommendation, proposed as the default rather than as one option among four.

**Blocking opens.**

- **Version resolution.** Keith's PRD says latest-stable/hybrid; roadmap#199 says pinned tuples. The two
  disagree and must be reconciled first; neither source is readable by every reviewer, so their requirements
  need mirroring into GitHub (TCK-D0).
- **No written contract to conform to.** Until the Solo Deployment Contract exists (TCK-D4) this is an
  integration gate, not a TCK — and without it there is no rule for deciding whether a failure is the
  component's fault or Solo's.

**No longer blocking.** Branch builds are deployable today: `--component-image` / `--component-image-archive`
for Mirror Node, Relay, Explorer and Block Node, and `--local-build-path` for the Consensus Node, whose
runtime container we own (`solo-containers`) and whose chart we ship (`solo-deployment` in `solo-charts`) — so
there is no vendor CN image to swap in the first place. The remaining gaps are narrow and listed in design §2.

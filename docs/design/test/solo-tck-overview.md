# Solo TCK — Overview

**Status:** Draft (aligned to Keith's PRD v0.2) · **Roadmap:** [roadmap#199](https://github.com/hiero-ledger/roadmap/issues/199)
· **Epic:** [#4272](https://github.com/hiero-ledger/solo/issues/4272)
· **Detailed design:** [solo-tck-conformance-gate.md](./solo-tck-conformance-gate.md)

A one-page brief. For the full design and open questions, see the detailed doc above.

## What it is

The Solo TCK is a **black-box compatibility kit owned by the Solo team** that answers one question for
a candidate Hiero component build:

> **Does this build deploy cleanly via a supported Solo release and produce a functional network?**

It drives Solo only through the CLI and observable outputs — it never links to Solo's internals.

## Where and when it runs

**Inside each component's own CI, at PR time, against that PR's branch build.** The component gets a
single pass/fail Solo-compatibility signal *before* it merges — instead of the inlined, version-branched
Solo orchestration each component maintains today.

Consumers: **CN, Mirror Node, Block Node, JSON-RPC Relay**, the **JS SDK** Solo depends on, and **Solo
itself**. (Hiero Explorer is out of scope — a UI-only repo; its compatibility is covered implicitly by
Solo's standard-topology runs.)

## Why we need it

Today a component PR can break Solo's deployment contract, pass its own CI, merge, and ship — Solo only
discovers it later when bumping the pin. The signal is in the wrong repo at the wrong time. The fix is a
**test-ownership inversion**: components own their Solo-integration tests via the TCK at *their* PR time,
and Solo's own CI shrinks toward pure Solo mechanics.

## How a run works

1. **The component's CI builds its branch and hands the build to the TCK**, along with a supported Solo
   version.
2. **The TCK drives `solo` as a subprocess** to deploy a real network with that candidate.
3. **It verifies against reality** — pods Ready, an HCS transaction visible via mirror REST, JSON-RPC
   reachable where the relay is deployed — then tears down. Pass/fail.

## The two biggest open questions

1. **Version resolution.** The candidate is a branch build; what versions do the *other* components use?
   Keith's PRD says latest-stable / hybrid; roadmap#199 says pinned mainnet/testnet profiles. **These
   two source docs disagree and must be reconciled first.**
2. **Repo home.** A standalone `solo-tck` repo (independent versioning, clean boundary) or inside the
   Solo repo (reuse `test/e2e`, always in sync)? Deferred to the design phase.

See the [detailed design](./solo-tck-conformance-gate.md) for consumers, the run contract, topology
tiers, and the full open-questions list.

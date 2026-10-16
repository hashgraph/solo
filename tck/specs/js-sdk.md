# JS SDK lane specification

The candidate consists of the SDK, proto and cryptography workspace tarballs built from the caller's checkout.
Exactly one tarball for each package is required. Tarball metadata, not its filename, identifies a package.
The lane runs the candidate inside Solo and as the transaction client against one CN and its MN. Explorer, Relay
and the mirror pinger are disabled so the kit owns the test load. Resource limits are Solo's defaults.

| Probe | Scenario and pass condition |
| --- | --- |
| P1 | Validate component, companion semvers, exact candidate package set and Solo release policy before cluster creation. Unverified releases and mutable refs fail with exit 2. |
| P2 | Falcon deploy returns zero within eight minutes. Explicit deployment and namespace are `solo-tck`, including on Kubernetes-hosted runners. |
| P3 | The installed lock contains exactly one copy of every candidate package and each integrity equals its supplied tarball's sha512. Solo's own CJS and ESM resolutions reach that SDK copy. |
| P4 | Watch workload pods through deploy and all probes/load. Fail on any observed OOM, definitive image failure, crash loop, or post-deploy restart/replacement. All workload pods must be Ready at the end; completed jobs are accepted. A disconnected watch after workloads exist makes the stability evidence incomplete and fails. |
| P5 | The new account signs a 1-HBAR transfer to `0.0.2`, creates a topic and submits a unique message with the candidate SDK. Every receipt is SUCCESS. |
| P6 | Mirror REST returns the transfer by transaction ID with matching amounts/account and SUCCESS, and the topic message by topic/sequence with matching content, within 120 seconds. |
| P7 | Solo creates a funded account and updates its ED25519 key. The candidate SDK reads the installed key and uses it to sign P5. |
| P8 | Sustain 20 transactions per second for 120 seconds, alternating transfers and topic messages. All 2,400 submissions receive SUCCESS receipts. Mirror REST confirms the final transfer and message; P4 still holds. |

P1 and P3 happen before deployment. P7 then P5 then P6 run before P8. P4 spans the other probes and is finalized
before cleanup. Pod errors during cleanup are not workload stability failures. Setup/install, pod backends and
network failure attribution follow the [runner contract](../README.md#contract-and-reports); attribution never
changes whether a run fails.

Negative controls include an incorrect/duplicated candidate, an altered lock integrity, an unverified Solo release,
an absent or wrong mirror message, OOM/current and prior termination states, a restart, a replaced/deleted pod,
NotReady state, missing image and an incomplete set of probes. The previous SDK/Solo startup incompatibility remains
a known red control: Solo 0.93.0 with SDK 2.90.1 fails at node start; it is not classified as neutral infrastructure.

Local timing and platform evidence belong in the implementation's review packet until Linux release verification
has admitted a supported Solo release. No release-verification or adoption result is implied by this spec.

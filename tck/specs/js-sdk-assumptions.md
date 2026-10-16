# SDK assumptions exercised by the first lane

This inventory identifies the SDK interfaces exercised by this lane. It is not exhaustive certification of every
SDK API Solo might call. The SDK team must review this contract before caller adoption.

| Surface | Solo or kit assumption | Observable check |
| --- | --- | --- |
| Package loading | Solo can resolve the caller's SDK, proto and cryptography tarballs through its root npm overrides, for CJS and ESM. | Exact lock integrity and module roots in P3. |
| Node client | Solo can construct its network client, set the operator, query nodes and initialize the network with that SDK. `Client.ping` receives a configured node account, not operator `0.0.2`. | Falcon reaches a successful CN/MN deployment (P2). [Ping fix #6228](https://github.com/hiero-ledger/solo/pull/6228). |
| Account creation | Solo can submit account creation and recover the new account ID through the SDK. | `solo ledger account create` returns a funded account (P7). |
| Key update | Solo can accept an ED25519 DER key, update the account and serialize the new key correctly. | `solo ledger account update`, then candidate `AccountInfoQuery` agrees with the generated public key (P7). |
| Signing and receipts | The candidate can sign with the new key and return a SUCCESS receipt. | Candidate `TransferTransaction`, `TopicCreateTransaction`, `TopicMessageSubmitTransaction` and `getReceipt` (P5/P8). |
| Identifiers and content | Transaction IDs map to Mirror REST IDs; topic sequence numbers and submitted bytes survive consensus and ingestion. | Exact transfer/message readback (P6 and after P8). |
| Sustained use | The candidate can sustain the lane's fixed load while Solo's deployed backends remain stable. | 2,400 successful transactions, mirror catch-up, no OOM/restart and recorded resource samples (P4/P8). |

The initial implementation reuses [SDK #4537](https://github.com/hiero-ledger/hiero-sdk-js/pull/4537), including
the independent installed SDK check and newly keyed-account scenario. Solo assumptions are exercised only through
its CLI; no module from Solo's `src/` is imported. The control topology uses consensus account `0.0.3`, consensus
gRPC at `127.0.0.1:35211` and Mirror REST at `http://127.0.0.1:38081`, as Solo's one-shot interface exposes them.

# Environment Variables

## GENESIS\_KEY

* **Description:** ED25519 private key (DER hex) used as the genesis key of a new network. At `network deploy` Solo stores it in the `genesis-key` Kubernetes secret and sets `bootstrap.genesisPublicKey` on the consensus nodes to the matching public key. Later commands read the secret first, then this variable, then the default.
* **Default:** the well-known Solo genesis key.
* **Used in:** `src/core/constants.ts`, `src/core/genesis-key-resolver.ts`, `src/commands/network.ts`.

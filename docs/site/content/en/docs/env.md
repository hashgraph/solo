# Environment Variables

## GENESIS\_KEY

* **Description:** ED25519 private key (DER hex) used as the genesis key of a new network. At `network deploy` Solo stores it in the `genesis-key` Kubernetes secret and sets `bootstrap.genesisPublicKey` on the consensus nodes to the matching public key. Later commands read the secret first, then this variable, then the default.
* **Default:** the well-known Solo genesis key.
* **Used in:** `src/core/constants.ts`, `src/core/genesis-key-resolver.ts`, `src/commands/network.ts`.

## SOLO\_BLOCK-NODE-HELM-CHART\_DIRECTORY

* **Description:** Local Helm chart directory for the block node chart (e.g. `~/hiero-block-node/charts`), for testing a chart that has not been published. Config-system override of `blockNodeHelmChart.directory`; note the dashes inside the first segment.
* **Default:** unset (the published chart is used). The `--block-node-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/block-node.ts` (deploy, upgrade).

## SOLO\_EXPLORER-HELM-CHART\_DIRECTORY

* **Description:** Local Helm chart directory for the explorer chart (e.g. `~/hiero-mirror-node-explorer/charts`). Config-system override of `explorerHelmChart.directory`.
* **Default:** unset (the published chart is used). The `--explorer-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/explorer.ts` (deploy, upgrade).

## SOLO\_MIRROR-NODE-HELM-CHART\_DIRECTORY

* **Description:** Local Helm chart directory for the mirror node chart (e.g. `~/hiero-mirror-node/charts`). Only the chart templates are local; every image the chart references must already be pullable by the cluster. Config-system override of `mirrorNodeHelmChart.directory`.
* **Default:** unset (the published chart is used). The `--mirror-node-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/mirror-node.ts` (deploy, upgrade).

## SOLO\_RELAY-HELM-CHART\_DIRECTORY

* **Description:** Local Helm chart directory for the JSON-RPC relay chart (e.g. `~/hiero-json-rpc-relay/charts`). Config-system override of `relayHelmChart.directory`.
* **Default:** unset (the published chart is used). The `--relay-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/relay.ts` (deploy, upgrade).

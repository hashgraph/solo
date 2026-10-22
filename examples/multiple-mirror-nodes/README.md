# Multiple Mirror Nodes Example

This example deploys two mirror nodes in the same namespace of one Solo deployment, each importing its data from a
different source:

* **Mirror node 1** imports the record files of the consensus node from the bucket (MinIO). It also runs the pinger, which
  sends a steady stream of user transactions; the consensus node only writes a record file when a user transaction
  arrives, so without traffic this mirror node would not advance.
* **Mirror node 2** imports the block stream from a block node.

Each mirror node has its own database, database users and passwords, passwords secret, ingress controller and ingress
class. They share the PostgreSQL and Redis of the deployment.

## What It Does

* Creates a Kind Kubernetes cluster for local testing
* Deploys a block node, then a consensus node that streams both record files and blocks
  (`BLOCK_STREAM_STREAM_MODE=BOTH`)
* Adds mirror node 1 with `--mirror-node-source bucket --pinger`
* Adds mirror node 2 with `--mirror-node-source block-node`
* Offers a `verify` task that shows both mirror nodes side by side

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-multiple-mirror-nodes.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/multiple-mirror-nodes).

## Usage

1. **Install dependencies:**
   * [Task](https://taskfile.dev/)
   * [Node.js](https://nodejs.org/)
   * [npm](https://www.npmjs.com/)
   * [kubectl](https://kubernetes.io/docs/tasks/tools/)
   * [kind](https://kind.sigs.k8s.io/)
   * [Helm](https://helm.sh/)
   * [jq](https://jqlang.github.io/jq/) and [curl](https://curl.se/) for the `verify` task

2. **Start the network:**
   ```sh
   task
   ```

3. **Verify the setup:**
   ```sh
   task verify
   ```
   It lists the Helm releases, pods, passwords secrets and ingress classes of both mirror nodes, shows that only the block
   node importer has the `blocknode` profile, and counts the transaction names each mirror node has seen.

4. **Destroy the network:**
   ```sh
   task destroy
   ```

## Reaching the Mirror Nodes

Solo port-forwards the ingress controller of each mirror node:

| Mirror node | Source     | REST API                       |
|-------------|------------|--------------------------------|
| 1           | bucket     | `http://localhost:38081/api/v1` |
| 2           | block node | `http://localhost:38082/api/v1` |

The ports are printed by each `mirror node add`; the second mirror node takes the next free port.

## What to Expect

* Both mirror nodes serve the same user transactions: the same consensus timestamp, result and transaction hash.
* The block node mirror node also has `HINTSPARTIALSIGNATURE` transactions. The consensus nodes submit these to each
  other for the threshold signature of the blocks; they are part of the block stream but never of the record stream.
* The two sources number blocks independently, so compare transactions by consensus timestamp or transaction hash, not
  by block number.

## Notes

* `--mirror-node-source` is not remembered: pass it again on every `mirror node upgrade`, otherwise the default `auto`
  applies and imports from the block node whenever one is deployed.
* The block node is added before the consensus network so that the network is configured to stream to it.
* `task verify` expects the default names of a fresh deployment (`mirror-1` and `mirror-2`) and the default ports.
* To add a third mirror node, run `mirror node add` again; every mirror node in a namespace gets its own suffixed resources.

## Files

* `Taskfile.yml` — Automation tasks and configuration

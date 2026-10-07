# State Save and Restore Example

This example demonstrates how to save signed consensus-node state from a running Solo network, recreate the cluster from scratch, and start the nodes again from that saved state. It then reuses that same saved state to demonstrate a **network transplant** — starting a *different*, separately keyed network from it.

## What it does

* Creates an initial Solo network with consensus nodes and a block node
* Runs transactions to generate state
* Freezes the network and downloads the signed state, roster, and key material
* Destroys the initial network and the Kind cluster
* Recreates the cluster and a fresh network with the same deployment metadata and keys
* Restores the saved state into the new network and verifies it came back up
* Transplants the same state into a second network whose keys were generated independently, and verifies
  that the consensus node adopted the roster Solo generated for it

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-state-save-and-restore.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/state-save-and-restore).

## Prerequisites

* [Kind](https://kind.sigs.k8s.io/) - Kubernetes in Docker
* [kubectl](https://kubernetes.io/docs/tasks/tools/) - Kubernetes CLI
* [Node.js](https://nodejs.org/) - JavaScript runtime
* [Task](https://taskfile.dev/) - Task runner
* `jq` - used to extract key material from Kubernetes secrets during save/restore

## Quick Start

### Run Complete Workflow (One Command)

```bash
task               # Run entire workflow: setup → save → restore → transplant
task destroy       # Cleanup when done
```

### Step-by-Step Workflow

```bash
task setup          # 1. Deploy consensus network and block node (5-10 min)
task stop-network   # 2. Freeze the network so the saved state is fully signed
task save-state     # 3. Save state, roster, and key material (2-5 min)
task restore        # 4. Recreate the cluster and restore (3-5 min)
task transplant     # 5. Transplant the state into a separately keyed network (10-15 min)
task destroy        # 6. Cleanup
```

> `task stop-network` is required before `task save-state`: `solo consensus state download` only accepts
> nodes that are frozen or stopped, so skipping it fails rather than capturing a half-written state. The
> one-command `task` workflow freezes for you.

## Usage

### 1. Deploy Initial Network

```sh
task setup
```

This will:

* Create a Kind cluster
* Initialize Solo and connect the cluster reference
* Deploy a block node (so the consensus node does not require MinIO-backed stream storage)
* Deploy a consensus network with the configured number of nodes
* Run sample transactions to generate state

### 2. Freeze and Save Network State

```sh
task stop-network
task save-state
```

This will:

* Freeze the network so the saved state is fully signed
* Download signed state from all consensus nodes
* Save the original roster/network definition (used later to build `override-network.json`)
* Save consensus gossip and TLS key material from Kubernetes secrets
* Save everything to `./saved-states/`

### 3. Restore Network

```sh
task restore
```

This will:

* Destroy the block node and consensus network, then delete the Kind cluster
* Recreate the Kind cluster and reconnect the cluster reference/deployment
* Restore the saved consensus key material into the Solo cache
* Redeploy the block node and a fresh consensus network (same deployment metadata and keys)
* Generate `override-network.json` from the saved roster and the fresh cluster's current service IPs, and copy it
  into each consensus node pod
* Start all nodes together from the saved state with `solo consensus node start --state-file`
* Verify both nodes reach `FREEZE_COMPLETE` with no invalid state signature

### 4. Cleanup

```sh
task destroy
```

This will destroy the network resources, delete the Kind cluster, and clean up saved state files.

## Available Tasks

* `default` (or just `task`) - Run complete workflow: setup → stop-network → save-state → restore → transplant
* `setup` - Deploy initial consensus network
* `stop-network` - Freeze the consensus network so the saved state is fully signed
* `save-state` - Download consensus node state and save restore metadata (roster + keys)
* `restore` - Recreate a fresh cluster, restore state, and verify the saved network can boot again
* `verify-state` - Verify restored state without submitting transactions to a frozen network
* `transplant` - Start a separately keyed network from the saved state and verify the generated roster
* `deploy-transplant-target` - Deploy the transplant target network, stopping before start
* `start-transplant` - Start the target network with `--transplant`
* `verify-transplant` - Assert the consensus node consumed `override-network.json`
* `destroy-transplant` - Remove the transplant target network
* `destroy` - Delete cluster and clean up all resources
* `clean-state` - Remove saved state files

## Customization

You can adjust settings by editing the `vars:` section in `Taskfile.yml`:

* `NETWORK_SIZE` - Number of consensus nodes (default: 2)
* `NODE_ALIASES` - Node identifiers (default: node1,node2)
* `STATE_SAVE_DIR` - Directory to save state files (default: ./saved-states)

## State Files

Saved state files are stored in `./saved-states/` with the following structure:

```
saved-states/
├── original-network.json               # Saved roster/network definition
├── override-network.json               # Generated during restore from original-network.json
├── current-service-endpoints.json      # Generated during restore from `kubectl get service`
├── keys/                               # Saved consensus gossip and TLS key material
├── restore-input/
│   └── states/<cluster-ref>/<namespace>/network-<node-alias>-0-state.zip
└── state-restore-namespace/
    ├── network-node1-0-state.zip
    └── network-node2-0-state.zip
```

**Notes:**

* State files are named using the pod naming convention: `network-<node-alias>-0-state.zip`
* During save: state is downloaded from each frozen consensus node, along with the original roster JSON and
  consensus key material
* During restore: a per-node restore input directory is built and passed to `solo consensus node start --state-file`

The example also includes:

```
scripts/
└── generate-override-network.mjs   # Rewrites gossip/service endpoints in the saved roster
```

`generate-override-network.mjs` reads the saved `original-network.json` and the fresh cluster's current
`kubectl get service` output, rewrites each node's gossip/service endpoint IP address to the fresh cluster's
service `clusterIP`, and writes the result to `override-network.json`.

## How It Works

### State Saving Process

1. **Freeze Network**: Uses `solo consensus network freeze` so the saved state is fully signed
2. **Download State**: Uses `solo consensus state download` to download signed state from each consensus node to
   `~/.solo/logs/<namespace>/`
3. **Copy State Files**: Copies state files from `~/.solo/logs/<namespace>/` to `./saved-states/` directory
4. **Save Network Definition**: Exports the roster/network JSON from a node pod to `original-network.json`, used
   later to generate `override-network.json`
5. **Save Key Material**: Exports consensus gossip and TLS key material from Kubernetes secrets to `./saved-states/keys/`

### State Restoration Process

1. **Cluster Recreation**: Destroys the block node, consensus network, and Kind cluster, then recreates the
   cluster and reconnects the cluster reference/deployment
2. **Key Restoration**: Restores the saved consensus key material into the Solo cache so key generation is skipped
3. **Fresh Network Deployment**: Redeploys the block node and consensus network with the original deployment
   metadata, then runs node setup for the new pods
4. **Override Network Generation**: Builds `override-network.json` from the saved roster and the fresh cluster's
   current service IPs, and copies it into each consensus node pod's config directory
5. **Restore Input Build**: Builds `./saved-states/restore-input/states/<cluster-ref>/<namespace>/` and copies each
   node's saved state zip
6. **State Upload and Start**: Starts all nodes together with `solo consensus node start --state-file ./saved-states/restore-input`
7. **Verification**: Checks that both restored nodes report platform status `FREEZE_COMPLETE` and that no
   `Invalid State Signature` was logged

### Network Transplant Process

Restoring a network's own state, above, keeps the roster carried by that state. A **transplant** is the
other case: starting a *different* network from it.

A saved state embeds the address book of the network it came from — node IDs, gossip and service
endpoints, and public keys. Started naively from that state, the target network would try to *be* the
source network: it would gossip to endpoints that do not exist and present certificates that do not match
its own private keys, failing with `The signing certificate does not match the signing private key`.

Solo resolves this by writing `override-network.json` into `data/config`, where the consensus node looks
for it. The file describes the roster the target network is actually running with, and it is generated
from the live deployment rather than a snapshot, so it stays correct when nodes are added or updated.

This only happens when you ask for it, with `--transplant` on `consensus node start`. That matters:
restoring a network's own state must leave the roster in the state alone, and replacing it there forces a
roster transition the consensus node cannot replay past. `--transplant` is the statement that the state
came from somewhere else. Passing `--transplant` without `--state-file` is rejected rather than silently
ignored.

Because `deploy-transplant-target` generates the target network's keys independently, its roster genuinely
differs from the one in the state. The target reaching a healthy running state is therefore only possible
if the override was written, readable and consumed — which is what makes `verify-transplant` meaningful
rather than vacuous. `scripts/verify-override-network.sh` asserts, against the target network's pod:

1. the node logged `Parsed OVERRIDE network info` — the node itself confirming it read the file
2. no `AccessDeniedException` for the override — it must be owned by the `hedera` user the node runs as,
   not by root
3. the consumed roster names the target namespace and not the source one
4. the node is running with no signing-certificate mismatch

Assertion 1 is the load-bearing one. Note that the consensus node **moves** the file into
`data/config/.archive/<round>/override-network.json` once it has been consumed, so checking for the file
at `data/config/override-network.json` after a successful start would fail against a working system.

## Notes

* State files can be large (several GB per node) depending on network activity
* Ensure sufficient disk space in `./saved-states/` directory
* The network must be frozen before saving state, otherwise the state files may change while being read
* **Per-node State Restore**: Uses each node's own state zip and starts all nodes together on a freshly recreated
  cluster, with `override-network.json` remapping gossip/service endpoints to the new cluster's service IPs
* Restored nodes come up in `FROZEN`/`FREEZE_COMPLETE` phase rather than `ACTIVE`, since they resume from a frozen
  state rather than starting fresh

### View Logs

```bash
# Consensus node logs
kubectl logs -n state-restore-namespace network-node1-0 -f
```

### Manual State Operations

```bash
# Download state manually
npm run solo --silent -- consensus state download --deployment state-restore-deployment --node-aliases node1

# Check downloaded state files (in Solo logs directory)
ls -lh ~/.solo/logs/state-restore-namespace/

# Check saved state files (in saved-states directory)
ls -lh ./saved-states/
```

## Expected Timeline

* Initial setup: 5-10 minutes
* State download: 2-5 minutes (depends on state size)
* Network restoration: 3-5 minutes
* Network transplant: 10-15 minutes
* Total workflow: ~20-25 minutes

## File Sizes

Typical state file sizes:

* Small network (few transactions): 100-500 MB per node
* Medium activity: 1-3 GB per node
* Heavy activity: 5-10+ GB per node

Ensure you have sufficient disk space in `./saved-states/` directory.

## Advanced Usage

### Save State at Specific Time

Run `task stop-network` then `task save-state` at any point after running transactions. The state captures the
network at that moment.

### Restore to Different Cluster

1. Save state on cluster A
2. Copy `./saved-states/` directory to cluster B
3. Run `task restore` on cluster B

### Multiple State Snapshots

```bash
# Save multiple snapshots
task save-state
mv saved-states saved-states-backup1

# Later...
task save-state
mv saved-states saved-states-backup2

# Restore specific snapshot
mv saved-states-backup1 saved-states
task restore
```

## Troubleshooting

**State download fails**:

* Ensure the network was frozen with `task stop-network` before downloading
* Check pod logs: `kubectl logs -n <namespace> <pod-name>`
* Increase timeout or download nodes sequentially

**Restore fails**:

* Verify state files exist in `./saved-states/`
* Check file permissions
* Ensure `NETWORK_SIZE`/`NODE_ALIASES` match what was used to save state
* Check state file integrity

**Invalid state signature after restore**:

* Confirm `override-network.json` was generated and copied into each pod (see `deploy-network-with-state` output)
* Confirm the saved consensus keys were restored into the Solo cache before redeploying the network

**Out of disk space**:

* Clean old state files with `task clean-state`
* Check available disk space before saving state

### Debugging Commands

```bash
# Check pod status
kubectl get pods -n state-restore-namespace

# Describe problematic pod
kubectl describe pod <pod-name> -n state-restore-namespace

# Get pod logs
kubectl logs <pod-name> -n state-restore-namespace
```

## Example Output

```bash
$ task setup
✓ Create Kind cluster
✓ Initialize Solo
✓ Deploy block node
✓ Deploy consensus network (2 nodes)
✓ Generate sample transactions

$ task stop-network
✓ Network frozen

$ task save-state
✓ Saved state for node1 (network-node1-0-state.zip)
✓ Saved state for node2 (network-node2-0-state.zip)
✓ Source network JSON exported
✓ Saved consensus key material
State saved to: ./saved-states/

$ task restore
✓ Network resources destroyed
✓ Cluster destroyed
✓ Restored consensus key material
✓ Block node and consensus network redeployed
✓ Generated override-network.json
✓ override-network.json copied to each consensus node pod
✓ Nodes started with restored state
✓ State verification complete - both restored nodes are FREEZE_COMPLETE with no ISS
```

***

This example is self-contained and does not require files from outside this directory.

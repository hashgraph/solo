# State Save and Restore Example

This example demonstrates how to save network state from a running Solo network, recreate a new network, and load the saved state with a mirror node using an external PostgreSQL database.

## What it does

* Creates an initial Solo network with consensus nodes and mirror node
* Uses an external PostgreSQL database for the mirror node
* Runs transactions to generate state
* Downloads and saves the network state and database dump
* Destroys the initial network
* Creates a new network with the same configuration
* Restores the saved state and database to the new network

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
* [Helm](https://helm.sh/) - Kubernetes package manager (for external database option)

## Quick Start

### Run Complete Workflow (One Command)

```bash
task               # Run entire workflow: setup → save → restore
task destroy       # Cleanup when done
```

### Step-by-Step Workflow

```bash
task setup          # 1. Deploy network with external database (5-10 min)
task save-state     # 2. Save state and database (2-5 min)
task restore        # 3. Recreate and restore (3-5 min)
task destroy        # 5. Cleanup
```

## Usage

### 1. Deploy Initial Network

```sh
task setup
```

This will:

* Create a Kind cluster
* Deploy PostgreSQL database
* Initialize Solo
* Deploy consensus network with 3 nodes
* Deploy mirror node connected to external database
* Run sample transactions to generate state

### 2. Save Network State and Database

```sh
task save-state
```

This will:

* Download state from all consensus nodes
* Export PostgreSQL database dump
* Save both to `./saved-states/` directory
* Display saved state information

### 3. Restore Network and Database

```sh
task restore
```

This will:

* Stop and destroy existing network
* Recreate PostgreSQL database
* Import database dump
* Create new consensus network with same configuration
* Upload saved state to new nodes
* Start nodes with restored state
* Reconnect mirror node to database
* Verify the restored state

### 4. Cleanup

```sh
task destroy
```

This will delete the Kind cluster and clean up all resources.

## Available Tasks

* `default` (or just `task`) - Run complete workflow: setup → save-state → restore
* `setup` - Deploy initial network with external PostgreSQL database
* `save-state` - Download consensus node state and export database
* `restore` - Recreate network and restore state with database
* `verify-state` - Verify restored state matches original
* `destroy` - Delete cluster and clean up all resources
* `clean-state` - Remove saved state files

## Customization

You can adjust settings by editing the `vars:` section in `Taskfile.yml`:

* `NETWORK_SIZE` - Number of consensus nodes (default: 2)
* `NODE_ALIASES` - Node identifiers (default: node1,node2)
* `STATE_SAVE_DIR` - Directory to save state files (default: ./saved-states)
* `POSTGRES_PASSWORD` - PostgreSQL password for external database

## State Files

Saved state files are stored in `./saved-states/` with the following structure:

```
saved-states/
├── state-restore-namespace/
│   ├── network-node1-0-state.zip
│   └── network-node2-0-state.zip
└── database-dump.sql          # PostgreSQL database export
```

**Notes:**

* State files are named using the pod naming convention: `network-<node-alias>-0-state.zip`
* During save: All node state files are downloaded
* During restore: A per-node restore input directory is built and passed to `solo consensus node start --state-file`

The example also includes:

```
scripts/
└── init.sh                 # Database initialization script
```

The `init.sh` script sets up the PostgreSQL database with:

* mirror\_node database
* Required schemas (public, temporary)
* Roles and users (postgres, readonlyuser)
* PostgreSQL extensions (btree\_gist, pg\_stat\_statements, pg\_trgm)
* Proper permissions and grants

## How It Works

### State Saving Process

1. **Download State**: Uses `solo consensus state download` to download signed state from each consensus node to `~/.solo/logs/<namespace>/`
2. **Copy State Files**: Copies state files from `~/.solo/logs/<namespace>/` to `./saved-states/` directory
3. **Export Database**: Uses `pg_dump` with `--clean --if-exists` flags to export the complete database including schema and data

### State Restoration Process

1. **Database Recreation**: Deploys fresh PostgreSQL and runs `init.sh` to create database structure (database, schemas, roles, users, extensions)
2. **Database Restore**: Imports database dump which drops and recreates tables with all data
3. **Stable Service Validation**: Verifies per-node service DNS names are resolvable (`network-<node>-svc.<namespace>.svc.cluster.local`)
4. **Restore Input Build**: Builds `./saved-states/restore-input/states/<cluster-ref>/<namespace>/` and copies each node's state zip
5. **State Upload and Start**: Starts all nodes together with `solo consensus node start --state-file ./saved-states/restore-input`
   * State files are extracted to `data/saved/`
   * Node ID Renaming: Directory paths containing node IDs are automatically renamed to match each target node
6. **Mirror Node**: Deploys mirror node connected to restored database and seeds initial data
7. **Verification**: Checks that restored state matches original

## Notes

* State files can be large (several GB per node) depending on network activity
* Ensure sufficient disk space in `./saved-states/` directory
* External PostgreSQL database provides data persistence and queryability
* State restoration maintains transaction history and account balances
* Mirror node will resume from the restored state point
* **Per-node State Restore**: Uses each node's own state zip and starts all nodes together on the existing network pods
* Stable per-node service names are validated before restore start
* Database dump includes all mirror node data (transactions, accounts, etc.)

### View Logs

```bash
# Consensus node logs
kubectl logs -n state-restore-namespace network-node1-0 -f

# Mirror node logs
kubectl logs -n state-restore-namespace mirror-node-<pod-name> -f

# Database logs
kubectl logs -n database state-restore-postgresql-0 -f
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
* Total workflow: ~15-20 minutes

## File Sizes

Typical state file sizes:

* Small network (few transactions): 100-500 MB per node
* Medium activity: 1-3 GB per node
* Heavy activity: 5-10+ GB per node

Ensure you have sufficient disk space in `./saved-states/` directory.

## Advanced Usage

### Save State at Specific Time

Run `task save-state` at any point after running transactions. The state captures the network at that moment.

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

* Ensure nodes are running and healthy
* Check pod logs: `kubectl logs -n <namespace> <pod-name>`
* Increase timeout or download nodes sequentially

**Restore fails**:

* Verify state files exist in `./saved-states/`
* Check file permissions
* Ensure network configuration matches original
* Check state file integrity

**Database connection fails**:

* Verify PostgreSQL pod is ready
* Check credentials in Taskfile.yml
* Review PostgreSQL logs

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

# Access database shell
kubectl exec -it state-restore-postgresql-0 -n database -- psql -U postgres -d mirror_node
```

## Example Output

```bash
$ task setup
✓ Create Kind cluster
✓ Initialize Solo
✓ Deploy consensus network (3 nodes)
✓ Deploy mirror node
✓ Generate sample transactions
Network ready at: http://localhost:5551

$ task save-state
✓ Downloading state from node1... (2.3 GB)
✓ Downloading state from node2... (2.3 GB)
✓ Downloading state from node3... (2.3 GB)
✓ Saving metadata
State saved to: ./saved-states/

$ task restore
✓ Stopping existing network
✓ Creating new network
✓ Uploading state to node1...
✓ Uploading state to node2...
✓ Uploading state to node3...
✓ Starting nodes with restored state
✓ Verifying restoration
State restored successfully!
```

***

This example is self-contained and does not require files from outside this directory.

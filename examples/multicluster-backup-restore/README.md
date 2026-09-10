# Multi-Cluster Backup and Restore Example

This example demonstrates a complete multi-cluster backup and restore workflow for a Hiero network using Solo's `config ops` commands. It showcases an advanced deployment pattern with:

1. **Dual-cluster deployment** - Consensus nodes distributed across two Kubernetes clusters
2. **External PostgreSQL database** - Mirror node using external database for production-like setup
3. **Complete component stack** - Consensus, block, mirror, relay, and explorer nodes
4. **Full backup/restore cycle** - ConfigMaps, Secrets, Logs, State files, and database dumps
5. **Disaster recovery** - Complete cluster recreation and restoration from backup

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/multicluster-backup-restore.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/multicluster-backup-restore).

## Architecture

### Cluster Distribution

* **Cluster 1 (solo-e2e-c1)**: node1 (first consensus node)
* **Cluster 2 (solo-e2e-c2)**: node2 (second consensus node), block node, mirror node, explorer, relay, PostgreSQL database

This demonstrates a realistic multi-cluster deployment where components are distributed across different Kubernetes clusters for high availability and fault tolerance.

**Self-Contained Example**: All configuration files and scripts are included in this directory - no external dependencies required.

## Prerequisites

* [Task](https://taskfile.dev/) installed (`brew install go-task/tap/go-task` on macOS)
* [Kind](https://kind.sigs.k8s.io/) installed (`brew install kind` on macOS)
* [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
* [Helm](https://helm.sh/) installed (`brew install helm` on macOS)
* Node.js 22+ and npm installed
* Docker Desktop running with sufficient resources (Memory: 12GB+ recommended for dual clusters)

## Quick Start

### Run Complete Workflow

Execute the entire backup/restore workflow with a single command:

```bash
task
```

This will:

* ✅ Create two Kind clusters with Docker networking
* ✅ Deploy consensus nodes across both clusters (node1 on cluster 1, node2 on cluster 2)
* ✅ Deploy PostgreSQL database on cluster 2
* ✅ Deploy block node, mirror node (with external DB), explorer, and relay on cluster 2
* ✅ Generate test transactions to create network state
* ✅ Backup the entire network (ConfigMaps, Secrets, Logs, State, Database)
* ✅ Destroy both clusters completely
* ✅ Recreate clusters and restore all components from backup
* ✅ Verify static consensus node LoadBalancer IP mapping after restore
* ✅ Verify loaded roster gossip endpoints match live node service IPs
* ✅ Verify the network is operational with new transactions

### Clean Up

Remove the cluster and all backup files:

```bash
task destroy
```

## Available Tasks

### Main Workflow Tasks

| Task | Description |
|------|-------------|
| `task` (default) | Run complete multi-cluster backup/restore workflow |
| `task initial-deploy` | Create dual clusters and deploy complete network |
| `task generate-transactions` | Create test transactions |
| `task backup` | Freeze network and create backup (including database) |
| `task restore-clusters` | Recreate Kind clusters from backup |
| `task restore-network` | Restore network components from backup |
| `task restore-config` | Restore ConfigMaps, Secrets, Logs, State, and database |
| `task restart` | Start consensus nodes and run post-start IP/roster checks |
| `task verify` | Verify restored network functionality |
| `task destroy` | Remove clusters and backup files |

### Component Tasks

| Task | Description |
|------|-------------|
| `task deploy-external-database` | Deploy PostgreSQL database with Helm |
| `task deploy-mirror-external` | Seed database for mirror node |
| `task destroy-cluster` | Delete all Kind clusters |

## Step-by-Step Workflow

### 1. Deploy Initial Multi-Cluster Network

```bash
task initial-deploy
```

This creates and configures:

**Infrastructure:**

* 2 Kind clusters (solo-e2e-c1, solo-e2e-c2)
* Docker network for inter-cluster communication
* MetalLB load balancer on both clusters
* PostgreSQL database on cluster 2

**Network Components:**

* node1 on cluster 1
* node2 on cluster 2
* 1 block node on cluster 2
* 1 mirror node (with external PostgreSQL) on cluster 2
* 1 explorer node on cluster 2
* Relay nodes on cluster 2

### 2. Generate Network State

```bash
task generate-transactions
```

Creates 3 test accounts with 100 HBAR each to generate network state.

### 3. Create Backup

```bash
task backup
```

This will:

* Freeze the network
* Backup ConfigMaps, Secrets, Logs, and State files using `solo config ops backup`
* Export PostgreSQL database to SQL dump

**Backup Location:**

* All backup files: `./solo-backup/`
* Database dump: `./solo-backup/database-dump.sql`

### 4. Destroy Clusters

```bash
task destroy-cluster
```

This deletes both Kind clusters completely, simulating a complete disaster recovery scenario.

### 5. Restore Clusters

```bash
task restore-clusters
```

This will:

* Clean Solo cache and temporary files
* Recreate both Kind clusters from backup metadata
* Setup Docker networking and MetalLB
* Initialize cluster configurations

### 6. Restore Network

```bash
task restore-network
```

This will:

* Deploy PostgreSQL database on cluster 2
* Initialize cluster configurations
* Deploy all network components (consensus, block, mirror, explorer, relay)
* Verify consensus node service LoadBalancer IPs match `expected-lb-ips.env`

### 7. Restore Configuration and State

```bash
task restore-config
```

This will:

* Freeze the network
* Restore ConfigMaps, Secrets, Logs, and State files using `solo config ops restore-config`
* Restore PostgreSQL database from SQL dump
* Re-upload state after pod restarts to preserve restored height

### 8. Restart Consensus Nodes and Validate Roster/IP Consistency

```bash
task restart
```

This will:

* Start consensus nodes
* Verify static node service LoadBalancer IPs (`scripts/verify-lb-ips.sh`)
* Verify loaded roster gossip IPs match live node service IPs (`scripts/verify-roster-vs-lb.sh`)

### 9. Verify Restored Network

```bash
task verify
```

Verifies:

* All pods are running across both clusters
* Previously created accounts exist (e.g., account 3.2.3)
* Network can process new transactions
* Database has been restored correctly

## Configuration

Edit variables in `Taskfile.yml` to customize:

```yaml
vars:
  NETWORK_SIZE: "2"                           # Number of consensus nodes
  NODE_ALIASES: "node1,node2"                 # Node identifiers
  DEPLOYMENT: "external-database-test-deployment"
  NAMESPACE: "external-database-test"
  BACKUP_DIR: "./solo-backup"                 # All backup files location
  
  # PostgreSQL Configuration
  POSTGRES_USERNAME: "postgres"
  POSTGRES_PASSWORD: "XXXXXXXX"
  POSTGRES_READONLY_USERNAME: "readonlyuser"
  POSTGRES_READONLY_PASSWORD: "XXXXXXXX"
  POSTGRES_NAME: "my-postgresql"
  POSTGRES_DATABASE_NAMESPACE: "database"
  POSTGRES_HOST_FQDN: "my-postgresql.database.svc.cluster.local"
```

### Cluster Configuration

The Kind cluster configurations in `kind-cluster-1.yaml` and `kind-cluster-2.yaml` can be customized:

* **Node count** - Add more worker nodes per cluster
* **Port mappings** - Expose additional ports for services
* **Resource limits** - Adjust CPU and memory constraints
* **Volume mounts** - Add persistent storage options

### MetalLB Configuration

The MetalLB configurations in `metallb-cluster-1.yaml` and `metallb-cluster-2.yaml` define:

* **IP address ranges** for load balancer services
* **Load balancer type** (Layer 2 mode)
* **Address allocation** per cluster

### Static Node Service IP Mapping

`expected-lb-ips.env` defines the required static LB IPs for:

* `kind-solo-e2e-c1/network-node1-svc`
* `kind-solo-e2e-c2/network-node2-svc`

`task restore-network` verifies these IPs after services are created. If they differ, the workflow fails fast.

## What Gets Backed Up?

The backup process captures:

### ConfigMaps (via `solo config ops backup`)

* Network configuration (`network-node-data-config-cm`)
* Bootstrap properties
* Application properties
* Genesis network configuration
* Address book

### Secrets (via `solo config ops backup`)

* Node keys (TLS, signing, agreement)
* Consensus keys
* All Opaque secrets in the namespace

### Logs (from each pod via `solo config ops backup`)

* Account balances
* Record streams
* Statistics
* Application logs
* Network logs

### State Files (from each consensus node via `solo config ops backup`)

* Consensus state
* Merkle tree state
* Platform state
* Swirlds state

### PostgreSQL Database

* Complete database dump (via `pg_dump`)
* Mirror node schema and data
* Account balances and transaction history

## Backup Directory Structure

```
solo-backup/
├── solo-e2e-c1/                    # Cluster 1 backup
│   ├── configmaps/
│   │   ├── network-node-data-config-cm.yaml
│   │   └── ...
│   ├── secrets/
│   │   ├── node1-keys.yaml
│   │   └── ...
│   ├── logs/
│   │   └── network-node1-0.zip  (includes state files)
│   └── solo-remote-config.yaml
├── solo-e2e-c2/                    # Cluster 2 backup
│   ├── configmaps/
│   ├── secrets/
│   ├── logs/
│   │   └── network-node2-0.zip  (includes state files)
│   └── solo-remote-config.yaml
└── database-dump.sql               # PostgreSQL database dump
```

## Troubleshooting

### View Cluster Status

```bash
# Cluster 1
kubectl cluster-info --context kind-solo-e2e-c1
kubectl get pods -n external-database-test -o wide --context kind-solo-e2e-c1

# Cluster 2
kubectl cluster-info --context kind-solo-e2e-c2
kubectl get pods -n external-database-test -o wide --context kind-solo-e2e-c2
kubectl get pods -n database -o wide --context kind-solo-e2e-c2
```

### View Pod Logs

```bash
# Node 1 (Cluster 1)
kubectl logs -n external-database-test network-node1-0 -c root-container --tail=100 --context kind-solo-e2e-c1

# Node 2 (Cluster 2)
kubectl logs -n external-database-test network-node2-0 -c root-container --tail=100 --context kind-solo-e2e-c2

# PostgreSQL
kubectl logs -n database my-postgresql-0 --tail=100 --context kind-solo-e2e-c2
```

### Open Shell in Pod

```bash
# Consensus node
kubectl exec -it -n external-database-test network-node1-0 -c root-container --context kind-solo-e2e-c1 -- /bin/bash

# PostgreSQL
kubectl exec -it -n database my-postgresql-0 --context kind-solo-e2e-c2 -- /bin/bash
```

### Check Database

```bash
# Connect to PostgreSQL
kubectl exec -it -n database my-postgresql-0 --context kind-solo-e2e-c2 -- \
  env PGPASSWORD=XXXXXXXX psql -U postgres -d mirror_node

# List tables
\dt

# Check account balances
SELECT * FROM account_balance LIMIT 10;
```

### Manual Cleanup

```bash
# Delete clusters
kind delete cluster -n solo-e2e-c1
kind delete cluster -n solo-e2e-c2

# Remove Docker network
docker network rm kind

# Remove backup files
rm -rf ./solo-backup

# Clean Solo cache
rm -rf ~/.solo/*
rm -rf test/data/tmp/*
```

## Advanced Usage

### Run Individual Steps

```bash
# Deploy dual-cluster network
task initial-deploy

# Generate test data
task generate-transactions

# Create backup (includes database)
task backup

# Manually inspect backup
ls -lh ./solo-backup/
ls -lh ./solo-backup/solo-e2e-c1/
ls -lh ./solo-backup/solo-e2e-c2/

# Destroy clusters
task destroy-cluster

# Restore clusters only
task restore-clusters

# Restore network components
task restore-network

# Restore configuration and state
task restore-config

# Restart consensus and run roster/IP checks
task restart

# Verify
task verify
```

### Use Released Version of Solo

By default, the Taskfile uses the development version (`npm run solo-test --`). To use the released version:

```bash
USE_RELEASED_VERSION=true task
```

### Customize Component Options

Edit `command.yaml` to customize mirror node deployment options:

```yaml
mirror:
  - --deployment
  - external-database-test-deployment
  - --cluster-ref
  - solo-e2e-c2
  - --enable-ingress
  - --pinger
  - --dev
  - --quiet-mode
  - --use-external-database
  - --external-database-host
  - my-postgresql.database.svc.cluster.local
  # Add more options as needed
```

### Modify Cluster Configuration

Since all configuration files are local, you can easily customize the clusters:

```bash
# Edit cluster configurations
vim kind-cluster-1.yaml    # Modify cluster 1 setup
vim kind-cluster-2.yaml    # Modify cluster 2 setup

# Edit MetalLB configurations  
vim metallb-cluster-1.yaml # Adjust IP ranges for cluster 1
vim metallb-cluster-2.yaml # Adjust IP ranges for cluster 2

# Then run the deployment
task initial-deploy
```

### Custom MetalLB Configuration

You can specify custom MetalLB configuration files during restore operations:

```bash
# Use custom metallb configuration files
$SOLO_COMMAND config ops restore-clusters \
  --input-dir ./solo-backup \
  --metallb-config custom-metallb-{index}.yaml

# The {index} placeholder gets replaced with the cluster number (1, 2, etc.)
# Result: custom-metallb-1.yaml, custom-metallb-2.yaml, etc.
```

The metallb configuration files use the `{index}` placeholder to support multiple clusters:

* `metallb-cluster-{index}.yaml` → `metallb-cluster-1.yaml`, `metallb-cluster-2.yaml`
* Custom patterns like `custom/loadbalancer-{index}.yaml` also work

## Key Commands Used

This example demonstrates the following Solo commands:

### Backup/Restore Commands

* **`solo config ops backup`** - Backs up ConfigMaps, Secrets, Logs, and State files
* **`solo config ops restore-clusters`** - Recreates clusters from backup metadata (supports `--metallb-config` flag)
* **`solo config ops restore-network`** - Restores network components from backup
* **`solo config ops restore-config`** - Restores ConfigMaps, Secrets, Logs, and State files
* **`solo consensus network freeze`** - Freezes the network before backup

### Multi-Cluster Commands

* **`solo cluster-ref config setup`** - Setup cluster reference configuration
* **`solo cluster-ref config connect`** - Connect cluster reference to kubectl context
* **`solo deployment config create`** - Create deployment with realm and shard
* **`solo deployment cluster attach`** - Attach cluster to deployment with node count

### Component Deployment Commands

* **`solo consensus network deploy`** - Deploy consensus network with load balancer
* **`solo consensus node setup/start`** - Setup and start consensus nodes
* **`solo block node add`** - Add block node to specific cluster
* **`solo mirror node add`** - Add mirror node with external database
* **`solo explorer node add`** - Add explorer node with TLS
* **`solo relay node add`** - Add relay node

## Important Notes

* **Multi-cluster networking** - Docker network enables communication between Kind clusters
* **External database** - PostgreSQL must be backed up and restored separately
* **Network must be frozen** before backup to ensure consistent state
* **Backup includes database** - PostgreSQL dump is part of the backup process
* **Restore is multi-step** - Clusters → Network → Configuration (in order)
* **Backup files can be large** - Ensure sufficient disk space (2GB+ for dual clusters)
* **Realm and shard** - Configured as realm 2, shard 3 for testing non-zero values

## Files

* `Taskfile.yml` - Main automation tasks and configuration
* `command.yaml` - Component deployment options for restore
* `expected-lb-ips.env` - Static LB IP mapping for consensus node services
* `scripts/verify-lb-ips.sh` - Verifies static LB IP mapping post-restore/start
* `scripts/verify-roster-vs-lb.sh` - Verifies loaded roster gossip endpoints match live LB IPs
* `scripts/init.sh` - PostgreSQL database initialization script
* `kind-cluster-1.yaml` - Kind cluster 1 configuration
* `kind-cluster-2.yaml` - Kind cluster 2 configuration
* `metallb-cluster-1.yaml` - MetalLB configuration for cluster 1
* `metallb-cluster-2.yaml` - MetalLB configuration for cluster 2

## Related Examples

* [external-database-test](../external-database-test/) - External database setup
* [state-save-and-restore](../state-save-and-restore/) - State file management

## Support

For issues or questions:

* Solo Documentation: https://github.com/hashgraph/solo
* Task Documentation: https://taskfile.dev/
* Hiero Documentation: https://docs.hedera.com/

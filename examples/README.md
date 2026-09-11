# The usage of examples in Solo

## Table of Contents

| Example Directory                                                   | Description                                                                                                         |
|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| [address-book](./address-book/)                                     | Example of using Yahcli to pull the ledger and mirror node address book                                             |
| [consensus-node-jvm-parameters](./consensus-node-jvm-parameters/)   | Example of customizing JVM parameters for Solo consensus nodes                                                      |
| [multicluster-backup-restore](./multicluster-backup-restore/)       | Multi-cluster backup/restore workflow with external PostgreSQL database and distributed consensus nodes             |
| [external-database-test](./external-database-test/)                 | Deploy a Solo network with an external PostgreSQL database                                                          |
| [hardhat-with-solo](./hardhat-with-solo/)                           | Example of using Hardhat to test a smart contract with a local Solo deployment                                      |
| [local-build-with-custom-config](./local-build-with-custom-config/) | Example of how to create and manage a custom Hiero Hashgraph Solo deployment using locally built consensus nodes    |
| [network-with-domain-names](./network-with-domain-names/)           | Setup a network using custom domain names for all components                                                        |
| [node-create-transaction](./node-create-transaction/)               | Manually write a NodeCreateTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [node-delete-transaction](./node-delete-transaction/)               | Manually write a NodeDeleteTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [node-update-transaction](./node-update-transaction/)               | Manually write a NodeUpdateTransaction and use the add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands. |
| [one-shot-falcon](./one-shot-falcon/)                               | Example of how to use the Solo **one-shot falcon** commands                                                         |
| [one-shot-local-build](./one-shot-local-build/)                     | Example of how to deploy a complete network using locally built component sources via the Solo one-shot falcon command |
| [rapid-fire](./rapid-fire/)                                         | Example of how to use the Solo **rapid-fire** commands                                                              |
| [state-save-and-restore](./state-save-and-restore/)                 | Save network state, restore it, and transplant it into a separately keyed network                                   |
| [running-solo-inside-cluster](./running-solo-inside-cluster/)       | Example of how to run the Solo network inside a privileged Ubuntu pod in a Kubernetes cluster for end-to-end testing |
| [version-upgrade-test](./version-upgrade-test/)                     | Example of how to upgrade all components of a Hiero network to current versions                                     |

## Accessing Examples

### From GitHub Repository

All examples are available in the [examples directory](https://github.com/hiero-ledger/solo/tree/main/examples) of the Solo repository. You can browse the source code, documentation, and configuration files directly on GitHub.

### Downloading Example Archives

Pre-packaged example archives are available for download from the [Solo releases page](https://github.com/hiero-ledger/solo/releases). Each example is packaged as a standalone zip file that includes all necessary configuration files and documentation.

To download a specific example:

1. Visit the [Solo releases page](https://github.com/hiero-ledger/solo/releases)
2. Navigate to the desired release version
3. Download the example archive (e.g., `example-backup-restore-workflow.zip`)

Example download URL format:

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-<example-name>.zip
```

For example, to download the `backup-restore-workflow` example from release `v0.49.0`:

```
https://github.com/hiero-ledger/solo/releases/download/v0.49.0/example-backup-restore-workflow.zip
```

After downloading, extract the archive and follow the README instructions inside.

## Prerequisites

* install taskfile: `npm install -g @go-task/cli`

## Running the examples with Taskfile

* `cd` into the directory under `examples` that has the `Taskfile.yml`, e.g. (from solo repo root directory) `cd examples/address-book/`
* make sure that your current kubeconfig context is pointing to the cluster that you want to deploy to
* run `task` which will do the rest and deploy the network and take care of many of the pre-requisites

NOTES:

* Some of these examples are for running against large clusters with a lot of resources available.
* Edit the values of the variables as needed.

## Customizing the examples

* take a look at the Taskfile.yml sitting in the subdirectory for the deployment you want to run
* make sure your cluster can handle the number in SOLO\_NETWORK\_SIZE, if not, then you will have to update that and make it match the number of nodes in the `init-containers-values.yaml`: `hedera.nodes[]`
* take a look at the `init-containers-values.yaml` file and make sure the values are correct for your deployment with special attention to:
  * resources
  * nodeSelector
  * tolerations

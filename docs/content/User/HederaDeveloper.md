### Use solo with local build hedera service code

> **⚠️ Warning**
> This document is out of date for the current release.  See [Step-by-step Guide](./StepByStepGuide.md) for the updated base commands to run that can be augmented with the extra flags and values provided in this guide. Hedera services and Platform SDK have moved to hiero-consensus-node repo <https://github.com/hiero-ledger/hiero-consensus-node>

First, please clone hedera service repo `https://github.com/hashgraph/hedera-services/` and build the code
with `./gradlew assemble`. If need to running multiple nodes with different versions or releases, please duplicate the repo or build directories in
multiple directories, checkout to the respective version and build the code.

Then you can start customized built hedera network with the following command:

```bash
SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo node keys --gossip-keys --tls-keys -i node1,node2,node3 
solo network deploy -i node1,node2,node3 -n "${SOLO_NAMESPACE}"

# option 1) if all nodes are running the same version of Hedera app
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path ../hedera-services/hedera-node/data/

# option 2) if each node is running different version of Hedera app, please provide different paths to the local repositories
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path node1=../hedera-services/hedera-node/data/,node1=<path2>,node3=<path3>

solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
```

It is possible that different nodes are running different versions of Hedera app, as long as in the above
setup command, each node0, or node1 is given different paths to the local repositories.

If need to provide customized configuration files for Hedera application, please use the following flags with network deploy command:

* `--settings-txt` - to provide custom settings.txt file
* `--api-permission-properties` - to provide custom api-permission.properties file
* `--bootstrap-properties` - to provide custom bootstrap.properties file
* `--application-properties` - to provide custom application.properties file

For example:

```bash
solo network deploy -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --settings-txt <path-to-settings-txt> 
```

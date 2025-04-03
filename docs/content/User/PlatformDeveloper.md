### Use solo with local build platform code

> **⚠️ Warning**
> This document is out of date for the current release.  See [Step-by-step Guide](./StepByStepGuide.md) for the updated base commands to run that can be augmented with the extra flags and values provided in this guide. Hedera services and Platform SDK have moved to hiero-consensus-node repo <https://github.com/hiero-ledger/hiero-consensus-node>

First, please clone hedera service repo `https://github.com/hashgraph/hedera-services/` and build the code
with `./gradlew assemble`. If need to running nodes with different versions or releases, please duplicate the repo or build directories in
multiple directories, checkout to the respective version and build the code.

Then you can start customized built platform testing application with the following command:

```bash
SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo node keys --gossip-keys --tls-keys -i node1,node2,node3 
solo network deploy -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --app PlatformTestingTool.jar

# option 1) if all nodes are running the same version of platform testing app
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path ../hedera-services/platform-sdk/sdk/data

# option 2) if each node is running different version of platform testing app, please provide different paths to the local repositories
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path node1=../hedera-services/platform-sdk/sdk/data,node1=<path2>,node3=<path3>

solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --app PlatformTestingTool.jar
```

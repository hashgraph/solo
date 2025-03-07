### Use solo with local build platform code

First, please clone hedera service repo `https://github.com/hiero-ledger/hiero-consensus-node/` and build the code
with `./gradlew assemble`. If need to run nodes with different versions or releases, please duplicate the repo or build directories in
multiple directories, checkout to the respective version and build the code.

Then you can start customized built platform testing application with the following command:

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEVELOPMENT=solo-deployment

kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --email john@doe.com
solo deployment create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEVELOPMENT}"
solo deployment add-cluster --deployment "${SOLO_DEVELOPMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 3 --dns-base-domain cluster.local --dns-consensus-node-pattern network-{nodeAlias}-svc.{namespace}.svc

solo node keys --gossip-keys --tls-keys -i node1,node2,node3 
solo network deploy --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --app PlatformTestingTool.jar

# option 1) if all nodes are running the same version of platform testing app
solo node setup --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --local-build-path ../hedera-services/platform-sdk/sdk/data

# option 2) if each node is running different version of platform testing app, please provide different paths to the local repositories
solo node setup --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --local-build-path node1=../hedera-services/platform-sdk/sdk/data,node1=<path2>,node3=<path3>

solo node start --deployment "${SOLO_DEVELOPMENT}" -i node1,node2,node3 --app PlatformTestingTool.jar
```

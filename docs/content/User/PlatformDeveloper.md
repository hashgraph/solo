### For Developers Working on Platform core

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

# Usage: solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path <default path to hedera repo>,node1=<custom build hedera repo>,node2=<custom build repo> --app PlatformTestingTool.jar --app-config <path-to-test-json1,path-to-test-json2>
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path ../hedera-services/platform-sdk/sdk/data,node1=../hedera-services/platform-sdk/sdk/data,node2=../hedera-services/platform-sdk/sdk/data --app PlatformTestingTool.jar --app-config ../hedera-services/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json

solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --app PlatformTestingTool.jar
```

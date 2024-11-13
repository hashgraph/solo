
First, please follow solo repository README to install solo.
Then we start with launching a local Solo network with the following commands:

```bash

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
npm run solo-test -- init

npm run solo-test -- node keys --gossip-keys --tls-keys -i node1,node2
npm run solo-test -- cluster setup --cluster-setup-namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- network deploy -n "${SOLO_NAMESPACE}" -i node1,node2
npm run solo-test -- node setup     -n "${SOLO_NAMESPACE}" -i node1,node2
npm run solo-test -- node start     -n "${SOLO_NAMESPACE}" -i node1,node2
npm run solo-test -- mirror-node deploy -n "${SOLO_NAMESPACE}"

# enable port forwarding for network services
kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 &

# enable port forwarding for explorer
kubectl port-forward svc/hedera-explorer -n "${SOLO_NAMESPACE}" 8080:80 &

```

  
  
After launching a Solo network locally, a user can use Hashgraph SDK to interact with the network. 

Before instantiating an SDK client, the user must provide the network configuration. 
The network configuration is a map of node addresses to account IDs. 
The SDK client uses this information to connect to the network and submit transactions.

The following is an example of how to instantiate an SDK client and submit transactions to the Solo network.

```javascript


import {
  AccountId,
  Client,
  Logger,
  LogLevel,
  TopicCreateTransaction, TopicMessageSubmitTransaction
} from '@hashgraph/sdk'

// Setup network configuration
const networkConfig = {}
networkConfig['127.0.0.1:30212'] = AccountId.fromString('0.0.3')
networkConfig['127.0.0.1:30213'] = AccountId.fromString('0.0.4')

// Instantiate SDK client
const sdkClient = Client.fromConfig({ network: networkConfig, scheduleNetworkUpdate: false })
sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY)
sdkClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'))

// Create a new public topic and submit a message
const txResponse = await new TopicCreateTransaction().execute(sdkClient)
const receipt = await txResponse.getReceipt(sdkClient)

const submitResponse = await new TopicMessageSubmitTransaction({
  topicId: receipt.topicId,
  message: 'Hello, Hedera!'
}).execute(sdkClient)

const submitReceipt = await submitResponse.getReceipt(sdkClient)

```
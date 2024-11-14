
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

# create a new account
npm run solo-test -- account create -n solo-e2e --hbar-amount 100

```

The last step would create a new account, the command output would be similar to the following:

```bash
✔ Initialize
  ✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ create the new account [2s]


 *** new account created ***
-------------------------------------------------------------------------------
{
 "accountId": "0.0.1007",
 "privateKey": "302e020100300506032b657004220420cfea706dd9ed2d3c1660ba98acf4fdb74d247cce289ef6ef47486e055e0b9508",
 "publicKey": "302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013",
 "balance": 100
}
```

Next step please clone the Hedera Javascript SDK repository https://github.com/hashgraph/hedera-sdk-js
At the root of the project `hedera-sdk-js`,  create a file `.env` and add the following content:

```bash
# Hedera Operator Account ID
OPERATOR_ID="0.0.1007"

# Hedera Operator Private Key
OPERATOR_KEY="302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013"

# Hedera Network
HEDERA_NETWORK="local-node"
```
Make sure to assign the value of accountId to OPERATOR_ID and the value of privateKey to OPERATOR_KEY.

Then try the following command to run the test

```bash
node examples/create-account.js 
```

```bash
private key = 302e020100300506032b6570042204208a3c1093c4df779c4aa980d20731899e0b509c7a55733beac41857a9dd3f1193
public key = 302a300506032b6570032100c55adafae7e85608ea893d0e2c77e2dae3df90ba8ee7af2f16a023ba2258c143
account id = 0.0.1009
```

```bash
node examples/create-topic.js
```
The output should be similar to the following:

```bash
topic id = 0.0.1008
topic sequence number = 1


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

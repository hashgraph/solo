## Using Solo with Hedera JavaScript SDK

First, please follow solo repository README to install solo and Docker Desktop.
You also need to install the Taskfile tool following the instructions [here](https://taskfile.dev/installation/).

Then we start with launching a local Solo network with the following commands:

```bash
# launch a local Solo network with mirror node and hedera explorer
task default-with-mirror
```

Then create a new test account with the following command:

```
npm run solo-test -- account create -n solo-e2e --hbar-amount 100
```

The output would be similar to the following:

```bash
 *** new account created ***
-------------------------------------------------------------------------------
{
 "accountId": "0.0.1007",
 "publicKey": "302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013",
 "balance": 100
}
```

Then use the following command to get private key of the account `0.0.1007`:

```bash
 npm run solo-test -- account get --account-id 0.0.1007 -n solo-e2e --private-key
```

The output would be similar to the following:

```bash
{
 "accountId": "0.0.1007",
 "privateKey": "302e020100300506032b657004220420cfea706dd9ed2d3c1660ba98acf4fdb74d247cce289ef6ef47486e055e0b9508",
 "publicKey": "302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013",
 "balance": 100
}
```

Next step please clone the Hedera Javascript SDK repository https://github.com/hashgraph/hedera-sdk-js.
At the root of the project `hedera-sdk-js`,  create a file `.env` and add the following content:

```bash
# Hedera Operator Account ID
OPERATOR_ID="0.0.1007"

# Hedera Operator Private Key
OPERATOR_KEY="302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013"

# Hedera Network
HEDERA_NETWORK="local-node"
```

Make sure to assign the value of accountId to `OPERATOR_ID` and the value of privateKey to `OPERATOR_KEY`.

Then try the following command to run the test

```bash
node examples/create-account.js 
```

The output should be similar to the following:

```bash
private key = 302e020100300506032b6570042204208a3c1093c4df779c4aa980d20731899e0b509c7a55733beac41857a9dd3f1193
public key = 302a300506032b6570032100c55adafae7e85608ea893d0e2c77e2dae3df90ba8ee7af2f16a023ba2258c143
account id = 0.0.1009
```

Or try the topic creation example:

```bash
node examples/create-topic.js
```

The output should be similar to the following:

```bash
topic id = 0.0.1008
topic sequence number = 1


```

You can use Hedera explorer to check transactions and topics created in the Solo network:
http://localhost:8080/localnet/dashboard

Finally, after done with using solo, using the following command to tear down the Solo network:

```bash
task clean
```

### Retrieving Logs

You can find log for running solo command under the directory ~/.solo/logs/

The file solo.log contains the logs for the solo command.
The file hashgraph-sdk.log contains the logs from Solo client when sending transactions to network nodes.

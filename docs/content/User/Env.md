## Environment Variables Used in Solo

User can configure the following environment variables to customize the behavior of Solo.

### Table of environment variables

| Environment Variable               | Description                                                                                      | Default Value                                                                                      |
|------------------------------------|--------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `SOLO_HOME`                        | Path to the Solo cache and log files                                                             | `~/.solo`                                                                                          |
| `SOLO_CHAIN_ID`                    | Chain id of solo network                                                                         | `298`                                                                                              |
| `SOLO_NODE_ACCOUNT_ID_START`       | First node account ID of solo test network                                                       | `0.0.3`                                                                                            |
| `SOLO_NODE_INTERNAL_GOSSIP_PORT`   | Internal ossip port number used by hedera netwrok                                                | `50111`                                                                                            |
| `SOLO_NODE_EXTERNAL_GOSSIP_PORT`   | External port number used by hedera network                                                      | `50111`                                                                                            |
| `SOLO_NODE_DEFAULT_STAKE_AMOUNT`   | Default stake amount for node                                                                    | `500`                                                                                              |
| `SOLO_OPERATOR_ID`                 | Operator account ID for solo network                                                             | `0.0.2`                                                                                            |
| `SOLO_OPERATOR_KEY`                | Operator private key for solo network                                                            | `302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137` |
| `SOLO_OPERATOR_PUBLIC_KEY`         | Operator public key for solo network                                                             | `302a300506032b65700321000aa8e21064c61eab86e2a9c164565b4e7a9a4146106e0a6cd03a8c395a110e92`         |
| `FREEZE_ADMIN_ACCOUNT`             | Freeze admin account ID for solo network                                                         | `0.0.58`                                                                                           |
| `GENESIS_KEY`                      | Genesis private key for solo network                                                             | `302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137` |
| `LOCAL_NODE_START_PORT`            | Local node start port for solo network                                                           | `30212`                                                                                            |
| `NODE_CLIENT_MIN_BACKOFF`          | The minimum amount of time to wait between retries.                                              | `1000`                                                                                             |
| `NODE_CLIENT_MAX_BACKOFF`          | The maximum amount of time to wait between retries.                                              | `1000`                                                                                             |
| `NODE_CLIENT_REQUEST_TIMEOUT`      | The period of time a transaction or query request will retry from a "busy" network response      | `600000`                                                                                           |
| `PODS_RUNNING_MAX_ATTEMPTS`        | The maximum number of attempts to check if pods are running.                                     | `900`                                                                                              |
| `PODS_RUNNING_DELAY`               | The interval between attempts to check if pods are running, in the unit of milliseconds.         | `1000`                                                                                             |
| `NETWORK_NODE_ACTIVE_MAX_ATTEMPTS` | The maximum number of attempts to check if network nodes are active.                             | `120`                                                                                              |
| `NETWORK_NODE_ACTIVE_DELAY`        | The interval between attempts to check if network nodes are active, in the unit of milliseconds. | `1000`                                                                                             |
| `NETWORK_NODE_ACTIVE_TIMEOUT`      | The period of time to wait for network nodes to become active, in the unit of milliseconds.      | `60000`                                                                                            |
| `NETWORK_PROXY_MAX_ATTEMPTS`       | The maximum number of attempts to check if network proxy is running.                             | `300`                                                                                              |
| `NETWORK_PROXY_DELAY`              | The interval between attempts to check if network proxy is running, in the unit of milliseconds. | `2000`                                                                                             |
| `PODS_READY_MAX_ATTEMPTS`          | The maximum number of attempts to check if pods are ready.                                       | `300`                                                                                              |
| `PODS_READY_DELAY`                 | The interval between attempts to check if pods are ready, in the unit of milliseconds.           | `2000`                                                                                             |
| `RELAY_PODS_RUNNING_MAX_ATTEMPTS`  | The maximum number of attempts to check if relay pods are running.                               | `900`                                                                                              |
| `RELAY_PODS_RUNNING_DELAY`         | The interval between attempts to check if relay pods are running, in the unit of milliseconds.   | `1000`                                                                                             |
| `RELAY_PODS_READY_MAX_ATTEMPTS`    | The maximum number of attempts to check if relay pods are ready.                                 | `100`                                                                                              |
| `RELAY_PODS_READY_DELAY`           | The interval between attempts to check if relay pods are ready, in the unit of milliseconds.     | `120`                                                                                              |
| `NETWORK_DESTROY_WAIT_TIMEOUT`     | The period of time to wait for network to be destroyed, in the unit of milliseconds.             | `60000`                                                                                            |








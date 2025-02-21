## Solo command line user manual

Solo has a series of commands to use, and some commands have subcommands.
User can get help information by running with the following methods:

`solo --help` will return the help information for the `solo` command to show which commands
are available.

`solo command --help` will return the help information for the specific command to show which options

```text
solo account --help

Manage Hedera accounts in solo network

Commands:
  account init     Initialize system accounts with new keys
  account create   Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no k
                   ey one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key
  account update   Updates an existing account with the provided info, if you want to update the private key, you can su
                   pply either ECDSA or ED25519 but not both

  account get      Gets the account info including the current amount of HBAR

Options:
      --dev      Enable developer mode                                                                         [boolean]
  -h, --help     Show help                                                                                     [boolean]
  -v, --version  Show version number                                                                           [boolean]
```

`solo command subcommand --help` will return the help information for the specific subcommand to show which options

```text
solo account create --help
Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be gene
rated for you, otherwise you may supply either a ECDSA or ED25519 private key

Options:
      --dev                  Enable developer mode                                                             [boolean]
      --hbar-amount          Amount of HBAR to add                                                              [number]
      --create-amount        Amount of new account to create                                                    [number]
      --ecdsa-private-key    ECDSA private key for the Hedera account                                           [string]
  -n, --namespace            Namespace                                                                          [string]
      --ed25519-private-key  ED25519 private key for the Hedera account                                         [string]
      --generate-ecdsa-key   Generate ECDSA private key for the Hedera account                                 [boolean]
      --set-alias            Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key
                                                                                                               [boolean]
  -h, --help                 Show help                                                                         [boolean]
  -v, --version              Show version number                                                               [boolean]
```

## init command

`init` command is used to initialize system accounts with new keys, it accepts the following options:

```text
      --cache-dir  Local cache directory                                                                        [string]
```

## account command

`account` command is used to create a crypto account, get account information, or update account information.
It has the following subcommands:

* init
* create
* get
* update

### account init

`account init` subcommand is used to initialize system accounts with new keys, it accepts the following options:

```text
  -n, --namespace  Namespace                                                                                    [string]
```

### account get

Get an account balance and retrieve account information such as account ID, public key, and private key.
`account get` subcommand accepts the following options:

```text
      --account-id   The Hedera account id, e.g.: 0.0.1001                                                      [string]
      --private-key  Show private key information                                                              [boolean]
  -n, --namespace    Namespace                                                                                  [string]
```

Some examples of getting an account are as follows:

```bash
# get account info of 0.0.1007 and also show the private key
solo account get --account-id 0.0.1007 -n solo-e2e --private-key
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

### account create

`accoutn create` subcommand accepts the following options:

```text
      --hbar-amount          Amount of HBAR to add, default is 100                                                              [number]
      --ecdsa-private-key    ECDSA private key for the Hedera account                                           [string]
  -n, --namespace            Namespace                                                                          [string]
      --ed25519-private-key  ED25519 private key for the Hedera account                                         [string]
      --generate-ecdsa-key   Generate ECDSA private key for the Hedera account                                 [boolean]
      --set-alias            Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key
```

If no private key is provided, the command will generate a new ED25519 key for the account.
unless `--generate-ecdsa-key` is provided, in which case an ECDSA key will be generated.

Some examples of creating an account are as follows:

```bash
# create a new account with 100 hbar as initial balance with ED25519 key
solo account create -n solo-e2e

# create a new account with 500 hbar as initial balance with ECDSA key
solo account create -n solo-e2e --hbar-amount 500 --generate-ecdsa-key

# create a new account providing ecdsk key
solo account create -n solo-e2e --ecdsa-private-key 302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013

# create a new account with alias
solo account create -n solo-e2e --set-alias --generate-ecdsa-key
```

### account update

`account update` subcommand is used to update an existing account with the provided info,
if you want to update the private key, you can supply either ECDSA or ED25519 but not both.

```text
      --account-id           The Hedera account id, e.g.: 0.0.1001                                              [string]
      --hbar-amount          Amount of HBAR to add                                                              [number]
  -n, --namespace            Namespace                                                                          [string]
      --ecdsa-private-key    ECDSA private key for the Hedera account                                           [string]
      --ed25519-private-key  ED25519 private key for the Hedera account                                         [string]
```

Some examples of updating an account are as follows:

```bash
# add hbar to an account
solo account update --account-id 0.0.1007 --hbar-amount 100 -n solo-e2e

# update an account with a new ECDSA key
solo account update --account-id 0.0.1007 --ecdsa-private-key 302a300506032b65700321001d8978e647aca1195c54a4d3d5dc469b95666de14e9b6edde8ed337917b96013 -n solo-e2e

```

## context command

## cluster command

`cluster` command is used to manage the solo network cluster, it has the following subcommands:

* list
* info
* setup
* reset

### cluster list

`cluster list` subcommand is used to list the solo network clusters

```bash
solo cluster list

******************************* Solo *********************************************
Version			: 0.99.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
**********************************************************************************

 *** Clusters ***
-------------------------------------------------------------------------------
 - kind-fst
 - kind-solo
 - teleport.eng.hashgraph.io
 - kind-solo-e2e
```

### cluster info

`cluster info` subcommand is used to get the information of current solo network cluster

### cluster setup

`cluster setup` subcommand is used to setup the solo network cluster, it accepts the following options:

```text
  -d, --chart-dir                Local chart directory path (e.g. ~/solo-charts/charts                          [string]
  -c, --cluster-name             Cluster name                                                                   [string]
  -s, --cluster-setup-namespace  Cluster Setup Namespace                                                        [string]
      --cert-manager             Deploy cert manager, also deploys acme-cluster-issuer                         [boolean]
      --cert-manager-crds        Deploy cert manager CRDs                                                      [boolean]
      --minio                    Deploy minio operator                                                         [boolean]
      --prometheus-stack         Deploy prometheus stack                                                       [boolean]
      --solo-chart-version       Solo testing chart version                                                     [string]
  -n, --namespace  Namespace                                                                                    [string]
```

### cluster reset

`cluster reset` subcommand is used to reset the solo network cluster, it accepts the following options:

```text
  -c, --cluster-name             Cluster name                                                                   [string]
  -s, --cluster-setup-namespace  Cluster Setup Namespace                                                        [string]
  -f, --force                    Force actions even if those can be skipped                                    [boolean]
```

## network command

`solo network` command is used to manage the solo network, it has the following subcommands:

* deploy
* destroy
* refresh

### network deploy

`network deploy` subcommand is used to deploy the solo network, it accepts the following options:

```text
      --api-permission-properties  api-permission.properties file for node                                      [string]
      --app                        Testing app name                                                             [string]
      --application-env            application.env file for node                                                [string]
      --application-properties     application.properties file for node                                         [string]
      --bootstrap-properties       bootstrap.properties file for node                                           [string]
      --cache-dir                  Local cache directory                                                        [string]
  -l, --ledger-id                  Ledger ID (a.k.a. Chain ID)                                                  [string]
  -d, --chart-dir                  Local chart directory path (e.g. ~/solo-charts/charts                        [string]
      --prometheus-svc-monitor     Enable prometheus service monitor for the network nodes                     [boolean]
      --solo-chart-version         Solo testing chart version                                                   [string]
      --debug-node-alias           Enable default jvm debug port (5005) for the given node id                   [string]
      --log4j2-xml                 log4j2.xml file for node                                                     [string]
  -n, --namespace                  Namespace                                                                    [string]
  -i, --node-aliases      Comma separated node aliases (empty means all nodes)                         [string]
      --pvcs                       Enable persistent volume claims to store data outside the pod, required for node add
                                                                                                               [boolean]
      --profile-file               Resource profile definition (e.g. custom-spec.yaml)                          [string]
      --profile                    Resource profile (local | tiny | small | medium | large)                     [string]
  -q, --quiet-mode                 Quiet mode, do not prompt for confirmation                                  [boolean]
  -t, --release-tag                Release tag to be used (e.g. v0.56.5)                                        [string]
      --settings-txt               settings.txt file for node                                                   [string]
  -f, --values-file                Comma separated chart values files                                           [string]
      --grpc-tls-cert              TLS Certificate path for the gRPC (e.g. "node1=/Users/username/node1-grpc.cert" with
                                   multiple nodes comma seperated)                                              [string]
      --grpc-web-tls-cert          TLS Certificate path for gRPC Web (e.g. "node1=/Users/username/node1-grpc-web.cert" w
                                   ith multiple nodes comma seperated)                                          [string]
      --grpc-tls-key               TLS Certificate key path for the gRPC (e.g. "node1=/Users/username/node1-grpc.key" wi
                                   th multiple nodes comma seperated)                                           [string]
      --grpc-web-tls-key           TLC Certificate key path for gRPC Web (e.g. "node1=/Users/username/node1-grpc-web.key
                                   " with multiple nodes comma seperated)                                       [string]                                                [string]
```

### network destroy

`network destroy` subcommand is used to destroy the solo network, it accepts the following options:

```text
      --delete-pvcs     Delete the persistent volume claims                                                    [boolean]
      --delete-secrets  Delete the network secrets                                                             [boolean]
  -f, --force           Force actions even if those can be skipped                                             [boolean]
  -n, --namespace       Namespace                                                                               [string]
      --enable-timeout  enable time out for running a command                                                  [boolean]  
```

### network refresh

`network refresh` subcommand is used to refresh or update the solo network, it accepts the following options:

```text
      --api-permission-properties  api-permission.properties file for node                                      [string]
      --app                        Testing app name                                                             [string]
      --application-env            application.env file for node                                                [string]
      --application-properties     application.properties file for node                                         [string]
      --bootstrap-properties       bootstrap.properties file for node                                           [string]
      --cache-dir                  Local cache directory                                                        [string]
  -l, --ledger-id                  Ledger ID (a.k.a. Chain ID)                                                  [string]
  -d, --chart-dir                  Local chart directory path (e.g. ~/solo-charts/charts                        [string]
      --prometheus-svc-monitor     Enable prometheus service monitor for the network nodes                     [boolean]
      --solo-chart-version         Solo testing chart version                                                   [string]
      --debug-node-alias           Enable default jvm debug port (5005) for the given node id                   [string]
      --log4j2-xml                 log4j2.xml file for node                                                     [string]
  -n, --namespace                  Namespace                                                                    [string]
  -i, --node-aliases      Comma separated node aliases (empty means all nodes)                         [string]
      --pvcs                       Enable persistent volume claims to store data outside the pod, required for node add
                                                                                                               [boolean]
      --profile-file               Resource profile definition (e.g. custom-spec.yaml)                          [string]
      --profile                    Resource profile (local | tiny | small | medium | large)                     [string]
  -q, --quiet-mode                 Quiet mode, do not prompt for confirmation                                  [boolean]
  -t, --release-tag                Release tag to be used (e.g. v0.56.5)                                        [string]
      --settings-txt               settings.txt file for node                                                   [string]
  -f, --values-file                Comma separated chart values files                                           [string]
      --grpc-tls-cert              TLS Certificate path for the gRPC (e.g. "node1=/Users/username/node1-grpc.cert" with
                                   multiple nodes comma seperated)                                              [string]
      --grpc-web-tls-cert          TLS Certificate path for gRPC Web (e.g. "node1=/Users/username/node1-grpc-web.cert" w
                                   ith multiple nodes comma seperated)                                          [string]
      --grpc-tls-key               TLS Certificate key path for the gRPC (e.g. "node1=/Users/username/node1-grpc.key" wi
                                   th multiple nodes comma seperated)                                           [string]
      --grpc-web-tls-key           TLC Certificate key path for gRPC Web (e.g. "node1=/Users/username/node1-grpc-web.key
                                   " with multiple nodes comma seperated)                                       [string]                                                                                 [string]
```

## node command

solo node command is used to manage hedera network nodes, it has the following subcommands:

```text
  node setup                        Setup node with a specific version of Hedera platform
  node start                        Start a node
  node stop                         Stop a node
  node keys                         Generate node keys
  node refresh                      Reset and restart a node
  node logs                         Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/
                                    <namespace>/<podName>/ directory
  node states                       Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<na
                                    mespace>/<podName>/ directory
  node add                          Adds a node with a specific version of Hedera platform
  node update                       Update a node with a specific version of Hedera platform
  node delete                       Delete a node with a specific version of Hedera platform
  node download-generated-files     Downloads the generated files from an existing node
```

## mirror-node command

`solo mirror-node` command is used to manage mirror node deplooyment and destruction, it has the following subcommands:

```text
  mirror-node deploy                Deploy a mirror node
  mirror-node destroy               Destroy a mirror node
```

### mirror-node deploy

`mirror-node deploy` subcommand accepts the following options:

```text
  -d, --chart-dir                             Local chart directory path (e.g. ~/solo-charts/charts             [string]
  -x, --hedera-explorer                       Deploy hedera explorer                                           [boolean]
      --enable-hedera-explorer-tls            Enable the Hedera Explorer TLS, defaults to false, requires certManager an
                                              d certManagerCrds, which can be deployed through solo-cluster-setup chart
                                              or standalone                                                    [boolean]
      --hedera-explorer-tls-host-name         The host name to use for the Hedera Explorer TLS, defaults to "explorer.so
                                              lo.local"                                                         [string]
      --hedera-explorer-tls-load-balancer-ip  The static IP address to use for the Hedera Explorer TLS load balancer, de
                                              faults to ""                                                      [string]
      --hedera-explorer-version               Hedera explorer chart version                                     [string]
  -n, --namespace                             Namespace                                                         [string]
      --profile-file                          Resource profile definition (e.g. custom-spec.yaml)               [string]
      --profile                               Resource profile (local | tiny | small | medium | large)          [string]
  -q, --quiet-mode                            Quiet mode, do not prompt for confirmation                       [boolean]
      --tls-cluster-issuer-type               The TLS cluster issuer type to use for hedera explorer, defaults to "self-
                                              signed", the available options are: "acme-staging", "acme-prod", or "self-
                                              signed"                                                           [string]
  -f, --values-file                           Comma separated chart values files                                [string]
      --mirror-node-version                   Mirror node chart version                                         [string]
      --pinger                                Enable Pinger service in the Mirror node monitor                 [boolean]                                      [string]                                                [string]
```

### mirror-node destroy

`mirror-node destroy` subcommand accepts the following options:

```text
  -d, --chart-dir  Local chart directory path (e.g. ~/solo-charts/charts                                        [string]
  -f, --force      Force actions even if those can be skipped                                                  [boolean]
  -n, --namespace  Namespace                                                                                    [string]
```

## relay command

`solo relay` command is used to manage relay nodes, it has the following subcommands:

```text
  relay deploy    Deploy a JSON RPC relay
  relay destroy   Destroy JSON RPC relay
```

### relay deploy

`relay deploy` subcommand accepts the following options:

```text
  -l, --ledger-id              Ledger ID (a.k.a. Chain ID)                                                      [string]
  -d, --chart-dir              Local chart directory path (e.g. ~/solo-charts/charts                            [string]
  -n, --namespace              Namespace                                                                        [string]
  -i, --node-aliases  Comma separated node aliases (empty means all nodes)                             [string]
      --operator-id            Operator ID                                                                      [string]
      --operator-key           Operator Key                                                                     [string]
      --profile-file           Resource profile definition (e.g. custom-spec.yaml)                              [string]
      --profile                Resource profile (local | tiny | small | medium | large)                         [string]
  -q, --quiet-mode             Quiet mode, do not prompt for confirmation                                      [boolean]
      --relay-release          Relay release tag to be used (e.g. v0.48.0)                                      [string]
      --replica-count          Replica count                                                                    [number]
  -f, --values-file            Comma separated chart values files                                               [string]                                                 [boolean]
```

### relay destroy

`relay destroy` subcommand accepts the following options:

```text
  -d, --chart-dir              Local chart directory path (e.g. ~/solo-charts/charts                            [string]
  -n, --namespace              Namespace                                                                        [string]
  -i, --node-aliases  Comma separated node aliases (empty means all nodes)                             [string]                                                                                  [string]
```

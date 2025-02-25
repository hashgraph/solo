# Solo Command Reference
## Table of Contents

- [Root Help Output](#root-help-output)

- [init](#init)

- [account](#account)

  - [account init](#account-init)

  - [account create](#account-create)

  - [account update](#account-update)

  - [account get](#account-get)

- [cluster](#cluster)

  - [cluster connect](#cluster-connect)

  - [cluster list](#cluster-list)

  - [cluster info](#cluster-info)

  - [cluster setup](#cluster-setup)

  - [cluster reset](#cluster-reset)

- [network](#network)

  - [network deploy](#network-deploy)

  - [network destroy](#network-destroy)

  - [network refresh](#network-refresh)

- [node](#node)

  - [node setup](#node-setup)

  - [node start](#node-start)

  - [node stop](#node-stop)

  - [node keys](#node-keys)

  - [node refresh](#node-refresh)

  - [node logs](#node-logs)

  - [node states](#node-states)

  - [node add](#node-add)

  - [node add-prepare](#node-add-prepare)

  - [node add-submit-transactions](#node-add-submit-transactions)

  - [node add-execute](#node-add-execute)

  - [node update](#node-update)

  - [node update-prepare](#node-update-prepare)

  - [node update-submit-transactions](#node-update-submit-transactions)

  - [node update-execute](#node-update-execute)

  - [node delete](#node-delete)

  - [node delete-prepare](#node-delete-prepare)

  - [node delete-submit-transactions](#node-delete-submit-transactions)

  - [node delete-execute](#node-delete-execute)

  - [node prepare-upgrade](#node-prepare-upgrade)

  - [node freeze-upgrade](#node-freeze-upgrade)

  - [node upgrade](#node-upgrade)

  - [node upgrade-prepare](#node-upgrade-prepare)

  - [node upgrade-submit-transactions](#node-upgrade-submit-transactions)

  - [node upgrade-execute](#node-upgrade-execute)

  - [node download-generated-files](#node-download-generated-files)

- [relay](#relay)

  - [relay deploy](#relay-deploy)

  - [relay destroy](#relay-destroy)

- [mirror-node](#mirror-node)

  - [mirror-node deploy](#mirror-node-deploy)

  - [mirror-node destroy](#mirror-node-destroy)

- [explorer](#explorer)

  - [explorer deploy](#explorer-deploy)

  - [explorer destroy](#explorer-destroy)

- [deployment](#deployment)

  - [deployment create](#deployment-create)

  - [deployment list](#deployment-list)

## Root Help Output
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js --help

Usage:
  solo <command> [options]

Commands:
  init         Initialize local environment
  account      Manage Hedera accounts in solo network
  cluster      Manage solo testing cluster
  network      Manage solo network deployment
  node         Manage Hedera platform node in solo network
  relay        Manage JSON RPC relays in solo network
  mirror-node  Manage Hedera Mirror Node in solo network
  explorer     Manage Explorer in solo network
  deployment   Manage solo network deployment

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## init
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js init --help

 init

Initialize local environment

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## account
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js account --help

 account

Manage Hedera accounts in solo network

Commands:
  account init     Initialize system accounts with new keys
  account create   Creates a new account with a new key and stores the key in th
                   e Kubernetes secrets, if you supply no key one will be genera
                   ted for you, otherwise you may supply either a ECDSA or ED255
                   19 private key
  account update   Updates an existing account with the provided info, if you wa
                   nt to update the private key, you can supply either ECDSA or
                   ED25519 but not both

  account get      Gets the account info including the current amount of HBAR

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### account init
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js account init --help

 account init

Initialize system accounts with new keys

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### account create
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js account create --help

 account create

Creates a new account with a new key and stores the key in the Kubernetes secret
s, if you supply no key one will be generated for you, otherwise you may supply
either a ECDSA or ED25519 private key

Options:
      --dev                  Enable developer mode                     [boolean]
      --force-port-forward   Force port forward to access the network services
                                                                       [boolean]
      --hbar-amount          Amount of HBAR to add                      [number]
      --create-amount        Amount of new account to create            [number]
      --ecdsa-private-key    ECDSA private key for the Hedera account   [string]
      --deployment           The name the user will reference locally to link to
                              a deployment                              [string]
      --ed25519-private-key  ED25519 private key for the Hedera account [string]
      --generate-ecdsa-key   Generate ECDSA private key for the Hedera account
                                                                       [boolean]
      --set-alias            Sets the alias for the Hedera account when it is cr
                             eated, requires --ecdsa-private-key       [boolean]
  -h, --help                 Show help                                 [boolean]
  -v, --version              Show version number                       [boolean]
```

### account update
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js account update --help

 account update

Updates an existing account with the provided info, if you want to update the pr
ivate key, you can supply either ECDSA or ED25519 but not both


Options:
      --dev                  Enable developer mode                     [boolean]
      --force-port-forward   Force port forward to access the network services
                                                                       [boolean]
      --account-id           The Hedera account id, e.g.: 0.0.1001      [string]
      --hbar-amount          Amount of HBAR to add                      [number]
      --deployment           The name the user will reference locally to link to
                              a deployment                              [string]
      --ecdsa-private-key    ECDSA private key for the Hedera account   [string]
      --ed25519-private-key  ED25519 private key for the Hedera account [string]
  -h, --help                 Show help                                 [boolean]
  -v, --version              Show version number                       [boolean]
```

### account get
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js account get --help

 account get

Gets the account info including the current amount of HBAR

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --account-id          The Hedera account id, e.g.: 0.0.1001       [string]
      --private-key         Show private key information               [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## cluster
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster --help

 cluster

Manage solo testing cluster

Commands:
  cluster connect   updates the local configuration by connecting a deployment t
                    o a k8s context
  cluster list      List all available clusters
  cluster info      Get cluster info
  cluster setup     Setup cluster with shared components
  cluster reset     Uninstall shared components from cluster

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### cluster connect
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster connect --help

 cluster connect

updates the local configuration by connecting a deployment to a k8s context

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -c, --cluster-ref         The cluster reference that will be used for referenc
                            ing the Kubernetes cluster and stored in the local a
                            nd remote configuration for the deployment.  For com
                            mands that take multiple clusters they can be separa
                            ted by commas.                              [string]
      --context             The Kubernetes context name to be used. Multiple con
                            texts can be separated by a comma           [string]
  -n, --namespace           Namespace                                   [string]
      --email               User email address used for local configuration
                                                                        [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### cluster list
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster list --help

 cluster list

List all available clusters

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### cluster info
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster info --help

 cluster info

Get cluster info

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### cluster setup
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster setup --help

 cluster setup

Setup cluster with shared components

Options:
      --dev                      Enable developer mode                 [boolean]
      --force-port-forward       Force port forward to access the network servic
                                 es                                    [boolean]
  -d, --chart-dir                Local chart directory path (e.g. ~/solo-charts/
                                 charts                                 [string]
  -c, --cluster-ref              The cluster reference that will be used for ref
                                 erencing the Kubernetes cluster and stored in t
                                 he local and remote configuration for the deplo
                                 yment.  For commands that take multiple cluster
                                 s they can be separated by commas.     [string]
  -s, --cluster-setup-namespace  Cluster Setup Namespace                [string]
      --cert-manager             Deploy cert manager, also deploys acme-cluster-
                                 issuer                                [boolean]
      --cert-manager-crds        Deploy cert manager CRDs              [boolean]
      --minio                    Deploy minio operator                 [boolean]
      --prometheus-stack         Deploy prometheus stack               [boolean]
  -q, --quiet-mode               Quiet mode, do not prompt for confirmation
                                                                       [boolean]
      --solo-chart-version       Solo testing chart version             [string]
  -h, --help                     Show help                             [boolean]
  -v, --version                  Show version number                   [boolean]
```

### cluster reset
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster reset --help

 cluster reset

Uninstall shared components from cluster

Options:
      --dev                      Enable developer mode                 [boolean]
      --force-port-forward       Force port forward to access the network servic
                                 es                                    [boolean]
  -c, --cluster-ref              The cluster reference that will be used for ref
                                 erencing the Kubernetes cluster and stored in t
                                 he local and remote configuration for the deplo
                                 yment.  For commands that take multiple cluster
                                 s they can be separated by commas.     [string]
  -s, --cluster-setup-namespace  Cluster Setup Namespace                [string]
  -f, --force                    Force actions even if those can be skipped
                                                                       [boolean]
  -q, --quiet-mode               Quiet mode, do not prompt for confirmation
                                                                       [boolean]
  -h, --help                     Show help                             [boolean]
  -v, --version                  Show version number                   [boolean]
```

## network
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js network --help

 network

Manage solo network deployment

Commands:
  network deploy    Deploy solo network.  Requires the chart `solo-cluster-setup
                    ` to have been installed in the cluster.  If it hasn't the f
                    ollowing command can be ran: `solo cluster setup`
  network destroy   Destroy solo network
  network refresh   Refresh solo network deployment

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### network deploy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js network deploy --help

 network deploy

Deploy solo network.  Requires the chart `solo-cluster-setup` to have been insta
lled in the cluster.  If it hasn't the following command can be ran: `solo clust
er setup`

Options:
      --dev                        Enable developer mode               [boolean]
      --force-port-forward         Force port forward to access the network serv
                                   ices                                [boolean]
      --api-permission-properties  api-permission.properties file for node
                                                                        [string]
      --app                        Testing app name                     [string]
      --application-env            the application.env file for the node provide
                                   s environment variables to the solo-container
                                    to be used when the hedera platform is start
                                   ed                                   [string]
      --application-properties     application.properties file for node [string]
      --bootstrap-properties       bootstrap.properties file for node   [string]
      --genesis-throttles-file     throttles.json file used during network genes
                                   is                                   [string]
      --cache-dir                  Local cache directory                [string]
  -l, --ledger-id                  Ledger ID (a.k.a. Chain ID)          [string]
  -d, --chart-dir                  Local chart directory path (e.g. ~/solo-chart
                                   s/charts                             [string]
      --prometheus-svc-monitor     Enable prometheus service monitor for the net
                                   work nodes                          [boolean]
      --solo-chart-version         Solo testing chart version           [string]
      --debug-node-alias           Enable default jvm debug port (5005) for the
                                   given node id                        [string]
      --load-balancer              Enable load balancer for network node proxies
                                                                       [boolean]
      --log4j2-xml                 log4j2.xml file for node             [string]
      --deployment                 The name the user will reference locally to l
                                   ink to a deployment                  [string]
  -i, --node-aliases               Comma separated node aliases (empty means all
                                    nodes)                              [string]
      --pvcs                       Enable persistent volume claims to store data
                                    outside the pod, required for node add
                                                                       [boolean]
      --profile-file               Resource profile definition (e.g. custom-spec
                                   .yaml)                               [string]
      --profile                    Resource profile (local | tiny | small | medi
                                   um | large)                          [string]
  -q, --quiet-mode                 Quiet mode, do not prompt for confirmation
                                                                       [boolean]
  -t, --release-tag                Release tag to be used (e.g. v0.58.10)
                                                                        [string]
      --settings-txt               settings.txt file for node           [string]
  -f, --values-file                Comma separated chart values file paths for e
                                   ach cluster (e.g. values.yaml,cluster-1=./a/b
                                   /values1.yaml,cluster-2=./a/b/values2.yaml)
                                                                        [string]
      --grpc-tls-cert              TLS Certificate path for the gRPC (e.g. "node
                                   1=/Users/username/node1-grpc.cert" with multi
                                   ple nodes comma seperated)           [string]
      --grpc-web-tls-cert          TLS Certificate path for gRPC Web (e.g. "node
                                   1=/Users/username/node1-grpc-web.cert" with m
                                   ultiple nodes comma seperated)       [string]
      --grpc-tls-key               TLS Certificate key path for the gRPC (e.g. "
                                   node1=/Users/username/node1-grpc.key" with mu
                                   ltiple nodes comma seperated)        [string]
      --grpc-web-tls-key           TLC Certificate key path for gRPC Web (e.g. "
                                   node1=/Users/username/node1-grpc-web.key" wit
                                   h multiple nodes comma seperated)    [string]
      --haproxy-ips                IP mapping where key = value is node alias an
                                   d static ip for haproxy, (e.g.: --haproxy-ips
                                    node1=127.0.0.1,node2=127.0.0.1)    [string]
      --envoy-ips                  IP mapping where key = value is node alias an
                                   d static ip for envoy proxy, (e.g.: --envoy-i
                                   ps node1=127.0.0.1,node2=127.0.0.1)  [string]
      --storage-type               storage type for saving stream files, availab
                                   le options are minio_only, aws_only, gcs_only
                                   , aws_and_gcs
      --gcs-access-key             gcs storage access key               [string]
      --gcs-secrets                gcs storage secret key               [string]
      --gcs-endpoint               gcs storage endpoint URL             [string]
      --gcs-bucket                 name of gcs storage bucket           [string]
      --gcs-bucket-prefix          path prefix of google storage bucket [string]
      --aws-access-key             aws storage access key               [string]
      --aws-secrets                aws storage secret key               [string]
      --aws-endpoint               aws storage endpoint URL             [string]
      --aws-bucket                 name of aws storage bucket           [string]
      --aws-bucket-prefix          path prefix of aws storage bucket    [string]
      --backup-bucket              name of bucket for backing up state files
                                                                        [string]
      --google-credential          path of google credential file in json format
                                                                        [string]
  -h, --help                       Show help                           [boolean]
  -v, --version                    Show version number                 [boolean]
```

### network destroy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js network destroy --help

 network destroy

Destroy solo network

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --delete-pvcs         Delete the persistent volume claims        [boolean]
      --delete-secrets      Delete the network secrets                 [boolean]
      --enable-timeout      enable time out for running a command      [boolean]
  -f, --force               Force actions even if those can be skipped [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### network refresh
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js network refresh --help

 network refresh

Refresh solo network deployment

Options:
      --dev                        Enable developer mode               [boolean]
      --force-port-forward         Force port forward to access the network serv
                                   ices                                [boolean]
      --api-permission-properties  api-permission.properties file for node
                                                                        [string]
      --app                        Testing app name                     [string]
      --application-env            the application.env file for the node provide
                                   s environment variables to the solo-container
                                    to be used when the hedera platform is start
                                   ed                                   [string]
      --application-properties     application.properties file for node [string]
      --bootstrap-properties       bootstrap.properties file for node   [string]
      --genesis-throttles-file     throttles.json file used during network genes
                                   is                                   [string]
      --cache-dir                  Local cache directory                [string]
  -l, --ledger-id                  Ledger ID (a.k.a. Chain ID)          [string]
  -d, --chart-dir                  Local chart directory path (e.g. ~/solo-chart
                                   s/charts                             [string]
      --prometheus-svc-monitor     Enable prometheus service monitor for the net
                                   work nodes                          [boolean]
      --solo-chart-version         Solo testing chart version           [string]
      --debug-node-alias           Enable default jvm debug port (5005) for the
                                   given node id                        [string]
      --load-balancer              Enable load balancer for network node proxies
                                                                       [boolean]
      --log4j2-xml                 log4j2.xml file for node             [string]
      --deployment                 The name the user will reference locally to l
                                   ink to a deployment                  [string]
  -i, --node-aliases               Comma separated node aliases (empty means all
                                    nodes)                              [string]
      --pvcs                       Enable persistent volume claims to store data
                                    outside the pod, required for node add
                                                                       [boolean]
      --profile-file               Resource profile definition (e.g. custom-spec
                                   .yaml)                               [string]
      --profile                    Resource profile (local | tiny | small | medi
                                   um | large)                          [string]
  -q, --quiet-mode                 Quiet mode, do not prompt for confirmation
                                                                       [boolean]
  -t, --release-tag                Release tag to be used (e.g. v0.58.10)
                                                                        [string]
      --settings-txt               settings.txt file for node           [string]
  -f, --values-file                Comma separated chart values file paths for e
                                   ach cluster (e.g. values.yaml,cluster-1=./a/b
                                   /values1.yaml,cluster-2=./a/b/values2.yaml)
                                                                        [string]
      --grpc-tls-cert              TLS Certificate path for the gRPC (e.g. "node
                                   1=/Users/username/node1-grpc.cert" with multi
                                   ple nodes comma seperated)           [string]
      --grpc-web-tls-cert          TLS Certificate path for gRPC Web (e.g. "node
                                   1=/Users/username/node1-grpc-web.cert" with m
                                   ultiple nodes comma seperated)       [string]
      --grpc-tls-key               TLS Certificate key path for the gRPC (e.g. "
                                   node1=/Users/username/node1-grpc.key" with mu
                                   ltiple nodes comma seperated)        [string]
      --grpc-web-tls-key           TLC Certificate key path for gRPC Web (e.g. "
                                   node1=/Users/username/node1-grpc-web.key" wit
                                   h multiple nodes comma seperated)    [string]
      --haproxy-ips                IP mapping where key = value is node alias an
                                   d static ip for haproxy, (e.g.: --haproxy-ips
                                    node1=127.0.0.1,node2=127.0.0.1)    [string]
      --envoy-ips                  IP mapping where key = value is node alias an
                                   d static ip for envoy proxy, (e.g.: --envoy-i
                                   ps node1=127.0.0.1,node2=127.0.0.1)  [string]
      --storage-type               storage type for saving stream files, availab
                                   le options are minio_only, aws_only, gcs_only
                                   , aws_and_gcs
      --gcs-access-key             gcs storage access key               [string]
      --gcs-secrets                gcs storage secret key               [string]
      --gcs-endpoint               gcs storage endpoint URL             [string]
      --gcs-bucket                 name of gcs storage bucket           [string]
      --gcs-bucket-prefix          path prefix of google storage bucket [string]
      --aws-access-key             aws storage access key               [string]
      --aws-secrets                aws storage secret key               [string]
      --aws-endpoint               aws storage endpoint URL             [string]
      --aws-bucket                 name of aws storage bucket           [string]
      --aws-bucket-prefix          path prefix of aws storage bucket    [string]
      --backup-bucket              name of bucket for backing up state files
                                                                        [string]
      --google-credential          path of google credential file in json format
                                                                        [string]
  -h, --help                       Show help                           [boolean]
  -v, --version                    Show version number                 [boolean]
```

## node
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node --help

 node

Manage Hedera platform node in solo network

Commands:
  node setup                         Setup node with a specific version of Heder
                                     a platform
  node start                         Start a node
  node stop                          Stop a node
  node keys                          Generate node keys
  node refresh                       Reset and restart a node
  node logs                          Download application logs from the network
                                     nodes and stores them in <SOLO_LOGS_DIR>/<n
                                     amespace>/<podName>/ directory
  node states                        Download hedera states from the network nod
                                     es and stores them in <SOLO_LOGS_DIR>/<name
                                     space>/<podName>/ directory
  node add                           Adds a node with a specific version of Hede
                                     ra platform
  node add-prepare                   Prepares the addition of a node with a spec
                                     ific version of Hedera platform
  node add-submit-transactions       Submits NodeCreateTransaction and Upgrade t
                                     ransactions to the network nodes
  node add-execute                   Executes the addition of a previously prepa
                                     red node
  node update                        Update a node with a specific version of He
                                     dera platform
  node update-prepare                Prepare the deployment to update a node wit
                                     h a specific version of Hedera platform
  node update-submit-transactions    Submit transactions for updating a node wit
                                     h a specific version of Hedera platform
  node update-execute                Executes the updating of a node with a spec
                                     ific version of Hedera platform
  node delete                        Delete a node with a specific version of He
                                     dera platform
  node delete-prepare                Prepares the deletion of a node with a spec
                                     ific version of Hedera platform
  node delete-submit-transactions    Submits transactions to the network nodes f
                                     or deleting a node
  node delete-execute                Executes the deletion of a previously prepa
                                     red node
  node prepare-upgrade               Prepare the network for a Freeze Upgrade op
                                     eration
  node freeze-upgrade                Performs a Freeze Upgrade operation with on
                                      the network after it has been prepared wit
                                     h prepare-upgrade
  node upgrade                       upgrades all nodes on the network
  node upgrade-prepare               Prepare the deployment to upgrade network
  node upgrade-submit-transactions   Submit transactions for upgrading network
  node upgrade-execute               Executes the upgrading the network
  node download-generated-files      Downloads the generated files from an exist
                                     ing node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node setup
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node setup --help

 node setup

Setup node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --app                 Testing app name                            [string]
      --app-config          json config file of testing app             [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
      --admin-public-keys   Comma separated list of DER encoded ED25519 public k
                            eys and must match the order of the node aliases
                                                                        [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node start
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node start --help

 node start

Start a node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --app                 Testing app name                            [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --state-file          A zipped state file to be used for the network
                                                                        [string]
      --stake-amounts       The amount to be staked in the same order you list t
                            he node aliases with multiple node staked values com
                            ma seperated                                [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node stop
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node stop --help

 node stop

Stop a node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node keys
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node keys --help

 node keys

Generate node keys

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --gossip-keys         Generate gossip keys for nodes             [boolean]
      --tls-keys            Generate gRPC TLS keys for nodes           [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node refresh
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node refresh --help

 node refresh

Reset and restart a node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --app                 Testing app name                            [string]
      --local-build-path    path of hedera local repo                   [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node logs
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node logs --help

 node logs

Download application logs from the network nodes and stores them in <SOLO_LOGS_D
IR>/<namespace>/<podName>/ directory

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node states
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node states --help

 node states

Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>
/<namespace>/<podName>/ directory

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node add
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node add --help

 node add

Adds a node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --gossip-keys         Generate gossip keys for nodes             [boolean]
      --tls-keys            Generate gRPC TLS keys for nodes           [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --solo-chart-version  Solo testing chart version                  [string]
      --pvcs                Enable persistent volume claims to store data outsid
                            e the pod, required for node add           [boolean]
      --grpc-tls-cert       TLS Certificate path for the gRPC (e.g. "node1=/User
                            s/username/node1-grpc.cert" with multiple nodes comm
                            a seperated)                                [string]
      --grpc-web-tls-cert   TLS Certificate path for gRPC Web (e.g. "node1=/User
                            s/username/node1-grpc-web.cert" with multiple nodes
                            comma seperated)                            [string]
      --grpc-tls-key        TLS Certificate key path for the gRPC (e.g. "node1=/
                            Users/username/node1-grpc.key" with multiple nodes c
                            omma seperated)                             [string]
      --grpc-web-tls-key    TLC Certificate key path for gRPC Web (e.g. "node1=/
                            Users/username/node1-grpc-web.key" with multiple nod
                            es comma seperated)                         [string]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --admin-key           Admin key                                   [string]
      --haproxy-ips         IP mapping where key = value is node alias and stati
                            c ip for haproxy, (e.g.: --haproxy-ips node1=127.0.0
                            .1,node2=127.0.0.1)                         [string]
      --envoy-ips           IP mapping where key = value is node alias and stati
                            c ip for envoy proxy, (e.g.: --envoy-ips node1=127.0
                            .0.1,node2=127.0.0.1)                       [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node add-prepare
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node add-prepare --help

 node add-prepare

Prepares the addition of a node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --gossip-keys         Generate gossip keys for nodes             [boolean]
      --tls-keys            Generate gRPC TLS keys for nodes           [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --output-dir          Path to the directory where the command context will
                             be saved to                                [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --solo-chart-version  Solo testing chart version                  [string]
      --pvcs                Enable persistent volume claims to store data outsid
                            e the pod, required for node add           [boolean]
      --grpc-tls-cert       TLS Certificate path for the gRPC (e.g. "node1=/User
                            s/username/node1-grpc.cert" with multiple nodes comm
                            a seperated)                                [string]
      --grpc-web-tls-cert   TLS Certificate path for gRPC Web (e.g. "node1=/User
                            s/username/node1-grpc-web.cert" with multiple nodes
                            comma seperated)                            [string]
      --grpc-tls-key        TLS Certificate key path for the gRPC (e.g. "node1=/
                            Users/username/node1-grpc.key" with multiple nodes c
                            omma seperated)                             [string]
      --grpc-web-tls-key    TLC Certificate key path for gRPC Web (e.g. "node1=/
                            Users/username/node1-grpc-web.key" with multiple nod
                            es comma seperated)                         [string]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --admin-key           Admin key                                   [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node add-submit-transactions
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node add-submit-transactions --help

 node add-submit-transactions

Submits NodeCreateTransaction and Upgrade transactions to the network nodes

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --gossip-keys         Generate gossip keys for nodes             [boolean]
      --tls-keys            Generate gRPC TLS keys for nodes           [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --solo-chart-version  Solo testing chart version                  [string]
      --pvcs                Enable persistent volume claims to store data outsid
                            e the pod, required for node add           [boolean]
      --grpc-tls-cert       TLS Certificate path for the gRPC (e.g. "node1=/User
                            s/username/node1-grpc.cert" with multiple nodes comm
                            a seperated)                                [string]
      --grpc-web-tls-cert   TLS Certificate path for gRPC Web (e.g. "node1=/User
                            s/username/node1-grpc-web.cert" with multiple nodes
                            comma seperated)                            [string]
      --grpc-tls-key        TLS Certificate key path for the gRPC (e.g. "node1=/
                            Users/username/node1-grpc.key" with multiple nodes c
                            omma seperated)                             [string]
      --grpc-web-tls-key    TLC Certificate key path for gRPC Web (e.g. "node1=/
                            Users/username/node1-grpc-web.key" with multiple nod
                            es comma seperated)                         [string]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node add-execute
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node add-execute --help

 node add-execute

Executes the addition of a previously prepared node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --gossip-keys         Generate gossip keys for nodes             [boolean]
      --tls-keys            Generate gRPC TLS keys for nodes           [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --solo-chart-version  Solo testing chart version                  [string]
      --pvcs                Enable persistent volume claims to store data outsid
                            e the pod, required for node add           [boolean]
      --grpc-tls-cert       TLS Certificate path for the gRPC (e.g. "node1=/User
                            s/username/node1-grpc.cert" with multiple nodes comm
                            a seperated)                                [string]
      --grpc-web-tls-cert   TLS Certificate path for gRPC Web (e.g. "node1=/User
                            s/username/node1-grpc-web.cert" with multiple nodes
                            comma seperated)                            [string]
      --grpc-tls-key        TLS Certificate key path for the gRPC (e.g. "node1=/
                            Users/username/node1-grpc.key" with multiple nodes c
                            omma seperated)                             [string]
      --grpc-web-tls-key    TLC Certificate key path for gRPC Web (e.g. "node1=/
                            Users/username/node1-grpc-web.key" with multiple nod
                            es comma seperated)                         [string]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --haproxy-ips         IP mapping where key = value is node alias and stati
                            c ip for haproxy, (e.g.: --haproxy-ips node1=127.0.0
                            .1,node2=127.0.0.1)                         [string]
      --envoy-ips           IP mapping where key = value is node alias and stati
                            c ip for envoy proxy, (e.g.: --envoy-ips node1=127.0
                            .0.1,node2=127.0.0.1)                       [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node update
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node update --help

 node update

Update a node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --node-alias          Node alias (e.g. node99)                    [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
      --new-admin-key       new admin key for the Hedera account        [string]
      --new-account-number  new account number for node update transaction
                                                                        [string]
      --tls-public-key      path and file name of the public TLS key to be used
                                                                        [string]
      --gossip-private-key  path and file name of the private key for signing go
                            ssip in PEM key format to be used           [string]
      --gossip-public-key   path and file name of the public key for signing gos
                            sip in PEM key format to be used            [string]
      --tls-private-key     path and file name of the private TLS key to be used
                                                                        [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node update-prepare
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node update-prepare --help

 node update-prepare

Prepare the deployment to update a node with a specific version of Hedera platfo
rm

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --output-dir          Path to the directory where the command context will
                             be saved to                                [string]
      --node-alias          Node alias (e.g. node99)                    [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
      --new-admin-key       new admin key for the Hedera account        [string]
      --new-account-number  new account number for node update transaction
                                                                        [string]
      --tls-public-key      path and file name of the public TLS key to be used
                                                                        [string]
      --gossip-private-key  path and file name of the private key for signing go
                            ssip in PEM key format to be used           [string]
      --gossip-public-key   path and file name of the public key for signing gos
                            sip in PEM key format to be used            [string]
      --tls-private-key     path and file name of the private TLS key to be used
                                                                        [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node update-submit-transactions
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node update-submit-transactions --help

 node update-submit-transactions

Submit transactions for updating a node with a specific version of Hedera platfo
rm

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node update-execute
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node update-execute --help

 node update-execute

Executes the updating of a node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --gossip-endpoints    Comma separated gossip endpoints of the node(e.g. fi
                            rst one is internal, second one is external)[string]
      --grpc-endpoints      Comma separated gRPC endpoints of the node (at most
                            8)                                          [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node delete
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node delete --help

 node delete

Delete a node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --node-alias          Node alias (e.g. node99)                    [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node delete-prepare
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node delete-prepare --help

 node delete-prepare

Prepares the deletion of a node with a specific version of Hedera platform

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --node-alias          Node alias (e.g. node99)                    [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --output-dir          Path to the directory where the command context will
                             be saved to                                [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node delete-submit-transactions
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node delete-submit-transactions --help

 node delete-submit-transactions

Submits transactions to the network nodes for deleting a node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --node-alias          Node alias (e.g. node99)                    [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node delete-execute
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node delete-execute --help

 node delete-execute

Executes the deletion of a previously prepared node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --node-alias          Node alias (e.g. node99)                    [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
      --endpoint-type       Endpoint type (IP or FQDN)                  [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -f, --force               Force actions even if those can be skipped [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node prepare-upgrade
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node prepare-upgrade --help

 node prepare-upgrade

Prepare the network for a Freeze Upgrade operation

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --cache-dir           Local cache directory                       [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node freeze-upgrade
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node freeze-upgrade --help

 node freeze-upgrade

Performs a Freeze Upgrade operation with on the network after it has been prepar
ed with prepare-upgrade

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --cache-dir           Local cache directory                       [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node upgrade
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade --help

 node upgrade

upgrades all nodes on the network

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --upgrade-zip-file    A zipped file used for network upgrade      [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node upgrade-prepare
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade-prepare --help

 node upgrade-prepare

Prepare the deployment to upgrade network

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --upgrade-zip-file    A zipped file used for network upgrade      [string]
      --output-dir          Path to the directory where the command context will
                             be saved to                                [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node upgrade-submit-transactions
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade-submit-transactions --help

 node upgrade-submit-transactions

Submit transactions for upgrading network

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node upgrade-execute
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade-execute --help

 node upgrade-execute

Executes the upgrading the network

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --cache-dir           Local cache directory                       [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
      --input-dir           Path to the directory where the command context will
                             be loaded from                             [string]
      --app                 Testing app name                            [string]
      --debug-node-alias    Enable default jvm debug port (5005) for the given n
                            ode id                                      [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
      --solo-chart-version  Solo testing chart version                  [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --local-build-path    path of hedera local repo                   [string]
  -f, --force               Force actions even if those can be skipped [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### node download-generated-files
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js node download-generated-files --help

 node download-generated-files

Downloads the generated files from an existing node

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
      --cache-dir           Local cache directory                       [string]
  -t, --release-tag         Release tag to be used (e.g. v0.58.10)      [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## relay
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js relay --help

 relay

Manage JSON RPC relays in solo network

Commands:
  relay deploy    Deploy a JSON RPC relay
  relay destroy   Destroy JSON RPC relay

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### relay deploy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js relay deploy --help

 relay deploy

Deploy a JSON RPC relay

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -l, --ledger-id           Ledger ID (a.k.a. Chain ID)                 [string]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -c, --cluster-ref         The cluster reference that will be used for referenc
                            ing the Kubernetes cluster and stored in the local a
                            nd remote configuration for the deployment.  For com
                            mands that take multiple clusters they can be separa
                            ted by commas.                              [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
      --operator-id         Operator ID                                 [string]
      --operator-key        Operator Key                                [string]
      --profile-file        Resource profile definition (e.g. custom-spec.yaml)
                                                                        [string]
      --profile             Resource profile (local | tiny | small | medium | la
                            rge)                                        [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --relay-release       Relay release tag to be used (e.g. v0.48.0) [string]
      --replica-count       Replica count                               [number]
  -f, --values-file         Comma separated chart values file           [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### relay destroy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js relay destroy --help

 relay destroy

Destroy JSON RPC relay

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -i, --node-aliases        Comma separated node aliases (empty means all nodes)
                                                                        [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## mirror-node
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js mirror-node --help

 mirror-node

Manage Hedera Mirror Node in solo network

Commands:
  mirror-node deploy    Deploy mirror-node and its components
  mirror-node destroy   Destroy mirror-node components and database

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### mirror-node deploy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js mirror-node deploy --help

 mirror-node deploy

Deploy mirror-node and its components

Options:
      --dev                               Enable developer mode        [boolean]
      --force-port-forward                Force port forward to access the netwo
                                          rk services                  [boolean]
  -c, --cluster-ref                       The cluster reference that will be use
                                          d for referencing the Kubernetes clust
                                          er and stored in the local and remote
                                          configuration for the deployment.  For
                                           commands that take multiple clusters
                                          they can be separated by commas.
                                                                        [string]
  -d, --chart-dir                         Local chart directory path (e.g. ~/sol
                                          o-charts/charts               [string]
      --deployment                        The name the user will reference local
                                          ly to link to a deployment    [string]
      --profile-file                      Resource profile definition (e.g. cust
                                          om-spec.yaml)                 [string]
      --profile                           Resource profile (local | tiny | small
                                           | medium | large)            [string]
  -q, --quiet-mode                        Quiet mode, do not prompt for confirma
                                          tion                         [boolean]
  -f, --values-file                       Comma separated chart values file
                                                                        [string]
      --mirror-node-version               Mirror node chart version     [string]
      --pinger                            Enable Pinger service in the Mirror no
                                          de monitor                   [boolean]
      --use-external-database             Set to true if you have an external da
                                          tabase to use instead of the database
                                          that the Mirror Node Helm chart suppli
                                          es                           [boolean]
      --operator-id                       Operator ID                   [string]
      --operator-key                      Operator Key                  [string]
      --storage-type                      storage type for saving stream files,
                                          available options are minio_only, aws_
                                          only, gcs_only, aws_and_gcs
      --storage-access-key                storage access key for mirror node imp
                                          orter                         [string]
      --storage-secrets                   storage secret key for mirror node imp
                                          orter                         [string]
      --storage-endpoint                  storage endpoint URL for mirror node i
                                          mporter                       [string]
      --storage-bucket                    name of storage bucket for mirror node
                                           importer                     [string]
      --storage-bucket-prefix             path prefix of storage bucket mirror n
                                          ode importer                  [string]
      --external-database-host            Use to provide the external database h
                                          ost if the '--use-external-database' i
                                          s passed                      [string]
      --external-database-owner-username  Use to provide the external database o
                                          wner's username if the '--use-external
                                          -database' is passed          [string]
      --external-database-owner-password  Use to provide the external database o
                                          wner's password if the '--use-external
                                          -database' is passed          [string]
      --external-database-read-username   Use to provide the external database r
                                          eadonly user's username if the '--use-
                                          external-database' is passed  [string]
      --external-database-read-password   Use to provide the external database r
                                          eadonly user's password if the '--use-
                                          external-database' is passed  [string]
  -h, --help                              Show help                    [boolean]
  -v, --version                           Show version number          [boolean]
```

### mirror-node destroy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js mirror-node destroy --help

 mirror-node destroy

Destroy mirror-node components and database

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -c, --cluster-ref         The cluster reference that will be used for referenc
                            ing the Kubernetes cluster and stored in the local a
                            nd remote configuration for the deployment.  For com
                            mands that take multiple clusters they can be separa
                            ted by commas.                              [string]
  -f, --force               Force actions even if those can be skipped [boolean]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## explorer
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js explorer --help

 explorer

Manage Explorer in solo network

Commands:
  explorer deploy    Deploy explorer
  explorer destroy   Destroy explorer

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### explorer deploy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js explorer deploy --help

 explorer deploy

Deploy explorer

Options:
      --dev                            Enable developer mode           [boolean]
      --force-port-forward             Force port forward to access the network
                                       services                        [boolean]
  -d, --chart-dir                      Local chart directory path (e.g. ~/solo-c
                                       harts/charts                     [string]
  -c, --cluster-ref                    The cluster reference that will be used f
                                       or referencing the Kubernetes cluster and
                                        stored in the local and remote configura
                                       tion for the deployment.  For commands th
                                       at take multiple clusters they can be sep
                                       arated by commas.                [string]
      --enable-ingress                 enable ingress on the component/pod
                                                                       [boolean]
      --enable-hedera-explorer-tls     Enable the Hedera Explorer TLS, defaults
                                       to false, requires certManager and certMa
                                       nagerCrds, which can be deployed through
                                       solo-cluster-setup chart or standalone
                                                                       [boolean]
      --hedera-explorer-tls-host-name  The host name to use for the Hedera Explo
                                       rer TLS, defaults to "explorer.solo.local
                                       "                                [string]
      --hedera-explorer-static-ip      The static IP address to use for the Hede
                                       ra Explorer load balancer, defaults to ""
                                                                        [string]
      --hedera-explorer-version        Hedera explorer chart version    [string]
      --mirror-static-ip               static IP address for the mirror node
                                                                        [string]
  -n, --namespace                      Namespace                        [string]
      --deployment                     The name the user will reference locally
                                       to link to a deployment          [string]
      --profile-file                   Resource profile definition (e.g. custom-
                                       spec.yaml)                       [string]
      --profile                        Resource profile (local | tiny | small |
                                       medium | large)                  [string]
  -q, --quiet-mode                     Quiet mode, do not prompt for confirmatio
                                       n                               [boolean]
  -s, --cluster-setup-namespace        Cluster Setup Namespace          [string]
      --solo-chart-version             Solo testing chart version       [string]
      --tls-cluster-issuer-type        The TLS cluster issuer type to use for he
                                       dera explorer, defaults to "self-signed",
                                        the available options are: "acme-staging
                                       ", "acme-prod", or "self-signed" [string]
  -f, --values-file                    Comma separated chart values file[string]
  -h, --help                           Show help                       [boolean]
  -v, --version                        Show version number             [boolean]
```

### explorer destroy
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js explorer destroy --help

 explorer destroy

Destroy explorer

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -d, --chart-dir           Local chart directory path (e.g. ~/solo-charts/chart
                            s                                           [string]
  -c, --cluster-ref         The cluster reference that will be used for referenc
                            ing the Kubernetes cluster and stored in the local a
                            nd remote configuration for the deployment.  For com
                            mands that take multiple clusters they can be separa
                            ted by commas.                              [string]
  -f, --force               Force actions even if those can be skipped [boolean]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
      --deployment          The name the user will reference locally to link to
                            a deployment                                [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

## deployment
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js deployment --help

 deployment

Manage solo network deployment

Commands:
  deployment create   Creates solo deployment
  deployment list     List solo deployments inside a cluster

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

### deployment create
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js deployment create --help

 deployment create

Creates solo deployment

Options:
      --dev                  Enable developer mode                     [boolean]
      --force-port-forward   Force port forward to access the network services
                                                                       [boolean]
  -q, --quiet-mode           Quiet mode, do not prompt for confirmation[boolean]
      --context              The Kubernetes context name to be used. Multiple co
                             ntexts can be separated by a comma         [string]
  -n, --namespace            Namespace                                  [string]
  -c, --cluster-ref          The cluster reference that will be used for referen
                             cing the Kubernetes cluster and stored in the local
                              and remote configuration for the deployment.  For
                             commands that take multiple clusters they can be se
                             parated by commas.                         [string]
      --email                User email address used for local configuration
                                                                        [string]
      --deployment           The name the user will reference locally to link to
                              a deployment                              [string]
      --deployment-clusters  Solo deployment cluster list (comma separated)
                                                                        [string]
  -i, --node-aliases         Comma separated node aliases (empty means all nodes
                             )                                          [string]
  -h, --help                 Show help                                 [boolean]
  -v, --version              Show version number                       [boolean]
```

### deployment list
```

> @hashgraph/solo@0.35.0 solo
> node --no-deprecation --no-warnings dist/solo.js deployment list --help

 deployment list

List solo deployments inside a cluster

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -q, --quiet-mode          Quiet mode, do not prompt for confirmation [boolean]
  -c, --cluster-ref         The cluster reference that will be used for referenc
                            ing the Kubernetes cluster and stored in the local a
                            nd remote configuration for the deployment.  For com
                            mands that take multiple clusters they can be separa
                            ted by commas.                              [string]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

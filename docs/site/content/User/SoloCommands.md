# Solo Command Reference
## Table of Contents

- [Root Help Output](#root-help-output)

- [init](#init)

- [account](#account)

  - [account init](#account-init)

  - [account create](#account-create)

  - [account update](#account-update)

  - [account get](#account-get)

- [cluster-ref](#cluster-ref)

  - [cluster-ref connect](#cluster-ref-connect)

  - [cluster-ref disconnect](#cluster-ref-disconnect)

  - [cluster-ref list](#cluster-ref-list)

  - [cluster-ref info](#cluster-ref-info)

  - [cluster-ref setup](#cluster-ref-setup)

  - [cluster-ref reset](#cluster-ref-reset)

- [network](#network)

  - [network deploy](#network-deploy)

  - [network destroy](#network-destroy)

- [node](#node)

  - [node setup](#node-setup)

  - [node start](#node-start)

  - [node stop](#node-stop)

  - [node freeze](#node-freeze)

  - [node restart](#node-restart)

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

  - [deployment delete](#deployment-delete)

  - [deployment list](#deployment-list)

  - [deployment add-cluster](#deployment-add-cluster)

## Root Help Output
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js --help

Select a command
Usage:
  solo <command> [options]

Commands:
  init         Initialize local environment
  account      Manage Hedera accounts in solo network
  cluster-ref  Manage solo testing cluster
  network      Manage solo network deployment
  node         Manage Hedera platform node in solo network
  relay        Manage JSON RPC relays in solo network
  mirror-node  Manage Hedera Mirror Node in solo network
  explorer     Manage Explorer in solo network
  deployment   Manage solo network deployment

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

## init
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js init --help

 init

Initialize local environment

Options:

     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-v,  --version             Show version number             [boolean]                                    

```

## account
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js account --help

Select an account command
 account

Manage Hedera accounts in solo network

Commands:
  account init     Initialize system accounts with new keys
  account create   Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key
  account update   Updates an existing account with the provided info, if you want to update the private key, you can supply either ECDSA or ED25519 but not both

  account get      Gets the account info including the current amount of HBAR

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### account init
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js account init --help

 account init

Initialize system accounts with new keys

Options:

-c,  --cluster-ref         The cluster reference that      [string]                  
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-i,  --node-aliases        Comma separated node aliases    [string]                  
                           (empty means all nodes)                                   
-v,  --version             Show version number             [boolean]                 

```

### account create
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js account create --help

 account create

Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key

Options:

-c,  --cluster-ref          The cluster reference that      [string]                  
                            will be used for referencing                              
                            the Kubernetes cluster and                                
                            stored in the local and remote                            
                            configuration for the                                     
                            deployment.  For commands that                            
                            take multiple clusters they                               
                            can be separated by commas.                               
     --create-amount        Amount of new account to        [number] [default: 1]     
                            create                                                    
-d,  --deployment           The name the user will          [string]                  
                            reference locally to link to a                            
                            deployment                                                
     --dev                  Enable developer mode           [boolean] [default: false]
     --ecdsa-private-key    ECDSA private key for the       [string]                  
                            Hedera account                                            
     --ed25519-private-key  ED25519 private key for the     [string]                  
                            Hedera account                                            
     --force-port-forward   Force port forward to access    [boolean] [default: true] 
                            the network services                                      
     --generate-ecdsa-key   Generate ECDSA private key for  [boolean] [default: false]
                            the Hedera account                                        
     --hbar-amount          Amount of HBAR to add           [number] [default: 100]   
     --set-alias            Sets the alias for the Hedera   [boolean] [default: false]
                            account when it is created,                               
                            requires  --ecdsa-private-key                             
-v,  --version              Show version number             [boolean]                 

```

### account update
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js account update --help

 account update

Updates an existing account with the provided info, if you want to update the private key, you can supply either ECDSA or ED25519 but not both


Options:

     --account-id           The Hedera account id, e.g.:    [string]                  
                            0.0.1001                                                  
-c,  --cluster-ref          The cluster reference that      [string]                  
                            will be used for referencing                              
                            the Kubernetes cluster and                                
                            stored in the local and remote                            
                            configuration for the                                     
                            deployment.  For commands that                            
                            take multiple clusters they                               
                            can be separated by commas.                               
-d,  --deployment           The name the user will          [string]                  
                            reference locally to link to a                            
                            deployment                                                
     --dev                  Enable developer mode           [boolean] [default: false]
     --ecdsa-private-key    ECDSA private key for the       [string]                  
                            Hedera account                                            
     --ed25519-private-key  ED25519 private key for the     [string]                  
                            Hedera account                                            
     --force-port-forward   Force port forward to access    [boolean] [default: true] 
                            the network services                                      
     --hbar-amount          Amount of HBAR to add           [number] [default: 100]   
-v,  --version              Show version number             [boolean]                 

```

### account get
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js account get --help

 account get

Gets the account info including the current amount of HBAR

Options:

     --account-id          The Hedera account id, e.g.:    [string]                  
                           0.0.1001                                                  
-c,  --cluster-ref         The cluster reference that      [string]                  
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
     --private-key         Show private key information    [boolean] [default: false]
-v,  --version             Show version number             [boolean]                 

```

## cluster-ref
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref --help

Select a context command
 cluster-ref

Manage solo testing cluster

Commands:
  cluster-ref connect      associates a cluster reference to a k8s context
  cluster-ref disconnect   dissociates a cluster reference from a k8s context
  cluster-ref list         List all available clusters
  cluster-ref info         Get cluster info
  cluster-ref setup        Setup cluster with shared components
  cluster-ref reset        Uninstall shared components from cluster

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### cluster-ref connect
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref connect --help

Missing required argument: cluster-ref
 cluster-ref connect

associates a cluster reference to a k8s context

Options:

-c,  --cluster-ref         The cluster reference that      [string] [required]               
                           will be used for referencing                                      
                           the Kubernetes cluster and                                        
                           stored in the local and remote                                    
                           configuration for the                                             
                           deployment.  For commands that                                    
                           take multiple clusters they                                       
                           can be separated by commas.                                       
     --context             The Kubernetes context name to  [string]                          
                           be used                                                           
     --dev                 Enable developer mode           [boolean] [default: false]        
     --email               User email address used for     [string] [default: "john@doe.com"]
                           local configuration                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]         
                           the network services                                              
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]        
                           confirmation                                                      
-v,  --version             Show version number             [boolean]                         

```

### cluster-ref disconnect
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref disconnect --help

Missing required argument: cluster-ref
 cluster-ref disconnect

dissociates a cluster reference from a k8s context

Options:

-c,  --cluster-ref         The cluster reference that      [string] [required]       
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### cluster-ref list
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref list --help

 cluster-ref list

List all available clusters

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### cluster-ref info
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref info --help

Missing required argument: cluster-ref
 cluster-ref info

Get cluster info

Options:

-c,  --cluster-ref         The cluster reference that      [string] [required]       
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### cluster-ref setup
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref setup --help

 cluster-ref setup

Setup cluster with shared components

Options:

     --chart-dir                Local chart directory path      [string]                        
                                (e.g. ~/solo-charts/charts                                      
-c,  --cluster-ref              The cluster reference that      [string]                        
                                will be used for referencing                                    
                                the Kubernetes cluster and                                      
                                stored in the local and remote                                  
                                configuration for the                                           
                                deployment.  For commands that                                  
                                take multiple clusters they                                     
                                can be separated by commas.                                     
-s,  --cluster-setup-namespace  Cluster Setup Namespace         [string] [default: "solo-setup"]
     --dev                      Enable developer mode           [boolean] [default: false]      
     --force-port-forward       Force port forward to access    [boolean] [default: true]       
                                the network services                                            
     --minio                    Deploy minio operator           [boolean] [default: true]       
     --prometheus-stack         Deploy prometheus stack         [boolean] [default: false]      
-q,  --quiet-mode               Quiet mode, do not prompt for   [boolean] [default: false]      
                                confirmation                                                    
     --solo-chart-version       Solo testing chart version      [string] [default: "0.49.1"]    
-v,  --version                  Show version number             [boolean]                       

```

### cluster-ref reset
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js cluster-ref reset --help

 cluster-ref reset

Uninstall shared components from cluster

Options:

-c,  --cluster-ref              The cluster reference that      [string]                        
                                will be used for referencing                                    
                                the Kubernetes cluster and                                      
                                stored in the local and remote                                  
                                configuration for the                                           
                                deployment.  For commands that                                  
                                take multiple clusters they                                     
                                can be separated by commas.                                     
-s,  --cluster-setup-namespace  Cluster Setup Namespace         [string] [default: "solo-setup"]
     --dev                      Enable developer mode           [boolean] [default: false]      
-f,  --force                    Force actions even if those     [boolean] [default: false]      
                                can be skipped                                                  
     --force-port-forward       Force port forward to access    [boolean] [default: true]       
                                the network services                                            
-q,  --quiet-mode               Quiet mode, do not prompt for   [boolean] [default: false]      
                                confirmation                                                    
-v,  --version                  Show version number             [boolean]                       

```

## network
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js network --help

Select a chart command
 network

Manage solo network deployment

Commands:
  network deploy    Deploy solo network.  Requires the chart `solo-cluster-setup` to have been installed in the cluster.  If it hasn't the following command can be ran: `solo cluster-ref setup`
  network destroy   Destroy solo network. If both --delete-pvcs and --delete-secrets are set to true, the namespace will be deleted.

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### network deploy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js network deploy --help

 network deploy

Deploy solo network.  Requires the chart `solo-cluster-setup` to have been installed in the cluster.  If it hasn't the following command can be ran: `solo cluster-ref setup`

Options:

     --api-permission-properties  api-permission.properties file  [string] [default: "templates/api-permission.properties"]
                                  for node                                                                                 
     --app                        Testing app name                [string] [default: "HederaNode.jar"]                     
     --application-env            the application.env file for    [string] [default: "templates/application.env"]          
                                  the node provides environment                                                            
                                  variables to the                                                                         
                                  solo-container to be used when                                                           
                                  the hedera platform is started                                                           
     --application-properties     application.properties file     [string] [default: "templates/application.properties"]   
                                  for node                                                                                 
     --aws-bucket                 name of aws storage bucket      [string]                                                 
     --aws-bucket-prefix          path prefix of aws storage      [string]                                                 
                                  bucket                                                                                   
     --aws-endpoint               aws storage endpoint URL        [string]                                                 
     --aws-write-access-key       aws storage access key for      [string]                                                 
                                  write access                                                                             
     --aws-write-secrets          aws storage secret key for      [string]                                                 
                                  write access                                                                             
     --backup-bucket              name of bucket for backing up   [string]                                                 
                                  state files                                                                              
     --backup-endpoint            backup storage endpoint URL     [string]                                                 
     --backup-region              backup storage region           [string] [default: "***"]                                
     --backup-write-access-key    backup storage access key for   [string]                                                 
                                  write access                                                                             
     --backup-write-secrets       backup storage secret key for   [string]                                                 
                                  write access                                                                             
     --bootstrap-properties       bootstrap.properties file for   [string] [default: "templates/bootstrap.properties"]     
                                  node                                                                                     
     --cache-dir                  Local cache directory           [string] [default: "/Users/user/.solo/cache"]            
     --chart-dir                  Local chart directory path      [string]                                                 
                                  (e.g. ~/solo-charts/charts                                                               
     --debug-node-alias           Enable default jvm debug port   [string]                                                 
                                  (5005) for the given node id                                                             
-d,  --deployment                 The name the user will          [string]                                                 
                                  reference locally to link to a                                                           
                                  deployment                                                                               
     --dev                        Enable developer mode           [boolean] [default: false]                               
     --domain-names               Custom domain names for         [string]                                                 
                                  consensus nodes mapping for                                                              
                                  the(e.g. node0=domain.name                                                               
                                  where key is node alias and                                                              
                                  value is domain name)with                                                                
                                  multiple nodes comma seperated                                                           
     --envoy-ips                  IP mapping where key = value    [string]                                                 
                                  is node alias and static ip                                                              
                                  for envoy proxy, (e.g.:                                                                  
                                  --envoy-ips                                                                              
                                  node1=127.0.0.1,node2=127.0.0.1)                                                           
     --force-port-forward         Force port forward to access    [boolean] [default: true]                                
                                  the network services                                                                     
     --gcs-bucket                 name of gcs storage bucket      [string]                                                 
     --gcs-bucket-prefix          path prefix of google storage   [string]                                                 
                                  bucket                                                                                   
     --gcs-endpoint               gcs storage endpoint URL        [string]                                                 
     --gcs-write-access-key       gcs storage access key for      [string]                                                 
                                  write access                                                                             
     --gcs-write-secrets          gcs storage secret key for      [string]                                                 
                                  write access                                                                             
     --genesis-throttles-file     throttles.json file used        [string]                                                 
                                  during network genesis                                                                   
     --grpc-tls-cert              TLS Certificate path for the    [string]                                                 
                                  gRPC (e.g.                                                                               
                                  "node1=/Users/username/node1-grpc.cert" with multiple nodes comma separated)                                                           
     --grpc-tls-key               TLS Certificate key path for    [string]                                                 
                                  the gRPC (e.g.                                                                           
                                  "node1=/Users/username/node1-grpc.key" with multiple nodes comma seperated)                                                           
     --grpc-web-tls-cert          TLS Certificate path for gRPC   [string]                                                 
                                  Web (e.g.                                                                                
                                  "node1=/Users/username/node1-grpc-web.cert" with multiple nodes comma separated)                                                           
     --grpc-web-tls-key           TLC Certificate key path for    [string]                                                 
                                  gRPC Web (e.g.                                                                           
                                  "node1=/Users/username/node1-grpc-web.key" with multiple nodes comma seperated)                                                           
     --haproxy-ips                IP mapping where key = value    [string]                                                 
                                  is node alias and static ip                                                              
                                  for haproxy, (e.g.:                                                                      
                                  --haproxy-ips                                                                            
                                  node1=127.0.0.1,node2=127.0.0.1)                                                           
-l,  --ledger-id                  Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                                
     --load-balancer              Enable load balancer for        [boolean] [default: false]                               
                                  network node proxies                                                                     
     --log4j2-xml                 log4j2.xml file for node        [string] [default: "templates/log4j2.xml"]               
-i,  --node-aliases               Comma separated node aliases    [string]                                                 
                                  (empty means all nodes)                                                                  
     --profile                    Resource profile (local | tiny  [string] [default: "local"]                              
                                  | small | medium | large)                                                                
     --profile-file               Resource profile definition     [string] [default: "profiles/custom-spec.yaml"]          
                                  (e.g. custom-spec.yaml)                                                                  
     --prometheus-svc-monitor     Enable prometheus service       [boolean] [default: false]                               
                                  monitor for the network nodes                                                            
     --pvcs                       Enable persistent volume        [boolean] [default: false]                               
                                  claims to store data outside                                                             
                                  the pod, required for node add                                                           
-q,  --quiet-mode                 Quiet mode, do not prompt for   [boolean] [default: false]                               
                                  confirmation                                                                             
-t,  --release-tag                Release tag to be used (e.g.    [string] [default: "v0.59.5"]                            
                                  v0.59.5)                                                                                 
     --settings-txt               settings.txt file for node      [string] [default: "templates/settings.txt"]             
     --solo-chart-version         Solo testing chart version      [string] [default: "0.49.1"]                             
     --storage-type               storage type for saving stream  [default: "minio_only"]                                  
                                  files, available options are                                                             
                                  minio_only, aws_only,                                                                    
                                  gcs_only, aws_and_gcs                                                                    
-f,  --values-file                Comma separated chart values    [string]                                                 
                                  file paths for each cluster                                                              
                                  (e.g.                                                                                    
                                  values.yaml,cluster-1=./a/b/values1.yaml,cluster-2=./a/b/values2.yaml)                                                           
-v,  --version                    Show version number             [boolean]                                                

```

### network destroy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js network destroy --help

 network destroy

Destroy solo network. If both --delete-pvcs and --delete-secrets are set to true, the namespace will be deleted.

Options:

     --delete-pvcs         Delete the persistent volume    [boolean] [default: false]
                           claims. If both  --delete-pvcs                            
                            and  --delete-secrets  are                               
                           set to true, the namespace                                
                           will be deleted.                                          
     --delete-secrets      Delete the network secrets. If  [boolean] [default: false]
                           both  --delete-pvcs  and                                  
                           --delete-secrets  are set to                              
                           true, the namespace will be                               
                           deleted.                                                  
-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --enable-timeout      enable time out for running a   [boolean] [default: false]
                           command                                                   
-f,  --force               Force actions even if those     [boolean] [default: false]
                           can be skipped                                            
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

## node
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node --help

Select a node command
 node

Manage Hedera platform node in solo network

Commands:
  node setup                         Setup node with a specific version of Hedera platform
  node start                         Start a node
  node stop                          Stop a node
  node freeze                        Freeze all nodes of the network
  node restart                       Restart all nodes of the network
  node keys                          Generate node keys
  node refresh                       Reset and restart a node
  node logs                          Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory
  node states                        Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory
  node add                           Adds a node with a specific version of Hedera platform
  node add-prepare                   Prepares the addition of a node with a specific version of Hedera platform
  node add-submit-transactions       Submits NodeCreateTransaction and Upgrade transactions to the network nodes
  node add-execute                   Executes the addition of a previously prepared node
  node update                        Update a node with a specific version of Hedera platform
  node update-prepare                Prepare the deployment to update a node with a specific version of Hedera platform
  node update-submit-transactions    Submit transactions for updating a node with a specific version of Hedera platform
  node update-execute                Executes the updating of a node with a specific version of Hedera platform
  node delete                        Delete a node with a specific version of Hedera platform
  node delete-prepare                Prepares the deletion of a node with a specific version of Hedera platform
  node delete-submit-transactions    Submits transactions to the network nodes for deleting a node
  node delete-execute                Executes the deletion of a previously prepared node
  node prepare-upgrade               Prepare the network for a Freeze Upgrade operation
  node freeze-upgrade                Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade
  node upgrade                       upgrades all nodes on the network
  node upgrade-prepare               Prepare the deployment to upgrade network
  node upgrade-submit-transactions   Submit transactions for upgrading network
  node upgrade-execute               Executes the upgrading the network
  node download-generated-files      Downloads the generated files from an existing node

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### node setup
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node setup --help

Missing required argument: deployment
 node setup

Setup node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --admin-public-keys   Comma separated list of DER     [string]                                     
                           encoded ED25519 public keys                                                  
                           and must match the order of                                                  
                           the node aliases                                                             
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --app-config          json config file of testing     [string]                                     
                           app                                                                          
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --local-build-path    path of hedera local repo       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
-v,  --version             Show version number             [boolean]                                    

```

### node start
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node start --help

Missing required argument: deployment
 node start

Start a node

Options:

-d,  --deployment          The name the user will          [string] [required]                 
                           reference locally to link to a                                      
                           deployment                                                          
     --app                 Testing app name                [string] [default: "HederaNode.jar"]
     --debug-node-alias    Enable default jvm debug port   [string]                            
                           (5005) for the given node id                                        
     --dev                 Enable developer mode           [boolean] [default: false]          
     --force-port-forward  Force port forward to access    [boolean] [default: true]           
                           the network services                                                
-i,  --node-aliases        Comma separated node aliases    [string]                            
                           (empty means all nodes)                                             
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]          
                           confirmation                                                        
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]       
                           v0.59.5)                                                            
     --stake-amounts       The amount to be staked in the  [string]                            
                           same order you list the node                                        
                           aliases with multiple node                                          
                           staked values comma seperated                                       
     --state-file          A zipped state file to be used  [string]                            
                           for the network                                                     
-v,  --version             Show version number             [boolean]                           

```

### node stop
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node stop --help

Missing required argument: deployment
 node stop

Stop a node

Options:

-d,  --deployment          The name the user will          [string] [required]       
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-i,  --node-aliases        Comma separated node aliases    [string]                  
                           (empty means all nodes)                                   
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### node freeze
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node freeze --help

Missing required argument: deployment
 node freeze

Freeze all nodes of the network

Options:

-d,  --deployment          The name the user will          [string] [required]       
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### node restart
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node restart --help

Missing required argument: deployment
 node restart

Restart all nodes of the network

Options:

-d,  --deployment          The name the user will          [string] [required]       
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### node keys
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node keys --help

Missing required argument: deployment
 node keys

Generate node keys

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-keys         Generate gossip keys for nodes  [boolean] [default: false]                   
-n,  --namespace           Namespace                       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --tls-keys            Generate gRPC TLS keys for      [boolean] [default: false]                   
                           nodes                                                                        
-v,  --version             Show version number             [boolean]                                    

```

### node refresh
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node refresh --help

Missing required argument: deployment
 node refresh

Reset and restart a node

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --local-build-path    path of hedera local repo       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
-v,  --version             Show version number             [boolean]                                    

```

### node logs
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node logs --help

Missing required arguments: deployment, node-aliases
 node logs

Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory

Options:

-d,  --deployment          The name the user will          [string] [required]       
                           reference locally to link to a                            
                           deployment                                                
-i,  --node-aliases        Comma separated node aliases    [string] [required]       
                           (empty means all nodes)                                   
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### node states
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node states --help

Missing required arguments: deployment, node-aliases
 node states

Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory

Options:

-d,  --deployment          The name the user will          [string] [required]       
                           reference locally to link to a                            
                           deployment                                                
-i,  --node-aliases        Comma separated node aliases    [string] [required]       
                           (empty means all nodes)                                   
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### node add
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node add --help

Missing required argument: deployment
 node add

Adds a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --admin-key           Admin key                       [string] [default: "***"]                    
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
-c,  --cluster-ref         The cluster reference that      [string]                                     
                           will be used for referencing                                                 
                           the Kubernetes cluster and                                                   
                           stored in the local and remote                                               
                           configuration for the                                                        
                           deployment.  For commands that                                               
                           take multiple clusters they                                                  
                           can be separated by commas.                                                  
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
     --envoy-ips           IP mapping where key = value    [string]                                     
                           is node alias and static ip                                                  
                           for envoy proxy, (e.g.:                                                      
                           --envoy-ips                                                                  
                           node1=127.0.0.1,node2=127.0.0.1)                                               
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --gossip-keys         Generate gossip keys for nodes  [boolean] [default: false]                   
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --grpc-tls-cert       TLS Certificate path for the    [string]                                     
                           gRPC (e.g.                                                                   
                           "node1=/Users/username/node1-grpc.cert" with multiple nodes comma separated)                                               
     --grpc-tls-key        TLS Certificate key path for    [string]                                     
                           the gRPC (e.g.                                                               
                           "node1=/Users/username/node1-grpc.key" with multiple nodes comma seperated)                                               
     --grpc-web-tls-cert   TLS Certificate path for gRPC   [string]                                     
                           Web (e.g.                                                                    
                           "node1=/Users/username/node1-grpc-web.cert" with multiple nodes comma separated)                                               
     --grpc-web-tls-key    TLC Certificate key path for    [string]                                     
                           gRPC Web (e.g.                                                               
                           "node1=/Users/username/node1-grpc-web.key" with multiple nodes comma seperated)                                               
     --haproxy-ips         IP mapping where key = value    [string]                                     
                           is node alias and static ip                                                  
                           for haproxy, (e.g.:                                                          
                           --haproxy-ips                                                                
                           node1=127.0.0.1,node2=127.0.0.1)                                               
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
     --pvcs                Enable persistent volume        [boolean] [default: false]                   
                           claims to store data outside                                                 
                           the pod, required for node add                                               
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
     --tls-keys            Generate gRPC TLS keys for      [boolean] [default: false]                   
                           nodes                                                                        
-v,  --version             Show version number             [boolean]                                    

```

### node add-prepare
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node add-prepare --help

Missing required arguments: deployment, output-dir
 node add-prepare

Prepares the addition of a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --output-dir          Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           saved to                                                                     
     --admin-key           Admin key                       [string] [default: "***"]                    
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
-c,  --cluster-ref         The cluster reference that      [string]                                     
                           will be used for referencing                                                 
                           the Kubernetes cluster and                                                   
                           stored in the local and remote                                               
                           configuration for the                                                        
                           deployment.  For commands that                                               
                           take multiple clusters they                                                  
                           can be separated by commas.                                                  
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --gossip-keys         Generate gossip keys for nodes  [boolean] [default: false]                   
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --grpc-tls-cert       TLS Certificate path for the    [string]                                     
                           gRPC (e.g.                                                                   
                           "node1=/Users/username/node1-grpc.cert" with multiple nodes comma separated)                                               
     --grpc-tls-key        TLS Certificate key path for    [string]                                     
                           the gRPC (e.g.                                                               
                           "node1=/Users/username/node1-grpc.key" with multiple nodes comma seperated)                                               
     --grpc-web-tls-cert   TLS Certificate path for gRPC   [string]                                     
                           Web (e.g.                                                                    
                           "node1=/Users/username/node1-grpc-web.cert" with multiple nodes comma separated)                                               
     --grpc-web-tls-key    TLC Certificate key path for    [string]                                     
                           gRPC Web (e.g.                                                               
                           "node1=/Users/username/node1-grpc-web.key" with multiple nodes comma seperated)                                               
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
     --pvcs                Enable persistent volume        [boolean] [default: false]                   
                           claims to store data outside                                                 
                           the pod, required for node add                                               
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
     --tls-keys            Generate gRPC TLS keys for      [boolean] [default: false]                   
                           nodes                                                                        
-v,  --version             Show version number             [boolean]                                    

```

### node add-submit-transactions
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node add-submit-transactions --help

Missing required arguments: deployment, input-dir
 node add-submit-transactions

Submits NodeCreateTransaction and Upgrade transactions to the network nodes

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
-c,  --cluster-ref         The cluster reference that      [string]                                     
                           will be used for referencing                                                 
                           the Kubernetes cluster and                                                   
                           stored in the local and remote                                               
                           configuration for the                                                        
                           deployment.  For commands that                                               
                           take multiple clusters they                                                  
                           can be separated by commas.                                                  
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --gossip-keys         Generate gossip keys for nodes  [boolean] [default: false]                   
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --grpc-tls-cert       TLS Certificate path for the    [string]                                     
                           gRPC (e.g.                                                                   
                           "node1=/Users/username/node1-grpc.cert" with multiple nodes comma separated)                                               
     --grpc-tls-key        TLS Certificate key path for    [string]                                     
                           the gRPC (e.g.                                                               
                           "node1=/Users/username/node1-grpc.key" with multiple nodes comma seperated)                                               
     --grpc-web-tls-cert   TLS Certificate path for gRPC   [string]                                     
                           Web (e.g.                                                                    
                           "node1=/Users/username/node1-grpc-web.cert" with multiple nodes comma separated)                                               
     --grpc-web-tls-key    TLC Certificate key path for    [string]                                     
                           gRPC Web (e.g.                                                               
                           "node1=/Users/username/node1-grpc-web.key" with multiple nodes comma seperated)                                               
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
     --pvcs                Enable persistent volume        [boolean] [default: false]                   
                           claims to store data outside                                                 
                           the pod, required for node add                                               
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
     --tls-keys            Generate gRPC TLS keys for      [boolean] [default: false]                   
                           nodes                                                                        
-v,  --version             Show version number             [boolean]                                    

```

### node add-execute
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node add-execute --help

Missing required arguments: deployment, input-dir
 node add-execute

Executes the addition of a previously prepared node

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
-c,  --cluster-ref         The cluster reference that      [string]                                     
                           will be used for referencing                                                 
                           the Kubernetes cluster and                                                   
                           stored in the local and remote                                               
                           configuration for the                                                        
                           deployment.  For commands that                                               
                           take multiple clusters they                                                  
                           can be separated by commas.                                                  
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
     --envoy-ips           IP mapping where key = value    [string]                                     
                           is node alias and static ip                                                  
                           for envoy proxy, (e.g.:                                                      
                           --envoy-ips                                                                  
                           node1=127.0.0.1,node2=127.0.0.1)                                               
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --gossip-keys         Generate gossip keys for nodes  [boolean] [default: false]                   
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --grpc-tls-cert       TLS Certificate path for the    [string]                                     
                           gRPC (e.g.                                                                   
                           "node1=/Users/username/node1-grpc.cert" with multiple nodes comma separated)                                               
     --grpc-tls-key        TLS Certificate key path for    [string]                                     
                           the gRPC (e.g.                                                               
                           "node1=/Users/username/node1-grpc.key" with multiple nodes comma seperated)                                               
     --grpc-web-tls-cert   TLS Certificate path for gRPC   [string]                                     
                           Web (e.g.                                                                    
                           "node1=/Users/username/node1-grpc-web.cert" with multiple nodes comma separated)                                               
     --grpc-web-tls-key    TLC Certificate key path for    [string]                                     
                           gRPC Web (e.g.                                                               
                           "node1=/Users/username/node1-grpc-web.key" with multiple nodes comma seperated)                                               
     --haproxy-ips         IP mapping where key = value    [string]                                     
                           is node alias and static ip                                                  
                           for haproxy, (e.g.:                                                          
                           --haproxy-ips                                                                
                           node1=127.0.0.1,node2=127.0.0.1)                                               
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
     --pvcs                Enable persistent volume        [boolean] [default: false]                   
                           claims to store data outside                                                 
                           the pod, required for node add                                               
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
     --tls-keys            Generate gRPC TLS keys for      [boolean] [default: false]                   
                           nodes                                                                        
-v,  --version             Show version number             [boolean]                                    

```

### node update
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node update --help

Missing required arguments: deployment, release-tag, node-alias
 node update

Update a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --node-alias          Node alias (e.g. node99)        [string] [required]                          
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --gossip-private-key  path and file name of the       [string]                                     
                           private key for signing gossip                                               
                           in PEM key format to be used                                                 
     --gossip-public-key   path and file name of the       [string]                                     
                           public key for signing gossip                                                
                           in PEM key format to be used                                                 
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --local-build-path    path of hedera local repo       [string]                                     
     --new-account-number  new account number for node     [string]                                     
                           update transaction                                                           
     --new-admin-key       new admin key for the Hedera    [string]                                     
                           account                                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
     --tls-private-key     path and file name of the       [string]                                     
                           private TLS key to be used                                                   
     --tls-public-key      path and file name of the       [string]                                     
                           public TLS key to be used                                                    
-v,  --version             Show version number             [boolean]                                    

```

### node update-prepare
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node update-prepare --help

Missing required arguments: deployment, release-tag, output-dir, node-alias
 node update-prepare

Prepare the deployment to update a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --node-alias          Node alias (e.g. node99)        [string] [required]                          
     --output-dir          Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           saved to                                                                     
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --gossip-private-key  path and file name of the       [string]                                     
                           private key for signing gossip                                               
                           in PEM key format to be used                                                 
     --gossip-public-key   path and file name of the       [string]                                     
                           public key for signing gossip                                                
                           in PEM key format to be used                                                 
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --local-build-path    path of hedera local repo       [string]                                     
     --new-account-number  new account number for node     [string]                                     
                           update transaction                                                           
     --new-admin-key       new admin key for the Hedera    [string]                                     
                           account                                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
     --tls-private-key     path and file name of the       [string]                                     
                           private TLS key to be used                                                   
     --tls-public-key      path and file name of the       [string]                                     
                           public TLS key to be used                                                    
-v,  --version             Show version number             [boolean]                                    

```

### node update-submit-transactions
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node update-submit-transactions --help

Missing required arguments: deployment, release-tag, input-dir
 node update-submit-transactions

Submit transactions for updating a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --local-build-path    path of hedera local repo       [string]                                     
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node update-execute
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node update-execute --help

Missing required arguments: deployment, release-tag, input-dir
 node update-execute

Executes the updating of a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --gossip-endpoints    Comma separated gossip          [string]                                     
                           endpoints of the node(e.g.                                                   
                           first one is internal, second                                                
                           one is external)                                                             
     --grpc-endpoints      Comma separated gRPC endpoints  [string]                                     
                           of the node (at most 8)                                                      
     --local-build-path    path of hedera local repo       [string]                                     
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node delete
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node delete --help

Missing required arguments: deployment, node-alias
 node delete

Delete a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --node-alias          Node alias (e.g. node99)        [string] [required]                          
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node delete-prepare
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node delete-prepare --help

Missing required arguments: deployment, node-alias, output-dir
 node delete-prepare

Prepares the deletion of a node with a specific version of Hedera platform

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --node-alias          Node alias (e.g. node99)        [string] [required]                          
     --output-dir          Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           saved to                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node delete-submit-transactions
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node delete-submit-transactions --help

Missing required arguments: deployment, node-alias, input-dir
 node delete-submit-transactions

Submits transactions to the network nodes for deleting a node

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
     --node-alias          Node alias (e.g. node99)        [string] [required]                          
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node delete-execute
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node delete-execute --help

Missing required arguments: deployment, node-alias, input-dir
 node delete-execute

Executes the deletion of a previously prepared node

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
     --node-alias          Node alias (e.g. node99)        [string] [required]                          
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --domain-names        Custom domain names for         [string]                                     
                           consensus nodes mapping for                                                  
                           the(e.g. node0=domain.name                                                   
                           where key is node alias and                                                  
                           value is domain name)with                                                    
                           multiple nodes comma seperated                                               
     --endpoint-type       Endpoint type (IP or FQDN)      [string] [default: "FQDN"]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                    
     --local-build-path    path of hedera local repo       [string]                                     
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node prepare-upgrade
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node prepare-upgrade --help

Missing required argument: deployment
 node prepare-upgrade

Prepare the network for a Freeze Upgrade operation

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
-v,  --version             Show version number             [boolean]                                    

```

### node freeze-upgrade
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node freeze-upgrade --help

Missing required argument: deployment
 node freeze-upgrade

Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
-v,  --version             Show version number             [boolean]                                    

```

### node upgrade
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade --help

Missing required arguments: deployment, release-tag, upgrade-zip-file
 node upgrade

upgrades all nodes on the network

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --upgrade-zip-file    A zipped file used for network  [string] [required]                          
                           upgrade                                                                      
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --local-build-path    path of hedera local repo       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node upgrade-prepare
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade-prepare --help

Missing required arguments: deployment, release-tag, upgrade-zip-file, output-dir
 node upgrade-prepare

Prepare the deployment to upgrade network

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --output-dir          Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           saved to                                                                     
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --upgrade-zip-file    A zipped file used for network  [string] [required]                          
                           upgrade                                                                      
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --local-build-path    path of hedera local repo       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node upgrade-submit-transactions
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade-submit-transactions --help

Missing required arguments: deployment, release-tag, input-dir
 node upgrade-submit-transactions

Submit transactions for upgrading network

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --local-build-path    path of hedera local repo       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node upgrade-execute
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node upgrade-execute --help

Missing required arguments: deployment, release-tag, input-dir
 node upgrade-execute

Executes the upgrading the network

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --input-dir           Path to the directory where     [string] [required]                          
                           the command context will be                                                  
                           loaded from                                                                  
-t,  --release-tag         Release tag to be used (e.g.    [string] [required]                          
                           v0.59.5)                                                                     
     --app                 Testing app name                [string] [default: "HederaNode.jar"]         
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --chart-dir           Local chart directory path      [string]                                     
                           (e.g. ~/solo-charts/charts                                                   
     --debug-node-alias    Enable default jvm debug port   [string]                                     
                           (5005) for the given node id                                                 
     --dev                 Enable developer mode           [boolean] [default: false]                   
-f,  --force               Force actions even if those     [boolean] [default: false]                   
                           can be skipped                                                               
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
     --local-build-path    path of hedera local repo       [string]                                     
-i,  --node-aliases        Comma separated node aliases    [string]                                     
                           (empty means all nodes)                                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
     --solo-chart-version  Solo testing chart version      [string] [default: "0.49.1"]                 
-v,  --version             Show version number             [boolean]                                    

```

### node download-generated-files
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js node download-generated-files --help

Missing required argument: deployment
 node download-generated-files

Downloads the generated files from an existing node

Options:

-d,  --deployment          The name the user will          [string] [required]                          
                           reference locally to link to a                                               
                           deployment                                                                   
     --cache-dir           Local cache directory           [string] [default: "/Users/user/.solo/cache"]
     --dev                 Enable developer mode           [boolean] [default: false]                   
     --force-port-forward  Force port forward to access    [boolean] [default: true]                    
                           the network services                                                         
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                   
                           confirmation                                                                 
-t,  --release-tag         Release tag to be used (e.g.    [string] [default: "v0.59.5"]                
                           v0.59.5)                                                                     
-v,  --version             Show version number             [boolean]                                    

```

## relay
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js relay --help

Select a relay command
 relay

Manage JSON RPC relays in solo network

Commands:
  relay deploy    Deploy a JSON RPC relay
  relay destroy   Destroy JSON RPC relay

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### relay deploy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js relay deploy --help

 relay deploy

Deploy a JSON RPC relay

Options:

     --chart-dir           Local chart directory path      [string]                                       
                           (e.g. ~/solo-charts/charts                                                     
-c,  --cluster-ref         The cluster reference that      [string]                                       
                           will be used for referencing                                                   
                           the Kubernetes cluster and                                                     
                           stored in the local and remote                                                 
                           configuration for the                                                          
                           deployment.  For commands that                                                 
                           take multiple clusters they                                                    
                           can be separated by commas.                                                    
-d,  --deployment          The name the user will          [string]                                       
                           reference locally to link to a                                                 
                           deployment                                                                     
     --dev                 Enable developer mode           [boolean] [default: false]                     
     --domain-name         Custom domain name              [string]                                       
     --force-port-forward  Force port forward to access    [boolean] [default: true]                      
                           the network services                                                           
-l,  --ledger-id           Ledger ID (a.k.a. Chain ID)     [string] [default: "298"]                      
-i,  --node-aliases        Comma separated node aliases    [string]                                       
                           (empty means all nodes)                                                        
     --operator-id         Operator ID                     [string]                                       
     --operator-key        Operator Key                    [string]                                       
     --profile             Resource profile (local | tiny  [string] [default: "local"]                    
                           | small | medium | large)                                                      
     --profile-file        Resource profile definition     [string] [default: "profiles/custom-spec.yaml"]
                           (e.g. custom-spec.yaml)                                                        
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]                     
                           confirmation                                                                   
     --relay-release       Relay release tag to be used    [string] [default: "v0.66.0"]                  
                           (e.g. v0.48.0)                                                                 
     --replica-count       Replica count                   [number] [default: 1]                          
-f,  --values-file         Comma separated chart values    [string]                                       
                           file                                                                           
-v,  --version             Show version number             [boolean]                                      

```

### relay destroy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js relay destroy --help

 relay destroy

Destroy JSON RPC relay

Options:

     --chart-dir           Local chart directory path      [string]                  
                           (e.g. ~/solo-charts/charts                                
-c,  --cluster-ref         The cluster reference that      [string]                  
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-i,  --node-aliases        Comma separated node aliases    [string]                  
                           (empty means all nodes)                                   
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

## mirror-node
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js mirror-node --help

Select a mirror-node command
 mirror-node

Manage Hedera Mirror Node in solo network

Commands:
  mirror-node deploy    Deploy mirror-node and its components
  mirror-node destroy   Destroy mirror-node components and database

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### mirror-node deploy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js mirror-node deploy --help

 mirror-node deploy

Deploy mirror-node and its components

Options:

     --cache-dir                         Local cache directory           [string] [default: "/Users/user/.solo/cache"]  
     --chart-dir                         Local chart directory path      [string]                                       
                                         (e.g. ~/solo-charts/charts                                                     
-c,  --cluster-ref                       The cluster reference that      [string]                                       
                                         will be used for referencing                                                   
                                         the Kubernetes cluster and                                                     
                                         stored in the local and remote                                                 
                                         configuration for the                                                          
                                         deployment.  For commands that                                                 
                                         take multiple clusters they                                                    
                                         can be separated by commas.                                                    
-d,  --deployment                        The name the user will          [string]                                       
                                         reference locally to link to a                                                 
                                         deployment                                                                     
     --dev                               Enable developer mode           [boolean] [default: false]                     
     --domain-name                       Custom domain name              [string]                                       
     --enable-ingress                    enable ingress on the           [boolean] [default: false]                     
                                         component/pod                                                                  
     --external-database-host            Use to provide the external     [string]                                       
                                         database host if the '                                                         
                                         --use-external-database ' is                                                   
                                         passed                                                                         
     --external-database-owner-password  Use to provide the external     [string]                                       
                                         database owner's password if                                                   
                                         the ' --use-external-database                                                  
                                         ' is passed                                                                    
     --external-database-owner-username  Use to provide the external     [string]                                       
                                         database owner's username if                                                   
                                         the ' --use-external-database                                                  
                                         ' is passed                                                                    
     --external-database-read-password   Use to provide the external     [string]                                       
                                         database readonly user's                                                       
                                         password if the '                                                              
                                         --use-external-database ' is                                                   
                                         passed                                                                         
     --external-database-read-username   Use to provide the external     [string]                                       
                                         database readonly user's                                                       
                                         username if the '                                                              
                                         --use-external-database ' is                                                   
                                         passed                                                                         
     --force-port-forward                Force port forward to access    [boolean] [default: true]                      
                                         the network services                                                           
     --mirror-node-version               Mirror node chart version       [string] [default: "v0.126.0"]                 
     --mirror-static-ip                  static IP address for the       [string]                                       
                                         mirror node                                                                    
     --operator-id                       Operator ID                     [string]                                       
     --operator-key                      Operator Key                    [string]                                       
     --pinger                            Enable Pinger service in the    [boolean] [default: false]                     
                                         Mirror node monitor                                                            
     --profile                           Resource profile (local | tiny  [string] [default: "local"]                    
                                         | small | medium | large)                                                      
     --profile-file                      Resource profile definition     [string] [default: "profiles/custom-spec.yaml"]
                                         (e.g. custom-spec.yaml)                                                        
-q,  --quiet-mode                        Quiet mode, do not prompt for   [boolean] [default: false]                     
                                         confirmation                                                                   
     --storage-bucket                    name of storage bucket for      [string]                                       
                                         mirror node importer                                                           
     --storage-bucket-prefix             path prefix of storage bucket   [string]                                       
                                         mirror node importer                                                           
     --storage-endpoint                  storage endpoint URL for        [string]                                       
                                         mirror node importer                                                           
     --storage-read-access-key           storage read access key for     [string]                                       
                                         mirror node importer                                                           
     --storage-read-secrets              storage read-secret key for     [string]                                       
                                         mirror node importer                                                           
     --storage-type                      storage type for saving stream  [default: "minio_only"]                        
                                         files, available options are                                                   
                                         minio_only, aws_only,                                                          
                                         gcs_only, aws_and_gcs                                                          
     --use-external-database             Set to true if you have an      [boolean] [default: false]                     
                                         external database to use                                                       
                                         instead of the database that                                                   
                                         the Mirror Node Helm chart                                                     
                                         supplies                                                                       
-f,  --values-file                       Comma separated chart values    [string]                                       
                                         file                                                                           
-v,  --version                           Show version number             [boolean]                                      

```

### mirror-node destroy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js mirror-node destroy --help

 mirror-node destroy

Destroy mirror-node components and database

Options:

     --chart-dir           Local chart directory path      [string]                  
                           (e.g. ~/solo-charts/charts                                
-c,  --cluster-ref         The cluster reference that      [string]                  
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
-f,  --force               Force actions even if those     [boolean] [default: false]
                           can be skipped                                            
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

## explorer
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js explorer --help

Select a explorer command
 explorer

Manage Explorer in solo network

Commands:
  explorer deploy    Deploy explorer
  explorer destroy   Destroy explorer

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### explorer deploy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js explorer deploy --help

 explorer deploy

Deploy explorer

Options:

     --cache-dir                      Local cache directory           [string] [default: "/Users/user/.solo/cache"]  
     --chart-dir                      Local chart directory path      [string]                                       
                                      (e.g. ~/solo-charts/charts                                                     
-c,  --cluster-ref                    The cluster reference that      [string]                                       
                                      will be used for referencing                                                   
                                      the Kubernetes cluster and                                                     
                                      stored in the local and remote                                                 
                                      configuration for the                                                          
                                      deployment.  For commands that                                                 
                                      take multiple clusters they                                                    
                                      can be separated by commas.                                                    
-s,  --cluster-setup-namespace        Cluster Setup Namespace         [string] [default: "solo-setup"]               
-d,  --deployment                     The name the user will          [string]                                       
                                      reference locally to link to a                                                 
                                      deployment                                                                     
     --dev                            Enable developer mode           [boolean] [default: false]                     
     --domain-name                    Custom domain name              [string]                                       
     --enable-hedera-explorer-tls     Enable the Hedera Explorer      [boolean] [default: false]                     
                                      TLS, defaults to false,                                                        
                                      requires certManager and                                                       
                                      certManagerCrds, which can be                                                  
                                      deployed through                                                               
                                      solo-cluster-setup chart or                                                    
                                      standalone                                                                     
     --enable-ingress                 enable ingress on the           [boolean] [default: false]                     
                                      component/pod                                                                  
     --force-port-forward             Force port forward to access    [boolean] [default: true]                      
                                      the network services                                                           
     --hedera-explorer-static-ip      The static IP address to use    [string]                                       
                                      for the Hedera Explorer load                                                   
                                      balancer, defaults to ""                                                       
     --hedera-explorer-tls-host-name  The host name to use for the    [string] [default: "explorer.solo.local"]      
                                      Hedera Explorer TLS, defaults                                                  
                                      to "explorer.solo.local"                                                       
     --hedera-explorer-version        Hedera explorer chart version   [string] [default: "24.12.1"]                  
     --mirror-namespace               Namespace to use for the        [string]                                       
                                      Mirror Node deployment, a new                                                  
                                      one will be created if it does                                                 
                                      not exist                                                                      
-n,  --namespace                      Namespace                       [string]                                       
     --profile                        Resource profile (local | tiny  [string] [default: "local"]                    
                                      | small | medium | large)                                                      
     --profile-file                   Resource profile definition     [string] [default: "profiles/custom-spec.yaml"]
                                      (e.g. custom-spec.yaml)                                                        
-q,  --quiet-mode                     Quiet mode, do not prompt for   [boolean] [default: false]                     
                                      confirmation                                                                   
     --solo-chart-version             Solo testing chart version      [string] [default: "0.49.1"]                   
     --tls-cluster-issuer-type        The TLS cluster issuer type to  [string] [default: "self-signed"]              
                                      use for hedera explorer,                                                       
                                      defaults to "self-signed", the                                                 
                                      available options are:                                                         
                                      "acme-staging", "acme-prod",                                                   
                                      or "self-signed"                                                               
-f,  --values-file                    Comma separated chart values    [string]                                       
                                      file                                                                           
-v,  --version                        Show version number             [boolean]                                      

```

### explorer destroy
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js explorer destroy --help

 explorer destroy

Destroy explorer

Options:

     --chart-dir           Local chart directory path      [string]                  
                           (e.g. ~/solo-charts/charts                                
-c,  --cluster-ref         The cluster reference that      [string]                  
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
-f,  --force               Force actions even if those     [boolean] [default: false]
                           can be skipped                                            
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

## deployment
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js deployment --help

Select a chart command
 deployment

Manage solo network deployment

Commands:
  deployment create        Creates a solo deployment
  deployment delete        Deletes a solo deployment
  deployment list          List solo deployments inside a cluster
  deployment add-cluster   Adds cluster to solo deployments

Options:

     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-v,  --version             Show version number             [boolean]                 

```

### deployment create
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js deployment create --help

 deployment create

Creates a solo deployment

Options:

-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-n,  --namespace           Namespace                       [string]                  
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### deployment delete
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js deployment delete --help

 deployment delete

Deletes a solo deployment

Options:

-d,  --deployment          The name the user will          [string]                  
                           reference locally to link to a                            
                           deployment                                                
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### deployment list
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js deployment list --help

 deployment list

List solo deployments inside a cluster

Options:

-c,  --cluster-ref         The cluster reference that      [string]                  
                           will be used for referencing                              
                           the Kubernetes cluster and                                
                           stored in the local and remote                            
                           configuration for the                                     
                           deployment.  For commands that                            
                           take multiple clusters they                               
                           can be separated by commas.                               
     --dev                 Enable developer mode           [boolean] [default: false]
     --force-port-forward  Force port forward to access    [boolean] [default: true] 
                           the network services                                      
-q,  --quiet-mode          Quiet mode, do not prompt for   [boolean] [default: false]
                           confirmation                                              
-v,  --version             Show version number             [boolean]                 

```

### deployment add-cluster
```

> @hashgraph/solo@0.35.1 solo
> node --no-deprecation --no-warnings dist/solo.js deployment add-cluster --help

 deployment add-cluster

Adds cluster to solo deployments

Options:

-c,  --cluster-ref                 The cluster reference that      [string]                                                     
                                   will be used for referencing                                                                 
                                   the Kubernetes cluster and                                                                   
                                   stored in the local and remote                                                               
                                   configuration for the                                                                        
                                   deployment.  For commands that                                                               
                                   take multiple clusters they                                                                  
                                   can be separated by commas.                                                                  
-d,  --deployment                  The name the user will          [string]                                                     
                                   reference locally to link to a                                                               
                                   deployment                                                                                   
     --dev                         Enable developer mode           [boolean] [default: false]                                   
     --dns-base-domain             Base domain for the DNS is the  [string] [default: "cluster.local"]                          
                                   suffix used to construct the                                                                 
                                   fully qualified domain name                                                                  
                                   (FQDN)                                                                                       
     --dns-consensus-node-pattern  Pattern to construct the        [string] [default: "network-{nodeAlias}-svc.{namespace}.svc"]
                                   prefix for the fully qualified                                                               
                                   domain name (FQDN) for the                                                                   
                                   consensus node, the suffix is                                                                
                                   provided by the                                                                              
                                   --dns-base-domain  option (ex.                                                               
                                   network-{nodeAlias}-svc.{namespace}.svc)                                                               
     --enable-cert-manager         Pass the flag to enable cert    [boolean] [default: false]                                   
                                   manager                                                                                      
     --force-port-forward          Force port forward to access    [boolean] [default: true]                                    
                                   the network services                                                                         
     --num-consensus-nodes         Used to specify desired number  [number]                                                     
                                   of consensus nodes for                                                                       
                                   pre-genesis deployments                                                                      
-q,  --quiet-mode                  Quiet mode, do not prompt for   [boolean] [default: false]                                   
                                   confirmation                                                                                 
-v,  --version                     Show version number             [boolean]                                                    

```

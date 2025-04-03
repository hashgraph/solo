## Advanced User Guide
For those who would like to have more control or need some customized setups, here are some step by step instructions of how to setup and deploy a solo network.

NOTE: for cleanup from previous runs, you may need to run the following command:
```
rm -Rf ~/.solo
```

### Setup Kubernetes cluster

#### Remote cluster

* You may use remote kubernetes cluster. In this case, ensure kubernetes context is set up correctly.

```
kubectl config use-context <context-name>
```

#### Local cluster

* You may use [kind](https://kind.sigs.k8s.io/) or [microk8s](https://microk8s.io/) to create a cluster. In this case,
  ensure your Docker engine has enough resources (e.g. Memory >=8Gb, CPU: >=4). Below we show how you can use `kind` to create a cluster

First, use the following command to set up the environment variables:

```
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
```

Then run the following command to set the kubectl context to the new cluster:

```bash
kind create cluster -n "${SOLO_CLUSTER_NAME}"
```
Example output

```
Creating cluster "solo-e2e" ...
 • Ensuring node image (kindest/node:v1.32.2) 🖼  ...
 ✓ Ensuring node image (kindest/node:v1.32.2) 🖼
 • Preparing nodes 📦   ...
 ✓ Preparing nodes 📦 
 • Writing configuration 📜  ...
 ✓ Writing configuration 📜
 • Starting control-plane 🕹️  ...
 ✓ Starting control-plane 🕹️
 • Installing CNI 🔌  ...
 ✓ Installing CNI 🔌
 • Installing StorageClass 💾  ...
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo-e2e"
You can now use your cluster with:

kubectl cluster-info --context kind-solo-e2e

Have a question, bug, or feature request? Let us know! https://kind.sigs.k8s.io/#community 🙂
```

You may now view pods in your cluster using `k9s -A` as below:


```
 Context: kind-solo                                <0> all   <a>       Attach       <ctr… ____  __.________
 Cluster: kind-solo                                          <ctrl-d>  Delete       <l>  |    |/ _/   __   \______
 User:    kind-solo                                          <d>       Describe     <p>  |      < \____    /  ___/
 K9s Rev: v0.32.5                                            <e>       Edit         <shif|    |  \   /    /\___ \
 K8s Rev: v1.27.3                                            <?>       Help         <z>  |____|__ \ /____//____  >
 CPU:     n/a                                                <shift-j> Jump Owner   <s>          \/            \/
 MEM:     n/a
┌───────────────────────────────────────────────── Pods(all)[11] ─────────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                        PF READY STATUS   RESTARTS IP          NODE     │
│ solo-setup     console-557956d575-4r5xm                    ●  1/1   Running         0 10.244.0.5  solo-con │
│ solo-setup     minio-operator-7d575c5f84-8shc9             ●  1/1   Running         0 10.244.0.6  solo-con │
│ kube-system         coredns-5d78c9869d-6cfbg                    ●  1/1   Running         0 10.244.0.4  solo-con │
│ kube-system         coredns-5d78c9869d-gxcjz                    ●  1/1   Running         0 10.244.0.3  solo-con │
│ kube-system         etcd-solo-control-plane                     ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kindnet-k75z6                               ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-apiserver-solo-control-plane           ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-controller-manager-solo-control-plane  ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-proxy-cct7t                            ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-scheduler-solo-control-plane           ●  1/1   Running         0 172.18.0.2  solo-con │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-gwdp6     ●  1/1   Running         0 10.244.0.2  solo-con │
│                                                                                                                 │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


### Step by Step Instructions

* Initialize `solo` directories:

```
# reset .solo directory
rm -rf ~/.solo

solo init
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: init
**********************************************************************************
❯ Setup home directory and cache
✔ Setup home directory and cache
❯ Check dependencies
❯ Check dependency: helm [OS: darwin, Release: 23.6.0, Arch: arm64]
✔ Check dependency: helm [OS: darwin, Release: 23.6.0, Arch: arm64]
✔ Check dependencies
❯ Setup chart manager
✔ Setup chart manager
❯ Copy templates in '/Users/user/.solo/cache'

***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /Users/user/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
✔ Copy templates in '/Users/user/.solo/cache'
```

* Generate `pem` formatted node keys

```
solo node keys --gossip-keys --tls-keys -i node1,node2,node3
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node keys --gossip-keys --tls-keys --node-aliases node1,node2,node3
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Generate gossip keys
❯ Backup old files
✔ Backup old files
❯ Gossip key for node: node1
✔ Gossip key for node: node1
❯ Gossip key for node: node2
✔ Gossip key for node: node2
❯ Gossip key for node: node3
✔ Gossip key for node: node3
✔ Generate gossip keys
❯ Generate gRPC TLS Keys
❯ Backup old files
❯ TLS key for node: node1
❯ TLS key for node: node2
❯ TLS key for node: node3
✔ Backup old files
✔ TLS key for node: node2
✔ TLS key for node: node3
✔ TLS key for node: node1
✔ Generate gRPC TLS Keys
❯ Finalize
✔ Finalize
```
PEM key files are generated in `~/.solo/keys` directory.
```
hedera-node1.crt    hedera-node3.crt    s-private-node1.pem s-public-node1.pem  unused-gossip-pem
hedera-node1.key    hedera-node3.key    s-private-node2.pem s-public-node2.pem  unused-tls
hedera-node2.crt    hedera-node4.crt    s-private-node3.pem s-public-node3.pem
hedera-node2.key    hedera-node4.key    s-private-node4.pem s-public-node4.pem
```

* Create a deployment in the specified clusters, generate RemoteConfig and LocalConfig objects.

```
solo deployment create -n "${SOLO_NAMESPACE}" --context kind-${SOLO_CLUSTER_SETUP_NAMESPACE} --email "${SOLO_EMAIL}" --deployment-clusters kind-${SOLO_CLUSTER_SETUP_NAMESPACE} --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: deployment create --node-aliases node1,node2,node3 --namespace solo --context kind-solo-e2e --email john@doe.com --deployment-clusters kind-solo-e2e --deployment solo-deployment
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Setup home directory
✔ Setup home directory
❯ Prompt local configuration
✔ Prompt local configuration
❯ Add new deployment to local config
✔ Add new deployment to local config
❯ Resolve context for remote cluster
✔ Resolve context for remote cluster
❯ Validate context
✔ Validate context- validated context kind-solo-e2e
❯ Update local configuration
✔ Update local configuration
❯ Validate cluster connections
❯ Testing connection to cluster: kind-solo-e2e
✔ Testing connection to cluster: kind-solo-e2e
✔ Validate cluster connections
❯ Create remoteConfig in clusters
❯ Create remote config in cluster: kind-solo-e2e
✔ Create remote config in cluster: kind-solo-e2e
✔ Create remoteConfig in clusters
```

* Setup cluster with shared components

```
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: cluster setup --cluster-setup-namespace solo-cluster
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Prepare chart values
✔ Prepare chart values
❯ Install 'solo-cluster-setup' chart
✔ Install 'solo-cluster-setup' chart
```

In a separate terminal, you may run `k9s` to view the pod status.

* Deploy helm chart with Hedera network components

It may take a while (5~15 minutes depending on your internet speed) to download various docker images and get the pods started.

If it fails, ensure you have enough resources allocated for Docker engine and retry the command.

```
solo network deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: network deploy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lease
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
❯ Copy gRPC TLS Certificates
↓ Copy gRPC TLS Certificates [SKIPPED: Copy gRPC TLS Certificates]
❯ Check if cluster setup chart is installed
✔ Check if cluster setup chart is installed
❯ Prepare staging directory
❯ Copy Gossip keys to staging
✔ Copy Gossip keys to staging
❯ Copy gRPC TLS keys to staging
✔ Copy gRPC TLS keys to staging
✔ Prepare staging directory
❯ Copy node keys to secrets
❯ Copy TLS keys
❯ Node: node1, cluster: kind-solo-e2e
❯ Node: node2, cluster: kind-solo-e2e
❯ Node: node3, cluster: kind-solo-e2e
❯ Copy Gossip keys
❯ Copy Gossip keys
❯ Copy Gossip keys
✔ Copy Gossip keys
✔ Node: node1, cluster: kind-solo-e2e
✔ Copy TLS keys
✔ Copy Gossip keys
✔ Node: node2, cluster: kind-solo-e2e
✔ Copy Gossip keys
✔ Node: node3, cluster: kind-solo-e2e
✔ Copy node keys to secrets
❯ Install chart 'solo-deployment'
✔ Install chart 'solo-deployment'
❯ Check for load balancer
↓ Check for load balancer [SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config [SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: kind-solo-e2e
✔ Check Node: node1, Cluster: kind-solo-e2e
❯ Check Node: node2, Cluster: kind-solo-e2e
✔ Check Node: node2, Cluster: kind-solo-e2e
❯ Check Node: node3, Cluster: kind-solo-e2e
✔ Check Node: node3, Cluster: kind-solo-e2e
✔ Check node pods are running
❯ Check proxy pods are running
❯ Check HAProxy for: node1, cluster: kind-solo-e2e
❯ Check HAProxy for: node2, cluster: kind-solo-e2e
❯ Check HAProxy for: node3, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node1, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node2, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node3, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node3, cluster: kind-solo-e2e
✔ Check HAProxy for: node3, cluster: kind-solo-e2e
✔ Check HAProxy for: node2, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node1, cluster: kind-solo-e2e
✔ Check HAProxy for: node1, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node2, cluster: kind-solo-e2e
✔ Check proxy pods are running
❯ Check auxiliary pods are ready
❯ Check MinIO
✔ Check MinIO
✔ Check auxiliary pods are ready
❯ Add node and proxies to remote config
✔ Add node and proxies to remote config
```

* Setup node with Hedera platform software.
  * It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
solo node setup -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node setup --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lease
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
❯ Validate nodes states
❯ Validating state for node node1
✔ Validating state for node node1 - valid state: requested
❯ Validating state for node node2
✔ Validating state for node node2 - valid state: requested
❯ Validating state for node node3
✔ Validating state for node node3 - valid state: requested
✔ Validate nodes states
❯ Identify network pods
❯ Check network pod: node1
❯ Check network pod: node2
❯ Check network pod: node3
✔ Check network pod: node1
✔ Check network pod: node2
✔ Check network pod: node3
✔ Identify network pods
❯ Fetch platform software into network nodes
❯ Update node: node1 [ platformVersion = v0.58.10, context = kind-solo-e2e ]
❯ Update node: node2 [ platformVersion = v0.58.10, context = kind-solo-e2e ]
❯ Update node: node3 [ platformVersion = v0.58.10, context = kind-solo-e2e ]
✔ Update node: node1 [ platformVersion = v0.58.10, context = kind-solo-e2e ]
✔ Update node: node3 [ platformVersion = v0.58.10, context = kind-solo-e2e ]
✔ Update node: node2 [ platformVersion = v0.58.10, context = kind-solo-e2e ]
✔ Fetch platform software into network nodes
❯ Setup network nodes
❯ Node: node1
❯ Node: node2
❯ Node: node3
❯ Copy configuration files
❯ Copy configuration files
❯ Copy configuration files
✔ Copy configuration files
❯ Set file permissions
✔ Copy configuration files
❯ Set file permissions
✔ Copy configuration files
❯ Set file permissions
✔ Set file permissions
✔ Node: node3
✔ Set file permissions
✔ Node: node1
✔ Set file permissions
✔ Node: node2
✔ Setup network nodes
❯ Change node state to setup in remote config
✔ Change node state to setup in remote config
```

* Start the nodes

```
solo node start -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node start --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lease
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
❯ Validate nodes states
❯ Validating state for node node1
✔ Validating state for node node1 - valid state: setup
❯ Validating state for node node2
✔ Validating state for node node2 - valid state: setup
❯ Validating state for node node3
✔ Validating state for node node3 - valid state: setup
✔ Validate nodes states
❯ Identify existing network nodes
❯ Check network pod: node1
❯ Check network pod: node2
❯ Check network pod: node3
✔ Check network pod: node2
✔ Check network pod: node1
✔ Check network pod: node3
✔ Identify existing network nodes
❯ Upload state files network nodes
↓ Upload state files network nodes [SKIPPED: Upload state files network nodes]
❯ Starting nodes
❯ Start node: node1
❯ Start node: node2
❯ Start node: node3
✔ Start node: node2
✔ Start node: node3
✔ Start node: node1
✔ Starting nodes
❯ Enable port forwarding for JVM debugger
↓ Enable port forwarding for JVM debugger [SKIPPED: Enable port forwarding for JVM debugger]
❯ Check all nodes are ACTIVE
❯ Check network pod: node1 
❯ Check network pod: node2 
❯ Check network pod: node3 
✔ Check network pod: node1  - status ACTIVE, attempt: 18/300
✔ Check network pod: node2  - status ACTIVE, attempt: 19/300
✔ Check network pod: node3  - status ACTIVE, attempt: 19/300
✔ Check all nodes are ACTIVE
❯ Check node proxies are ACTIVE
❯ Check proxy for node: node1
✔ Check proxy for node: node1
❯ Check proxy for node: node2
✔ Check proxy for node: node2
❯ Check proxy for node: node3
✔ Check proxy for node: node3
✔ Check node proxies are ACTIVE
❯ Change node state to started in remote config
✔ Change node state to started in remote config
❯ Add node stakes
❯ Adding stake for node: node1
✔ Adding stake for node: node1
❯ Adding stake for node: node2
✔ Adding stake for node: node2
❯ Adding stake for node: node3
✔ Adding stake for node: node3
✔ Add node stakes
```

* Deploy mirror node

```
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: mirror-node deploy --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lease
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
❯ Enable mirror-node
❯ Prepare address book
✔ Prepare address book
❯ Deploy mirror-node
✔ Deploy mirror-node
✔ Enable mirror-node
❯ Check pods are ready
❯ Check Postgres DB
❯ Check REST API
❯ Check GRPC
❯ Check Monitor
❯ Check Importer
✔ Check Monitor
✔ Check Postgres DB
✔ Check GRPC
✔ Check Importer
✔ Check REST API
✔ Check pods are ready
❯ Seed DB data
❯ Insert data in public.file_data
✔ Insert data in public.file_data
✔ Seed DB data
❯ Add mirror node to remote config
✔ Add mirror node to remote config
```

* Deploy a JSON RPC relay

```
solo relay deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: relay deploy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lease
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
❯ Prepare chart values
✔ Prepare chart values
❯ Deploy JSON RPC Relay
✔ Deploy JSON RPC Relay
❯ Check relay is ready
✔ Check relay is ready
❯ Add relay component in remote config
✔ Add relay component in remote config
```

You may view the list of pods using `k9s` as below:

```
Context: kind-solo                                <0> all   <a>       Attach       <ctr… ____  __.________
 Cluster: kind-solo                                          <ctrl-d>  Delete       <l>  |    |/ _/   __   \______
 User:    kind-solo                                          <d>       Describe     <p>  |      < \____    /  ___/
 K9s Rev: v0.32.5                                            <e>       Edit         <shif|    |  \   /    /\___ \
 K8s Rev: v1.27.3                                            <?>       Help         <z>  |____|__ \ /____//____  >
 CPU:     n/a                                                <shift-j> Jump Owner   <s>          \/            \/
 MEM:     n/a
┌───────────────────────────────────────────────── Pods(all)[31] ─────────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                                           PF READY STATUS   RESTARTS I │
│ kube-system         coredns-5d78c9869d-994t4                                       ●  1/1   Running         0 1 │
│ kube-system         coredns-5d78c9869d-vgt4q                                       ●  1/1   Running         0 1 │
│ kube-system         etcd-solo-control-plane                                        ●  1/1   Running         0 1 │
│ kube-system         kindnet-q26c9                                                  ●  1/1   Running         0 1 │
│ kube-system         kube-apiserver-solo-control-plane                              ●  1/1   Running         0 1 │
│ kube-system         kube-controller-manager-solo-control-plane                     ●  1/1   Running         0 1 │
│ kube-system         kube-proxy-9b27j                                               ●  1/1   Running         0 1 │
│ kube-system         kube-scheduler-solo-control-plane                              ●  1/1   Running         0 1 │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-4mv8c                        ●  1/1   Running         0 1 │
│ solo                envoy-proxy-node1-65f8879dcc-rwg97                             ●  1/1   Running         0 1 │
│ solo                envoy-proxy-node2-667f848689-628cx                             ●  1/1   Running         0 1 │
│ solo                envoy-proxy-node3-6bb4b4cbdf-dmwtr                             ●  1/1   Running         0 1 │
│ solo                solo-deployment-grpc-75bb9c6c55-l7kvt                     ●  1/1   Running         0 1 │
│ solo                solo-deployment-hedera-explorer-6565ccb4cb-9dbw2          ●  1/1   Running         0 1 │
│ solo                solo-deployment-importer-dd74fd466-vs4mb                  ●  1/1   Running         0 1 │
│ solo                solo-deployment-monitor-54b8f57db9-fn5qq                  ●  1/1   Running         0 1 │
│ solo                solo-deployment-postgres-postgresql-0                     ●  1/1   Running         0 1 │
│ solo                solo-deployment-redis-node-0                              ●  2/2   Running         0 1 │
│ solo                solo-deployment-rest-6d48f8dbfc-plbp2                     ●  1/1   Running         0 1 │
│ solo                solo-deployment-restjava-5d6c4cb648-r597f                 ●  1/1   Running         0 1 │
│ solo                solo-deployment-web3-55fdfbc7f7-lzhfl                     ●  1/1   Running         0 1 │
│ solo                haproxy-node1-785b9b6f9b-676mr                                 ●  1/1   Running         1 1 │
│ solo                haproxy-node2-644b8c76d-v9mg6                                  ●  1/1   Running         1 1 │
│ solo                haproxy-node3-fbffdb64-272t2                                   ●  1/1   Running         1 1 │
│ solo                minio-pool-1-0                                                 ●  2/2   Running         1 1 │
│ solo                network-node1-0                                                ●  5/5   Running         2 1 │
│ solo                network-node2-0                                                ●  5/5   Running         2 1 │
│ solo                network-node3-0                                                ●  5/5   Running         2 1 │
│ solo                relay-node1-node2-node3-hedera-json-rpc-relay-ddd4c8d8b-hdlpb  ●  1/1   Running         0 1 │
│ solo-cluster        console-557956d575-c5qp7                                       ●  1/1   Running         0 1 │
│ solo-cluster        minio-operator-7d575c5f84-xdwwz                                ●  1/1   Running         0 1 │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

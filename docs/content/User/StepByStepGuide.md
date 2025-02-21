## Advanced User Guide

For those who would like to have more control or need some customized setups, here are some step by step instructions of how to setup and deploy a solo network.

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
Creating cluster "solo-update-readme-13426023930-1" ...
 ✓ Ensuring node image (kindest/node:v1.32.0) 🖼
 ✓ Preparing nodes 📦 
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo-update-readme-13426023930-1"
You can now use your cluster with:

kubectl cluster-info --context kind-solo-update-readme-13426023930-1

Thanks for using kind! 😊
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
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: init
**********************************************************************************
✔ Setup home directory and cache
✔ Check dependency: helm [OS: linux, Release: 5.15.0-131-generic, Arch: x64]
✔ Check dependencies
✔ Setup chart manager

***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /home/runner/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
✔ Copy templates in '/home/runner/.solo/cache'
```

* Generate `pem` formatted node keys

```
solo node keys --gossip-keys --tls-keys -i node1,node2,node3
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: node keys --gossip-keys --tls-keys --node-aliases node1,node2,node3
**********************************************************************************
✔ Initialize
✔ Backup old files
✔ Gossip key for node: node1
✔ Gossip key for node: node2
✔ Gossip key for node: node3
✔ Generate gossip keys
✔ Backup old files
✔ TLS key for node: node1
✔ TLS key for node: node2
✔ TLS key for node: node3
✔ Generate gRPC TLS Keys
✔ Finalize
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
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: deployment create --node-aliases node1,node2,node3 --namespace solo --context kind-solo-update-readme-13426023930-1 --email john@doe.com --deployment-clusters kind-solo-update-readme-13426023930-1 --deployment solo-deployment
Kubernetes Namespace	: solo
**********************************************************************************
✔ Initialize
✔ Setup home directory
✔ Prompt local configuration
✔ Add new deployment to local config
✔ Resolve context for remote cluster
✔ Validate context- validated context kind-solo-update-readme-13426023930-1
✔ Update local configuration
✔ Testing connection to cluster: kind-solo-update-readme-13426023930-1
✔ Validate cluster connections
✔ Create remote config in cluster: kind-solo-update-readme-13426023930-1
✔ Create remoteConfig in clusters
```

* Setup cluster with shared components

```
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: cluster setup --cluster-setup-namespace solo-cluster
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Install 'solo-cluster-setup' chart
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
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: network deploy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
✔ Check if cluster setup chart is installed
✔ Copy Gossip keys to staging
✔ Copy gRPC TLS keys to staging
✔ Prepare staging directory
✔ Copy Gossip keys
✔ Node: node2, cluster: kind-solo-update-readme-13426023930-1
✔ Copy Gossip keys
✔ Node: node1, cluster: kind-solo-update-readme-13426023930-1
✔ Copy TLS keys
✔ Copy Gossip keys
✔ Node: node3, cluster: kind-solo-update-readme-13426023930-1
✔ Copy node keys to secrets
✔ Install chart 'solo-deployment'
✔ Check Node: node1, Cluster: kind-solo-update-readme-13426023930-1
✔ Check Node: node2, Cluster: kind-solo-update-readme-13426023930-1
✔ Check Node: node3, Cluster: kind-solo-update-readme-13426023930-1
✔ Check node pods are running
✔ Check Envoy Proxy for: node1, cluster: kind-solo-update-readme-13426023930-1
✔ Check Envoy Proxy for: node2, cluster: kind-solo-update-readme-13426023930-1
✔ Check Envoy Proxy for: node3, cluster: kind-solo-update-readme-13426023930-1
✔ Check HAProxy for: node3, cluster: kind-solo-update-readme-13426023930-1
✔ Check HAProxy for: node2, cluster: kind-solo-update-readme-13426023930-1
✔ Check HAProxy for: node1, cluster: kind-solo-update-readme-13426023930-1
✔ Check proxy pods are running
✔ Check MinIO
✔ Check auxiliary pods are ready
✔ Add node and proxies to remote config
```

* Setup node with Hedera platform software.
  * It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
solo node setup -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: node setup --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
✔ Validating state for node node1 - valid state: requested
✔ Validating state for node node2 - valid state: requested
✔ Validating state for node node3 - valid state: requested
✔ Validate nodes states
✔ Check network pod: node3
✔ Check network pod: node1
✔ Check network pod: node2
✔ Identify network pods
✔ Update node: node1 [ platformVersion = v0.58.10, context = kind-solo-update-readme-13426023930-1 ]
✔ Update node: node3 [ platformVersion = v0.58.10, context = kind-solo-update-readme-13426023930-1 ]
✔ Update node: node2 [ platformVersion = v0.58.10, context = kind-solo-update-readme-13426023930-1 ]
✔ Fetch platform software into network nodes
✔ Copy configuration files
✔ Copy configuration files
✔ Copy configuration files
✔ Set file permissions
✔ Node: node2
✔ Set file permissions
✔ Node: node1
✔ Set file permissions
✔ Node: node3
✔ Setup network nodes
✔ Change node state to setup in remote config
```

* Start the nodes

```
solo node start -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: node start --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
✔ Validating state for node node1 - valid state: setup
✔ Validating state for node node2 - valid state: setup
✔ Validating state for node node3 - valid state: setup
✔ Validate nodes states
✔ Check network pod: node2
✔ Check network pod: node1
✔ Check network pod: node3
✔ Identify existing network nodes
✔ Start node: node2
✔ Start node: node3
✔ Start node: node1
✔ Starting nodes
✔ Check network pod: node1  - status ACTIVE, attempt: 20/300
✔ Check network pod: node3  - status ACTIVE, attempt: 20/300
✔ Check network pod: node2  - status ACTIVE, attempt: 20/300
✔ Check all nodes are ACTIVE
✔ Check proxy for node: node1
✔ Check proxy for node: node2
✔ Check proxy for node: node3
✔ Check node proxies are ACTIVE
✔ Change node state to started in remote config
✔ Adding stake for node: node1
✔ Adding stake for node: node2
✔ Adding stake for node: node3
✔ Add node stakes
```

* Deploy mirror node

```
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: mirror-node deploy --deployment solo-deployment
**********************************************************************************
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
✔ Prepare address book
✔ Deploy mirror-node
✔ Enable mirror-node
✔ Check Postgres DB
✔ Check GRPC
✔ Check Importer
✔ Check Monitor
✔ Check REST API
✔ Check pods are ready
✔ Insert data in public.file_data
✔ Seed DB data
✔ Add mirror node to remote config
```

* Deploy a JSON RPC relay

```
solo relay deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.35.0
Kubernetes Context	: kind-solo-update-readme-13426023930-1
Kubernetes Cluster	: kind-solo-update-readme-13426023930-1
Current Command		: relay deploy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
✔ Acquire lease - lease acquired successfully, attempt: 1/10
✔ Initialize
✔ Prepare chart values
✔ Deploy JSON RPC Relay
✔ Check relay is ready
✔ Add relay component in remote config
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

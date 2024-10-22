# Solo

[![NPM Version](https://img.shields.io/npm/v/%40hashgraph%2Fsolo?logo=npm)](https://www.npmjs.com/package/@hashgraph/solo)
[![GitHub License](https://img.shields.io/github/license/hashgraph/solo?logo=apache\&logoColor=red)](LICENSE)
![node-lts](https://img.shields.io/node/v-lts/%40hashgraph%2Fsolo)
[![Build Application](https://github.com/hashgraph/solo/actions/workflows/flow-build-application.yaml/badge.svg)](https://github.com/hashgraph/solo/actions/workflows/flow-build-application.yaml)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/83a423a3a1c942459127b3aec62ab0b5)](https://app.codacy.com/gh/hashgraph/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_grade)
[![codecov](https://codecov.io/gh/hashgraph/solo/graph/badge.svg?token=hBkQdB1XO5)](https://codecov.io/gh/hashgraph/solo)

An opinionated CLI tool to deploy and manage standalone test networks.

## Table of Contents

* [Requirements](#requirements)
* [Setup](#setup)
* [Install Solo](#install-solo)
* [Setup Kubernetes cluster](#setup-kubernetes-cluster)
* [Generate Node Keys](#generate-node-keys)
  * [Standard keys (.pem file)](#standard-keys-pem-file)
* [Examples](#examples)
  * [Example - 1: Deploy a standalone test network (version `0.54.0-alpha.4`)](#example---1-deploy-a-standalone-test-network-version-0540-alpha4)
* [Support](#support)
* [Contributing](#contributing)
* [Code of Conduct](#code-of-conduct)
* [License](#license)

## Requirements

| Solo Version | Node.js                   | Kind       | Solo Chart | Hedera   | Kubernetes | Kubectl    | Helm    | k9s        | Docker Resources        | Java         |
|--------------|---------------------------|------------|-----------|----------|------------|------------|---------|------------|-------------------------|--------------|
| 0.29.0       | >= 20.14.0 (lts/hydrogen) | >= v1.29.1 | v0.30.0   | v0.53.0+ | >= v1.27.3 | >= v1.27.3 | v3.14.2 | >= v0.27.4 | Memory >= 8GB, CPU >= 4 | >= 21.0.1+12 |
| 0.30.0       | >= 20.14.0 (lts/hydrogen) | >= v1.29.1 | v0.30.0   | v0.54.0+ | >= v1.27.3 | >= v1.27.3 | v3.14.2 | >= v0.27.4 | Memory >= 8GB, CPU >= 4 | >= 21.0.1+12 |

## Setup

* Install [Node](https://nodejs.org/en/download). You may also use [nvm](https://github.com/nvm-sh/nvm) to manage different Node versions locally:

```
nvm install lts/hydrogen
nvm use lts/hydrogen
```

* Useful tools:
  * Install [kubectl](https://kubernetes.io/docs/tasks/tools/)
  * Install [k9s](https://k9scli.io/)

## Install Solo

* Run `npm install -g @hashgraph/solo`

## Setup Kubernetes cluster

### Remote cluster

* You may use remote kubernetes cluster. In this case, ensure kubernetes context is set up correctly.

```
kubectl config use-context <context-name>
```

### Local cluster

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
Creating cluster "solo" ...
 • Ensuring node image (kindest/node:v1.27.3) 🖼  ...
 ✓ Ensuring node image (kindest/node:v1.27.3) 🖼
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
Set kubectl context to "kind-solo"
You can now use your cluster with:

kubectl cluster-info --context kind-solo

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

## Examples

### Example - 1: Deploy a standalone test network (version `0.54.0-alpha.4`)

* Initialize `solo` directories:

```
# reset .solo directory
rm -rf ~/.solo

solo init"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: undefined
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
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: undefined
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
❯ Generate gRPC TLS keys
❯ Backup old files
❯ TLS key for node: node1
❯ TLS key for node: node2
❯ TLS key for node: node3
✔ Backup old files
✔ TLS key for node: node3
✔ TLS key for node: node2
✔ TLS key for node: node1
✔ Generate gRPC TLS keys
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
* Setup cluster with shared components

```
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: undefined
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
  * It may take a while (5~15 minutes depending on your internet speed) to download various docker images and get the pods started.
  * If it fails, ensure you have enough resources allocated for Docker engine and retry the command.

```
solo network deploy -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Prepare staging directory
❯ Copy Gossip keys to staging
✔ Copy Gossip keys to staging
❯ Copy gRPC TLS keys to staging
✔ Copy gRPC TLS keys to staging
✔ Prepare staging directory
❯ Copy node keys to secrets
❯ Copy TLS keys
❯ Node: node1
❯ Node: node2
❯ Node: node3
❯ Copy Gossip keys
❯ Copy Gossip keys
❯ Copy Gossip keys
✔ Copy Gossip keys
✔ Node: node3
✔ Copy Gossip keys
✔ Node: node2
✔ Copy Gossip keys
✔ Node: node1
✔ Copy TLS keys
✔ Copy node keys to secrets
❯ Install chart 'solo-deployment'
✔ Install chart 'solo-deployment'
❯ Check node pods are running
❯ Check Node: node1
✔ Check Node: node1
❯ Check Node: node2
✔ Check Node: node2
❯ Check Node: node3
✔ Check Node: node3
✔ Check node pods are running
❯ Check proxy pods are running
❯ Check HAProxy for: node1
❯ Check HAProxy for: node2
❯ Check HAProxy for: node3
❯ Check Envoy Proxy for: node1
❯ Check Envoy Proxy for: node2
❯ Check Envoy Proxy for: node3
✔ Check Envoy Proxy for: node2
✔ Check Envoy Proxy for: node1
✔ Check Envoy Proxy for: node3
✔ Check HAProxy for: node1
✔ Check HAProxy for: node3
✔ Check HAProxy for: node2
✔ Check proxy pods are running
❯ Check auxiliary pods are ready
❯ Check MinIO
✔ Check MinIO
✔ Check auxiliary pods are ready
```

* Setup node with Hedera platform software.
  * It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Identify network pods
❯ Check network pod: node1
❯ Check network pod: node2
❯ Check network pod: node3
✔ Check network pod: node1
✔ Check network pod: node2
✔ Check network pod: node3
✔ Identify network pods
❯ Fetch platform software into network nodes
❯ Update node: node1 [ platformVersion = v0.54.0-alpha.4 ]
❯ Update node: node2 [ platformVersion = v0.54.0-alpha.4 ]
❯ Update node: node3 [ platformVersion = v0.54.0-alpha.4 ]
✔ Update node: node3 [ platformVersion = v0.54.0-alpha.4 ]
✔ Update node: node2 [ platformVersion = v0.54.0-alpha.4 ]
✔ Update node: node1 [ platformVersion = v0.54.0-alpha.4 ]
✔ Fetch platform software into network nodes
❯ Setup network nodes
❯ Node: node1
❯ Node: node2
❯ Node: node3
❯ Set file permissions
❯ Set file permissions
❯ Set file permissions
✔ Set file permissions
✔ Node: node3
✔ Set file permissions
✔ Node: node1
✔ Set file permissions
✔ Node: node2
✔ Setup network nodes
```

* Start the nodes

```
solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Identify existing network nodes
❯ Check network pod: node1
❯ Check network pod: node2
❯ Check network pod: node3
✔ Check network pod: node1
✔ Check network pod: node3
✔ Check network pod: node2
✔ Identify existing network nodes
❯ Starting nodes
❯ Start node: node1
❯ Start node: node2
❯ Start node: node3
✔ Start node: node1
✔ Start node: node2
✔ Start node: node3
✔ Starting nodes
❯ Enable port forwarding for JVM debugger
↓ Enable port forwarding for JVM debugger [SKIPPED: Enable port forwarding for JVM debugger]
❯ Check nodes are ACTIVE
❯ Check network pod: node1 
❯ Check network pod: node2 
❯ Check network pod: node3 
✔ Check network pod: node1  - status ACTIVE, attempt: 17/120
✔ Check network pod: node2  - status ACTIVE, attempt: 17/120
✔ Check network pod: node3  - status ACTIVE, attempt: 17/120
✔ Check nodes are ACTIVE
❯ Check node proxies are ACTIVE
❯ Check proxy for node: node1
✔ Check proxy for node: node1
❯ Check proxy for node: node2
✔ Check proxy for node: node2
❯ Check proxy for node: node3
✔ Check proxy for node: node3
✔ Check node proxies are ACTIVE
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
solo mirror-node deploy -n "${SOLO_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
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
❯ Check Hedera Explorer
✔ Check Hedera Explorer
✔ Check Postgres DB
✔ Check Monitor
✔ Check GRPC
✔ Check Importer
✔ Check REST API
✔ Check pods are ready
❯ Seed DB data
❯ Insert data in public.file_data
✔ Insert data in public.file_data
✔ Seed DB data
```

* Deploy a JSON RPC relay

```
solo relay deploy -i node1 -n "${SOLO_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Prepare chart values
✔ Prepare chart values
❯ Deploy JSON RPC Relay
✔ Deploy JSON RPC Relay
❯ Check relay is ready
✔ Check relay is ready
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
  <pod>
```

#### Access Hedera Network services

Once the nodes are up, you may now expose various services (using `k9s` (shift-f) or `kubectl port-forward`) and access. Below are most used services that you may expose.

* Node services: `network-<node ID>-svc`
* HAProxy: `haproxy-<node ID>-svc`
  ```bash
  # enable portforwarding for haproxy
  # node1 grpc port accessed by localhost:50211
  kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 &
  # node2 grpc port accessed by localhost:51211
  kubectl port-forward svc/haproxy-node2-svc -n "${SOLO_NAMESPACE}" 51211:50211 &
  # node3 grpc port accessed by localhost:52211
  kubectl port-forward svc/haproxy-node3-svc -n "${SOLO_NAMESPACE}" 52211:50211 &
  ```
* Envoy Proxy: `envoy-proxy-<node ID>-svc`
  ```bash
  # enable portforwarding for envoy proxy
  kubectl port-forward svc/envoy-proxy-node1-svc -n "${SOLO_NAMESPACE}" 8181:8080 &
  kubectl port-forward svc/envoy-proxy-node2-svc -n "${SOLO_NAMESPACE}" 8281:8080 &
  kubectl port-forward svc/envoy-proxy-node3-svc -n "${SOLO_NAMESPACE}" 8381:8080 &
  ```
* Hedera explorer: `solo-deployment-hedera-explorer`
  ```bash
  #enable portforwarding for hedera explorer, can be access at http://localhost:8080/
  kubectl port-forward svc/solo-deployment-hedera-explorer -n "${SOLO_NAMESPACE}" 8080:80 &
  ```
* JSON Rpc Relays
  * You can deploy JSON RPC relays for one or more nodes as below:
  ```bash
  solo relay deploy -i node1
  # enable relay for node1
  kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 &
  ```

Example output

```

******************************* Solo *********************************************
Version			: 0.31.1
Kubernetes Context	: kind-solo
Kubernetes Cluster	: kind-solo
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Prepare chart values
✔ Prepare chart values
❯ Deploy JSON RPC Relay
✔ Deploy JSON RPC Relay
❯ Check relay is ready
✔ Check relay is ready
```

## For Developers Working on Hedera Service Repo

First, please clone hedera service repo `https://github.com/hashgraph/hedera-services/` and build the code
with `./gradlew assemble`. If need to running nodes with different versions or releases, please duplicate the repo or build directories in
multiple directories, checkout to the respective version and build the code.

To set customized `settings.txt` file, edit the file
`~/.solo/cache/templates/settings.txt` after `solo init` command.

Then you can start customized built hedera network with the following command:
```
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path <default path to hedera repo>,node1=<custom build hedera repo>,node2=<custom build repo>

# example: solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path node1=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data,node3=../hedera-services/hedera-node/data
```

## For Developers Working on Platform core

To deploy node with local build PTT jar files, run the following command:
```
solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path <default path to hedera repo>,node1=<custom build hedera repo>,node2=<custom build repo> --app PlatformTestingTool.jar --app-config <path-to-test-json1,path-to-test-json2>

# example: solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --local-build-path ../hedera-services/platform-sdk/sdk/data,node1=../hedera-services/platform-sdk/sdk/data,node2=../hedera-services/platform-sdk/sdk/data --app PlatformTestingTool.jar --app-config ../hedera-services/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json
```
## Logs
You can find log for running solo command under the directory `~/.solo/logs/`
The file `solo.log` contains the logs for the solo command.
The file `hashgraph-sdk.log` contains the logs from Solo client when sending transactions to network nodes.

## Using IntelliJ remote debug with Solo

NOTE: the hedera-services path referenced '../hedera-services/hedera-node/data' may need to be updated based on what directory you are currently in.  This also assumes that you have done an assemble/build and the directory contents are up-to-date.

Example 1: attach jvm debugger to a hedera node
```bash
./test/e2e/setup-e2e.sh
solo node keys --gossip-keys --tls-keys -i node1,node2,node3
solo network deploy -i node1,node2,node3 --debug-node-alias node2 -n "${SOLO_NAMESPACE}"
solo node setup -i node1,node2,node3 --local-build-path ../hedera-services/hedera-node/data -n "${SOLO_NAMESPACE}"
solo node start -i node1,node2,node3 --debug-node-alias node2 -n "${SOLO_NAMESPACE}"
```

Once you see the following message, you can launch jvm debugger from Intellij

```
❯ Check all nodes are ACTIVE
  Check node: node1,
  Check node: node3,  Please attach JVM debugger now.
  Check node: node4,
```

Example 2: attach jvm debugger with node add operation

```bash
./test/e2e/setup-e2e.sh
solo node keys --gossip-keys --tls-keys -i node1,node2,node3
solo network deploy -i node1,node2,node3 --pvcs -n "${SOLO_NAMESPACE}"
solo node setup -i node1,node2,node3 --local-build-path ../hedera-services/hedera-node/data -n "${SOLO_NAMESPACE}"
solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
solo node add --gossip-keys --tls-keys --node-alias node4 --debug-node-alias node4 --local-build-path ../hedera-services/hedera-node/data -n "${SOLO_NAMESPACE}"
```

Example 3: attach jvm debugger with node update operation

```bash
./test/e2e/setup-e2e.sh
solo node keys --gossip-keys --tls-keys -i node1,node2,node3
solo network deploy -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
solo node setup -i node1,node2,node3 --local-build-path ../hedera-services/hedera-node/data -n "${SOLO_NAMESPACE}"
solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}"
solo node update --node-alias node2  --debug-node-alias node2 --local-build-path ../hedera-services/hedera-node/data --new-account-number 0.0.7 --gossip-public-key ./s-public-node2.pem --gossip-private-key ./s-private-node2.pem --agreement-public-key ./a-public-node2.pem --agreement-private-key ./a-private-node2.pem  -n "${SOLO_NAMESPACE}"
```

Example 4: attach jvm debugger with node delete operation

```bash
./test/e2e/setup-e2e.sh
solo node keys --gossip-keys --tls-keys -i node1,node2,node3
solo network deploy -i node1,node2,node3,node4 -n "${SOLO_NAMESPACE}"
solo node setup -i node1,node2,node3,node4 --local-build-path ../hedera-services/hedera-node/data -n "${SOLO_NAMESPACE}"
solo node start -i node1,node2,node3,node4 -n "${SOLO_NAMESPACE}"
solo node delete --node-alias node2  --debug-node-alias node3 -n "${SOLO_NAMESPACE}"
```

## Support

If you have a question on how to use the product, please see our [support guide](https://github.com/hashgraph/.github/blob/main/SUPPORT.md).

## Contributing

Contributions are welcome. Please see the [contributing guide](https://github.com/hashgraph/.github/blob/main/CONTRIBUTING.md) to see how you can get involved.

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](https://github.com/hashgraph/.github/blob/main/CODE_OF_CONDUCT.md). By participating, you are
expected to uphold this code of conduct.

## License

[Apache License 2.0](LICENSE)

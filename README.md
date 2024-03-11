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
  * [Legacy keys (.pfx file)](#legacy-keys-pfx-file)
  * [Standard keys (.pem file)](#standard-keys-pem-file)
* [Examples](#examples)
  * [Example - 1: Deploy a standalone test network (version `0.42.5`)](#example---1-deploy-a-standalone-test-network-version-0425)
  * [Example - 2: Deploy a standalone test network (version `0.47.0-alpha.0`)](#example---2-deploy-a-standalone-test-network-version-0470-alpha0)
* [Support](#support)
* [Contributing](#contributing)
* [Code of Conduct](#code-of-conduct)
* [License](#license)

## Requirements

* Node(>=18.19.0) (*lts/hydrogen*)

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

```
kind create cluster -n "${SOLO_CLUSTER_NAME}"
Creating cluster "solo" ...
 ✓ Ensuring node image (kindest/node:v1.27.3) 🖼
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo"
You can now use your cluster with:

kubectl cluster-info --context kind-solo

Have a nice day! 👋
```

You may now view pods in your cluster using `k9s -A` as below:

```
 Context: kind-solo                                <0> all       <a>      Attac… ____  __.________
 Cluster: kind-solo                                <1> default   <ctrl-d> Delete|    |/ _/   __   \______
 User:    kind-solo                                              <d>      Descri|      < \____    /  ___/
 K9s Rev: v0.27.4 ⚡️v0.32.3                                      <e>      Edit  |    |  \   /    /\___ \
 K8s Rev: v1.27.3                                                <?>      Help  |____|__ \ /____//____  >
 CPU:     n/a                                                    <ctrl-k> Kill          \/            \/
 MEM:     n/a
┌───────────────────────────────────────────── Pods(all)[9] ─────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                        PF READY RESTARTS STATUS   IP          │
│ kube-system         coredns-5d78c9869d-kc27p                    ●  1/1          0 Running  10.244.0.4  │
│ kube-system         coredns-5d78c9869d-r8mzz                    ●  1/1          0 Running  10.244.0.3  │
│ kube-system         etcd-solo-control-plane                     ●  1/1          0 Running  172.18.0.2  │
│ kube-system         kindnet-gppbk                               ●  1/1          0 Running  172.18.0.2  │
│ kube-system         kube-apiserver-solo-control-plane           ●  1/1          0 Running  172.18.0.2  │
│ kube-system         kube-controller-manager-solo-control-plane  ●  1/1          0 Running  172.18.0.2  │
│ kube-system         kube-proxy-wb9w5                            ●  1/1          0 Running  172.18.0.2  │
│ kube-system         kube-scheduler-solo-control-plane           ●  1/1          0 Running  172.18.0.2  │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-5vh5d     ●  1/1          0 Running  10.244.0.2  │
│                                                                                                        │
│ 
```

## Examples

### Example - 1: Deploy a standalone test network (version `0.42.5`)

* Initialize `solo` with tag `v0.42.5` and list of node names `node0,node1,node2`:

```
$ solo init -t v0.42.5 -i node0,node1,node2 -n "${SOLO_NAMESPACE}" -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --key-format pfx 

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Setup home directory and cache
✔ Check dependencies [17s]
  ✔ Check dependency: helm [OS: darwin, Release: 22.6.0, Arch: arm64] [7s]
  ✔ Check dependency: keytool [OS: darwin, Release: 22.6.0, Arch: arm64] [17s]
✔ Setup chart manager [1s]
✔ Copy configuration file templates


***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /Users/leninmehedy/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************

```

* Generate `pfx` formatted node keys

We need to generate `pfx` keys as `pem` key files are only supported by Hedera platform >=`0.47.0-alpha.0`.

```
$ solo node keys --gossip-keys --tls-keys --key-format pfx 

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize
✔ Generate gossip keys
✔ Generate gRPC TLS keys
✔ Finalize

$ ls ~/.solo/cache/keys 

hedera-node0.crt  hedera-node1.crt  hedera-node2.crt  private-node0.pfx private-node2.pfx
hedera-node0.key  hedera-node1.key  hedera-node2.key  private-node1.pfx public.pfx
```

* Setup cluster with shared components
  * In a separate terminal, you may run `k9s` to view the pod status.

```
$ solo cluster setup

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Install 'fullstack-cluster-setup' chart [1s]

```

* Deploy helm chart with Hedera network components
  * It may take a while (5~15 minutes depending on your internet speed) to download various docker images and get the pods started.
  * If it fails, ensure you have enough resources allocated for Docker engine and retry the command.

```
$ solo network deploy

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize
✔ Install chart 'fullstack-deployment' [1s]
✔ Waiting for network pods to be ready [2m38s]
  ✔ Node: node0 (Pod: network-node0-0) [2m38s]
  ✔ Node: node1 (Pod: network-node1-0)
  ✔ Node: node2 (Pod: network-node2-0)

```

* Setup node with Hedera platform software.
  * It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
$ solo node setup

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize
✔ Identify network pods
  ✔ Check network pod: node0
  ✔ Check network pod: node1
  ✔ Check network pod: node2
↓ Generate Gossip keys
↓ Generate gRPC TLS keys
✔ Prepare staging directory
  ✔ Copy configuration files
  ✔ Copy Gossip keys to staging
  ✔ Copy gRPC TLS keys to staging
  ✔ Prepare config.txt for the network
✔ Fetch platform software into network nodes [1m7s]
  ✔ Node: node0 [48s]
  ✔ Node: node1 [44s]
  ✔ Node: node2 [1m7s]
✔ Setup network nodes [1s]
  ✔ Node: node0 [1s]
    ✔ Copy Gossip keys [0.2s]
    ✔ Copy TLS keys [0.2s]
    ✔ Copy configuration files [0.7s]
    ✔ Set file permissions [0.1s]
  ✔ Node: node1 [1s]
    ✔ Copy Gossip keys [0.2s]
    ✔ Copy TLS keys [0.2s]
    ✔ Copy configuration files [0.7s]
    ✔ Set file permissions
  ✔ Node: node2 [1s]
    ✔ Copy Gossip keys [0.2s]
    ✔ Copy TLS keys [0.2s]
    ✔ Copy configuration files [0.7s]
    ✔ Set file permissions [0.1s]
✔ Finalize

```

* Start the nodes.

```
$ solo node start

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize [0.8s]
✔ Identify network pods
  ✔ Check network pod: node0
  ✔ Check network pod: node1
  ✔ Check network pod: node2
✔ Starting nodes [0.1s]
  ✔ Start node: node0 [0.1s]
  ✔ Start node: node1 [0.1s]
  ✔ Start node: node2 [0.1s]
✔ Check nodes are ACTIVE [24s]
  ✔ Check node: node0 [24s]
  ✔ Check node: node1 [0.1s]
  ✔ Check node: node2 [0.1s]
✔ Enable mirror node [33s]
  ✔ Check node proxies are ACTIVE [7s]
    ✔ Check proxy for node: node0 [2s]
    ✔ Check proxy for node: node1 [1s]
    ✔ Check proxy for node: node2 [4s]
  ✔ Prepare address book [0.2s]
  ✔ Deploy mirror node [3s]
  ✔ Waiting for Hedera Explorer to be ready [22s]
✔ Update special account keys [54s]
  ✔ Prepare for account key updates
  ✔ Update special account key sets [54s]
    ✔ Updating set 1 of 30 [0.7s]
    ✔ Updating set 2 of 30 [2s]
    ✔ Updating set 3 of 30 [1s]
    ✔ Updating set 4 of 30 [2s]
    ✔ Updating set 5 of 30 [1s]
    ✔ Updating set 6 of 30 [1s]
    ✔ Updating set 7 of 30 [2s]
    ✔ Updating set 8 of 30 [1s]
    ✔ Updating set 9 of 30 [1s]
    ✔ Updating set 10 of 30 [1s]
    ✔ Updating set 11 of 30 [1s]
    ✔ Updating set 12 of 30 [1s]
    ✔ Updating set 13 of 30 [1s]
    ✔ Updating set 14 of 30 [2s]
    ✔ Updating set 15 of 30 [2s]
    ✔ Updating set 16 of 30 [1s]
    ✔ Updating set 17 of 30 [1s]
    ✔ Updating set 18 of 30 [1s]
    ✔ Updating set 19 of 30 [4s]
    ✔ Updating set 20 of 30 [1s]
    ✔ Updating set 21 of 30 [1s]
    ✔ Updating set 22 of 30 [1s]
    ✔ Updating set 23 of 30 [1s]
    ✔ Updating set 24 of 30 [1s]
    ✔ Updating set 25 of 30 [1s]
    ✔ Updating set 26 of 30 [1s]
    ✔ Updating set 27 of 30 [2s]
    ✔ Updating set 28 of 30 [1s]
    ✔ Updating set 29 of 30 [1s]
    ✔ Updating set 30 of 30 [0.5s]
  ✔ Display results

> upgrading chart: fullstack-deployment
OK chart 'fullstack-deployment' is upgraded
Account keys updated SUCCESSFULLY: 701
```

You may view the list of pods using `k9s` as below:

```
 Context: kind-solo                                <0> all       <a>      Attac… ____  __.________
 Cluster: kind-solo                                <1> default   <ctrl-d> Delete|    |/ _/   __   \______
 User:    kind-solo                                              <d>      Descri|      < \____    /  ___/
 K9s Rev: v0.27.4 ⚡️v0.32.3                                      <e>      Edit  |    |  \   /    /\___ \
 K8s Rev: v1.27.3                                                <?>      Help  |____|__ \ /____//____  >
 CPU:     n/a                                                    <ctrl-k> Kill          \/            \/
 MEM:     n/a
┌──────────────────────────────────────────── Pods(all)[27] ─────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                                   PF READY RESTARTS STATUS    │
│ kube-system         coredns-5d78c9869d-kc27p                               ●  1/1          0 Running   │
│ kube-system         coredns-5d78c9869d-r8mzz                               ●  1/1          0 Running   │
│ kube-system         etcd-solo-control-plane                                ●  1/1          0 Running   │
│ kube-system         kindnet-gppbk                                          ●  1/1          0 Running   │
│ kube-system         kube-apiserver-solo-control-plane                      ●  1/1          0 Running   │
│ kube-system         kube-controller-manager-solo-control-plane             ●  1/1          0 Running   │
│ kube-system         kube-proxy-wb9w5                                       ●  1/1          0 Running   │
│ kube-system         kube-scheduler-solo-control-plane                      ●  1/1          0 Running   │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-5vh5d                ●  1/1          0 Running   │
│ solo                envoy-proxy-node0-84947f844f-5j4fc                     ●  1/1          0 Running   │
│ solo                envoy-proxy-node1-65f8879dcc-ztmnw                     ●  1/1          0 Running   │
│ solo                envoy-proxy-node2-667f848689-bj849                     ●  1/1          0 Running   │
│ solo                fullstack-deployment-grpc-69f9cc5666-744mm             ●  1/1          0 Running   │
│ solo                fullstack-deployment-hedera-explorer-79f79b7df4-w2bl4  ●  1/1          0 Running   │
│ solo                fullstack-deployment-importer-65bb89757f-vqg2l         ●  1/1          0 Running   │
│ solo                fullstack-deployment-postgres-postgresql-0             ●  1/1          0 Running   │
│ solo                fullstack-deployment-rest-584f5cb6bb-v7gvj             ●  1/1          0 Running   │
│ solo                fullstack-deployment-web3-69dcdfc4fb-rxzsc             ●  1/1          0 Running   │
│ solo                haproxy-node0-96f8df6d-dcv88                           ●  1/1          0 Running   │
│ solo                haproxy-node1-845fb68f48-z492b                         ●  1/1          0 Running   │
│ solo                haproxy-node2-867656ff6-npgjc                          ●  1/1          0 Running   │
│ solo                minio-pool-1-0                                         ●  2/2          1 Running   │
│ solo                network-node0-0                                        ●  5/5          0 Running   │
│ solo                network-node1-0                                        ●  5/5          0 Running   │
│ solo                network-node2-0                                        ●  5/5          0 Running   │
│ solo-cluster        console-557956d575-pdkqw                               ●  1/1          0 Running   │
│ solo-cluster        minio-operator-7d575c5f84-8pjmf                        ●  1/1          0 Running   │
```

#### Access Hedera Network services

Once the nodes are up, you may now expose various services (using `k9s` (shift-f) or `kubectl port-forward`) and access. Below are most used services that you may expose.

* Node services: `network-<node ID>-svc`
* HAProxy: `haproxy-<node ID>-svc`
* Envoy Proxy: `envoy-proxy-<node ID>-svc`
* Hedera explorer: `fullstack-deployment-hedera-explorer`

```
Context: kind-solo                                <0> all       <ctrl-l> Bench Run/Stop   <p>       Logs Previous                                                                           ____  __.________
 Cluster: kind-solo                                <1> default   <ctrl-d> Delete           <shift-f> Port-Forward                                                                           |    |/ _/   __   \______
 User:    kind-solo                                              <d>      Describe         <y>       YAML                                                                                   |      < \____    /  ___/
 K9s Rev: v0.27.4 ⚡️v0.32.3                                      <e>      Edit                                                                                                              |    |  \   /    /\___ \
 K8s Rev: v1.27.3                                                <?>      Help                                                                                                              |____|__ \ /____//____  >
 CPU:     n/a                                                    <l>      Logs                                                                                                                      \/            \/
 MEM:     n/a
┌──────────────────────────────────────────────────────────────────────────────────────────────── Services(all)[24] ─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAMESPACE↑    NAME                                               TYPE           CLUSTER-IP      EXTERNAL-IP  PORTS                                                                                        AGE      │
│ default       kubernetes                                         ClusterIP      10.96.0.1                    https:443►0                                                                                  58m      │
│ kube-system   kube-dns                                           ClusterIP      10.96.0.10                   dns:53►0╱UDP dns-tcp:53►0 metrics:9153►0                                                     58m      │
│ solo          envoy-proxy-node0-svc                              ClusterIP      10.96.108.35                 hedera-grpc-web:8080►0 prometheus:9090►0                                                     5m43s    │
│ solo          envoy-proxy-node1-svc                              ClusterIP      10.96.28.255                 hedera-grpc-web:8080►0 prometheus:9090►0                                                     5m43s    │
│ solo          envoy-proxy-node2-svc                              ClusterIP      10.96.114.202                hedera-grpc-web:8080►0 prometheus:9090►0                                                     5m43s    │
│ solo          fullstack-deployment-grpc                          ClusterIP      10.96.189.209                grpc:5600►0 http:80►0                                                                        3m37s    │
│ solo          fullstack-deployment-hedera-explorer               ClusterIP      10.96.169.9                  http:80►0                                                                                    3m37s    │
│ solo          fullstack-deployment-postgres-pgpool               ClusterIP      10.96.189.235                postgresql:5432►0                                                                            3m37s    │
│ solo          fullstack-deployment-postgres-postgresql           ClusterIP      10.96.92.24                  postgresql:5432►0                                                                            3m37s    │
│ solo          fullstack-deployment-postgres-postgresql-headless  ClusterIP                                   postgresql:5432►0                                                                            3m37s    │
│ solo          fullstack-deployment-rest                          ClusterIP      10.96.247.93                 http:80►0                                                                                    3m37s    │
│ solo          fullstack-deployment-web3                          ClusterIP      10.96.254.144                http:80►0                                                                                    3m37s    │
│ solo          haproxy-node0-svc                                  LoadBalancer   10.96.245.12    <pending>    non-tls-grpc-client-port:50211►31715 tls-grpc-client-port:50212►31619 prometheus:9090►30237  5m43s    │
│ solo          haproxy-node1-svc                                  LoadBalancer   10.96.132.20    <pending>    non-tls-grpc-client-port:50211►30805 tls-grpc-client-port:50212►30238 prometheus:9090►30936  5m43s    │
│ solo          haproxy-node2-svc                                  LoadBalancer   10.96.171.41    <pending>    non-tls-grpc-client-port:50211►32476 tls-grpc-client-port:50212►31387 prometheus:9090►30776  5m43s    │
│ solo          minio                                              ClusterIP      10.96.65.174                 http-minio:80►0                                                                              5m38s    │
│ solo          minio-console                                      ClusterIP      10.96.211.100                http-console:9090►0                                                                          5m38s    │
│ solo          minio-hl                                           ClusterIP                                   http-minio:9000►0                                                                            5m38s    │
│ solo          network-node0-svc                                  ClusterIP      10.96.141.1                  gossip:50111►0 grpc-non-tls:50211►0 grpc-tls:50212►0 prometheus:9090►0                       5m43s    │
│ solo          network-node1-svc                                  ClusterIP      10.96.92.144                 gossip:50111►0 grpc-non-tls:50211►0 grpc-tls:50212►0 prometheus:9090►0                       5m43s    │
│ solo          network-node2-svc                                  ClusterIP      10.96.140.243                gossip:50111►0 grpc-non-tls:50211►0 grpc-tls:50212►0 prometheus:9090►0                       5m43s    │
│ solo-cluster  console                                            ClusterIP      10.96.31.144                 http:9090►0 https:9443►0                                                                     54m      │
│ solo-cluster  operator                                           ClusterIP      10.96.212.116                http:4221►0                                                                                  54m      │
│ solo-cluster  sts                                                ClusterIP      10.96.108.130                https:4223►0                                                                                 54m      │
│ 
```

### Example - 2: Deploy a standalone test network (version `0.47.0-alpha.0`)

* Initialize `solo` with tag `v0.47.0-alpha.0` and list of node names `node0,node1,node2`:

```
# reset .solo directory
$ rm -rf ~/.solo 

$ solo init -t v0.47.0-alpha.0 -i node0,node1,node2 -n "${SOLO_NAMESPACE}" -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --key-format pem 

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Setup home directory and cache
✔ Check dependencies [19s]
  ✔ Check dependency: helm [OS: darwin, Release: 22.6.0, Arch: arm64] [8s]
  ✔ Check dependency: keytool [OS: darwin, Release: 22.6.0, Arch: arm64] [19s]
✔ Setup chart manager [2s]
✔ Copy configuration file templates


***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /Users/leninmehedy/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
```

* Generate `pem` formatted node keys

```
$ solo node keys --gossip-keys --tls-keys --key-format pem

******************************* Solo *********************************************
Version                 : 0.22.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize
✔ Generate gossip keys
✔ Generate gRPC TLS keys
✔ Finalize

$ ls ~/.solo/cache/keys  
a-private-node0.pem a-public-node1.pem  hedera-node1.crt    s-private-node0.pem s-public-node1.pem
a-private-node1.pem a-public-node2.pem  hedera-node1.key    s-private-node1.pem s-public-node2.pem
a-private-node2.pem hedera-node0.crt    hedera-node2.crt    s-private-node2.pem
a-public-node0.pem  hedera-node0.key    hedera-node2.key    s-public-node0.pem

```

* Setup cluster with shared components

```
$ solo cluster setup

# output is similar to example-1 
```

In a separate terminal, you may run `k9s` to view the pod status.

* Deploy helm chart with Hedera network components

```
$ solo network deploy

# output is similar to example-1 
```

* Setup node with Hedera platform.
  * It may take a while (~10 minutes depending on your internet speed) to download various docker images and get the
    pods started.

```
$ solo node setup

# output is similar to example-1 
```

* Start the nodes

```
$ solo node start

# output is similar to example-1 
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

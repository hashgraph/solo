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
Version                 : 0.22.1
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
Version                 : 0.22.1
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
Version                 : 0.22.1
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
Version                 : 0.22.1
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize [5s]
✔ Install chart 'fullstack-deployment' [19s]
✔ Check node pods are ready [2s]
  ✔ Check Node: node0 [0.8s]
  ✔ Check Node: node1 [1s]
  ✔ Check Node: node2 [0.9s]
✔ Check proxy pods are ready [0.7s]
  ✔ Check HAProxy for: node0 [0.7s]
  ✔ Check HAProxy for: node1 [0.7s]
  ✔ Check HAProxy for: node2 [0.7s]
  ✔ Check Envoy Proxy for: node0 [0.7s]
  ✔ Check Envoy Proxy for: node1 [0.7s]
  ✔ Check Envoy Proxy for: node2 [0.7s]
✔ Check auxiliary pods are ready [5s]
  ✔ Check MinIO [5s]
```

* Setup node with Hedera platform software.
  * It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
$ solo node setup

******************************* Solo *********************************************
Version                 : 0.22.1
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
  ✔ Update node: node0 [48s]
  ✔ Update node: node1 [44s]
  ✔ Update node: node2 [1m7s]
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
Version                 : 0.22.1
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize [0.1s]
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
✔ Check node proxies are ACTIVE [0.1s]
  ✔ Check proxy for node: node0
  ✔ Check proxy for node: node1
  ✔ Check proxy for node: node2
```

* Deploy mirror node

```
$ solo mirror-node deploy
******************************* Solo *********************************************
Version                 : 0.22.1
Kubernetes Context      : kind-solo-e2e
Kubernetes Cluster      : kind-solo-e2e
Kubernetes Namespace    : solo
**********************************************************************************
✔ Initialize [7s]
✔ Enable mirror-node [1m10s]
  ✔ Prepare address book [1s]
  ✔ Deploy mirror-node [1m9s]
✔ Check pods are ready [59s]
  ✔ Check Postgres DB [12s]
  ✔ Check REST API [39s]
  ✔ Check GRPC [30s]
  ✔ Check Monitor [59s]
  ✔ Check Importer [48s]
  ✔ Check Hedera Explorer [0.7s]
```

* Deploy a JSON RPC relay
```
$ solo relay deploy
******************************* Solo *********************************************
Version                 : 0.22.1
Kubernetes Context      : microk8s
Kubernetes Cluster      : microk8s-cluster
Kubernetes Namespace    : solo
**********************************************************************************
(node:7924) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
✔ Initialize [1s]
✔ Prepare chart values
✔ Deploy JSON RPC Relay [9s]
✔ Check relay is ready [21s]
```

You may view the list of pods using `k9s` as below:

```
 Context: kind-solo-e2e                            <0> all       <a>      Attach     <l>     … ____  __.________
 Cluster: kind-solo-e2e                            <1> default   <ctrl-d> Delete     <p>      |    |/ _/   __   \______
 User:    kind-solo-e2e                                          <d>      Describe   <shift-f>|      < \____    /  ___/
 K9s Rev: v0.27.4 ⚡️v0.32.4                                      <e>      Edit       <s>      |    |  \   /    /\___ \
 K8s Rev: v1.27.3                                                <?>      Help       <n>      |____|__ \ /____//____  >
 CPU:     n/a                                                    <ctrl-k> Kill       <f>              \/            \/
 MEM:     n/a
┌─────────────────────────────────────────────────── Pods(all)[27] ────────────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                                   PF READY RESTARTS STATUS   IP             │
│ fullstack-setup     console-557956d575-fqctd                               ●  1/1          0 Running  10.244.0.4     │
│ fullstack-setup     minio-operator-7d575c5f84-j9p6f                        ●  1/1          0 Running  10.244.0.3     │
│ kube-system         coredns-5d78c9869d-gknqp                               ●  1/1          0 Running  10.244.0.6     │
│ kube-system         coredns-5d78c9869d-q59pc                               ●  1/1          0 Running  10.244.0.5     │
│ kube-system         etcd-solo-e2e-control-plane                            ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kindnet-w9ps5                                          ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-apiserver-solo-e2e-control-plane                  ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-controller-manager-solo-e2e-control-plane         ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-proxy-p69z8                                       ●  1/1          0 Running  172.18.0.2     │
│ kube-system         kube-scheduler-solo-e2e-control-plane                  ●  1/1          0 Running  172.18.0.2     │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-8pkfk                ●  1/1          0 Running  10.244.0.2     │
│ solo                envoy-proxy-node0-84947f844f-f28tp                     ●  1/1          0 Running  10.244.0.215   │
│ solo                envoy-proxy-node1-65f8879dcc-j2lrk                     ●  1/1          0 Running  10.244.0.216   │
│ solo                envoy-proxy-node2-667f848689-dkmf9                     ●  1/1          0 Running  10.244.0.214   │
│ solo                fullstack-deployment-grpc-69f9cc5666-lf6ql             ●  1/1          0 Running  10.244.0.227   │
│ solo                fullstack-deployment-hedera-explorer-79f79b7df4-wjdct  ●  1/1          0 Running  10.244.0.226   │
│ solo                fullstack-deployment-importer-864489ffb8-6v8tk         ●  1/1          0 Running  10.244.0.228   │
│ solo                fullstack-deployment-postgres-postgresql-0             ●  1/1          0 Running  10.244.0.232   │
│ solo                fullstack-deployment-rest-584f5cb6bb-q9vnt             ●  1/1          0 Running  10.244.0.230   │
│ solo                fullstack-deployment-web3-69dcdfc4fb-mm5pk             ●  1/1          0 Running  10.244.0.229   │
│ solo                haproxy-node0-6969f76c77-n5cfl                         ●  1/1          1 Running  10.244.0.219   │
│ solo                haproxy-node1-59f6976d45-x6xmp                         ●  1/1          1 Running  10.244.0.217   │
│ solo                haproxy-node2-6df64d5457-hf9ps                         ●  1/1          1 Running  10.244.0.218   │
│ solo                minio-pool-1-0                                         ●  2/2          1 Running  10.244.0.224   │
│ solo                network-node0-0                                        ●  5/5          0 Running  10.244.0.221   │
│ solo                network-node1-0                                        ●  5/5          0 Running  10.244.0.222   │
│ solo                network-node2-0                                        ●  5/5          0 Running  10.244.0.220   │
```

#### Access Hedera Network services

Once the nodes are up, you may now expose various services (using `k9s` (shift-f) or `kubectl port-forward`) and access. Below are most used services that you may expose.

* Node services: `network-<node ID>-svc`
* HAProxy: `haproxy-<node ID>-svc`
* Envoy Proxy: `envoy-proxy-<node ID>-svc`
* Hedera explorer: `fullstack-deployment-hedera-explorer`
* JSON Rpc Relays
  * You can deploy JSON RPC relays for one or more nodes as below:
  ```
  $ solo relay deploy -i node0,node1 

  ******************************* Solo *********************************************
  Version                 : 0.22.1
  Kubernetes Context      : kind-solo-e2e
  Kubernetes Cluster      : kind-solo-e2e
  Kubernetes Namespace    : solo
  **********************************************************************************
  ✔ Initialize
  ✔ Prepare chart values
  ✔ Deploy JSON RPC Relay [1s]
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

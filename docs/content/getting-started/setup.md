***

title: Setup
weight: -20
geekdocNav: true
geekdocAlign: center
geekdocAnchor: false
--------------------

### Remote cluster

You may use remote kubernetes cluster. In this case, ensure kubernetes context is set up correctly.

```
kubectl config use-context <context-name>

```

### Local cluster

You may use [kind](https://kind.sigs.k8s.io/) or [microk8s](https://microk8s.io/) to create a cluster.\
In this case,
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
 ✓ Ensuring node image (kindest/node:v1.29.1) 🖼
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
----------------------------------------------------------------------------------------------------------
```

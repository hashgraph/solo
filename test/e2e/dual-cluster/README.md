# Local Dual Cluster Testing

This document describes how to test the dual cluster setup locally.

## Prerequisites

* Make sure you give your Docker sufficient resources
  * ? CPUs
  * ? GB RAM
  * ? GB Swap
  * ? GB Disk Space
* If you are tight on resources you might want to make sure that no other Kind clusters are running or anything that is resource heavy on your machine.

## Calling

```bash
# from your Solo root directory run:
./test/e2e/dual-cluster/setup-dual-e2e.sh
```

Output:

```bash
SOLO_CHARTS_DIR:
Deleting cluster "solo-e2e-c1" ...
Deleting cluster "solo-e2e-c2" ...
1051ed73cb755a017c3d578e5c324eef1cae95c606164f97228781db126f80b6
"metrics-server" has been added to your repositories
"metallb" has been added to your repositories
Creating cluster "solo-e2e-c1" ...
 ✓ Ensuring node image (kindest/node:v1.31.4) 🖼
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo-e2e-c1"
You can now use your cluster with:

kubectl cluster-info --context kind-solo-e2e-c1

Thanks for using kind! 😊
Release "metrics-server" does not exist. Installing it now.
NAME: metrics-server
LAST DEPLOYED: Fri Feb 14 16:04:15 2025
NAMESPACE: kube-system
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
***********************************************************************
* Metrics Server                                                      *
***********************************************************************
  Chart version: 3.12.2
  App version:   0.7.2
  Image tag:     registry.k8s.io/metrics-server/metrics-server:v0.7.2
***********************************************************************
Release "metallb" does not exist. Installing it now.
NAME: metallb
LAST DEPLOYED: Fri Feb 14 16:04:16 2025
NAMESPACE: metallb-system
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
MetalLB is now running in the cluster.

Now you can configure it via its CRs. Please refer to the metallb official docs
on how to use the CRs.
ipaddresspool.metallb.io/local created
l2advertisement.metallb.io/local created
namespace/cluster-diagnostics created
configmap/cluster-diagnostics-cm created
service/cluster-diagnostics-svc created
deployment.apps/cluster-diagnostics created
Creating cluster "solo-e2e-c2" ...
 ✓ Ensuring node image (kindest/node:v1.31.4) 🖼
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo-e2e-c2"
You can now use your cluster with:

kubectl cluster-info --context kind-solo-e2e-c2

Have a question, bug, or feature request? Let us know! https://kind.sigs.k8s.io/#community 🙂
Release "metrics-server" does not exist. Installing it now.
NAME: metrics-server
LAST DEPLOYED: Fri Feb 14 16:05:07 2025
NAMESPACE: kube-system
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
***********************************************************************
* Metrics Server                                                      *
***********************************************************************
  Chart version: 3.12.2
  App version:   0.7.2
  Image tag:     registry.k8s.io/metrics-server/metrics-server:v0.7.2
***********************************************************************
Release "metallb" does not exist. Installing it now.
NAME: metallb
LAST DEPLOYED: Fri Feb 14 16:05:08 2025
NAMESPACE: metallb-system
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
MetalLB is now running in the cluster.

Now you can configure it via its CRs. Please refer to the metallb official docs
on how to use the CRs.
ipaddresspool.metallb.io/local created
l2advertisement.metallb.io/local created
namespace/cluster-diagnostics created
configmap/cluster-diagnostics-cm created
service/cluster-diagnostics-svc created
deployment.apps/cluster-diagnostics created

> @hashgraph/solo@0.34.0 build
> rm -Rf dist && tsc && node resources/post-build-script.js


> @hashgraph/solo@0.34.0 solo
> node --no-deprecation --no-warnings dist/solo.js init


******************************* Solo *********************************************
Version			: 0.34.0
Kubernetes Context	: kind-solo-e2e-c2
Kubernetes Cluster	: kind-solo-e2e-c2
Current Command		: init
**********************************************************************************
✔ Setup home directory and cache
✔ Check dependencies
  ✔ Check dependency: helm [OS: darwin, Release: 23.6.0, Arch: arm64]
✔ Setup chart manager [1s]
✔ Copy templates in '/Users/user/.solo/cache'


***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /Users/user/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
Switched to context "kind-solo-e2e-c1".

> @hashgraph/solo@0.34.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster setup -s solo-setup


******************************* Solo *********************************************
Version			: 0.34.0
Kubernetes Context	: kind-solo-e2e-c1
Kubernetes Cluster	: kind-solo-e2e-c1
Current Command		: cluster setup
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Install 'solo-cluster-setup' chart [2s]
NAME              	NAMESPACE     	REVISION	UPDATED                             	STATUS  	CHART                    	APP VERSION
metallb           	metallb-system	1       	2025-02-14 16:04:16.785411 +0000 UTC	deployed	metallb-0.14.9           	v0.14.9
metrics-server    	kube-system   	1       	2025-02-14 16:04:15.593138 +0000 UTC	deployed	metrics-server-3.12.2    	0.7.2
solo-cluster-setup	solo-setup    	1       	2025-02-14 16:05:54.334181 +0000 UTC	deployed	solo-cluster-setup-0.44.0	0.44.0
Switched to context "kind-solo-e2e-c2".

> @hashgraph/solo@0.34.0 solo
> node --no-deprecation --no-warnings dist/solo.js cluster setup -s solo-setup


******************************* Solo *********************************************
Version			: 0.34.0
Kubernetes Context	: kind-solo-e2e-c2
Kubernetes Cluster	: kind-solo-e2e-c2
Current Command		: cluster setup
**********************************************************************************
✔ Initialize
✔ Prepare chart values
✔ Install 'solo-cluster-setup' chart [2s]
NAME              	NAMESPACE     	REVISION	UPDATED                             	STATUS  	CHART                    	APP VERSION
metallb           	metallb-system	1       	2025-02-14 16:05:08.226466 +0000 UTC	deployed	metallb-0.14.9           	v0.14.9
metrics-server    	kube-system   	1       	2025-02-14 16:05:07.217358 +0000 UTC	deployed	metrics-server-3.12.2    	0.7.2
solo-cluster-setup	solo-setup    	1       	2025-02-14 16:05:58.114619 +0000 UTC	deployed	solo-cluster-setup-0.44.0	0.44.0
Switched to context "kind-solo-e2e-c1".
```

## Diagnostics

The `./diagnostics/cluster/deploy.sh` deploys a `cluster-diagnostics` deployment (and its pod) with a service that has its external IP exposed.  It is deployed to both clusters, runs Ubuntu, and has most diagnostic software installed.  After ran you can shell into the pod and use the container to run your own troubleshooting commands for verifying network connectivity between the two clusters or DNS resolution, etc.

Calling

```bash
# from your Solo root directory run:
$ ./test/e2e/dual-cluster/diagnostics/cluster/deploy.sh
```

Output:

```bash
namespace/cluster-diagnostics unchanged
configmap/cluster-diagnostics-cm unchanged
service/cluster-diagnostics-svc unchanged
deployment.apps/cluster-diagnostics unchanged
```

## Cleanup

Calling

```bash
# from your Solo root directory run:
kind delete clusters cluster1 cluster2
```

Output:

```bash
Deleted clusters: ["cluster1" "cluster2"]
```

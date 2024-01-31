# Solo

An opinionated CLI tool to deploy and manage private Hedera Networks.

## Basic Usage

* Run `npm install -g @hashgraph/solo`

* Ensure you have a valid kubernetes context, cluster and namespace. You may use `kind` and `kubectl` CLIs to create
  cluster and namespace as below (See [`test/e2e/setup-e2e.sh`](test/e2e/setup_e2e.sh)):

```
export SOLO_CLUSTER_NAME=solo-local
export SOLO_NAMESPACE=solo-local
kind create cluster -n "${SOLO_CLUSTER_NAME}" 
kubectl create ns "${SOLO_NAMESPACE}"
solo init -d ../charts --namespace "${SOLO_NAMESPACE}" # cache args for subsequent commands
```

* Run `solo` from a terminal, It may show usage options as shown below:

```
❯ solo

******************************* Solo *********************************************
Version                 : 0.18.0
Kubernetes Context      : kind-kind
Kubernetes Cluster      : kind-kind
Kubernetes Namespace    : undefined
**********************************************************************************
Usage:
  solo <command> [options]

Commands:
  solo init     Initialize local environment
  solo cluster  Manage fullstack testing cluster
  solo network  Manage fullstack testing network deployment
  solo node     Manage Hedera platform node in fullstack testing network
  solo relay    Manage JSON RPC relays in fullstack testing network

Options:
      --dev      Enable developer mode                                                        [boolean] [default: false]
  -h, --help     Show help                                                                                     [boolean]
  -v, --version  Show version number                                                                           [boolean]

Select a command
```

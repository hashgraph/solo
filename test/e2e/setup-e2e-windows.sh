#!/usr/bin/env bash

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-e2e-cluster
minikube profile list
minikube start -p ${SOLO_CLUSTER_NAME} --driver=docker
solo init --namespace "${SOLO_NAMESPACE}" -i node0,node1,node2 -t v0.42.5 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1 # cache args for subsequent commands
solo cluster setup  || exit 1
solo network deploy || exit 1

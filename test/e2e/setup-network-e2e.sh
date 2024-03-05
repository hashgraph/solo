#!/usr/bin/env bash
readonly KIND_IMAGE="kindest/node:v1.27.3@sha256:3966ac761ae0136263ffdb6cfd4db23ef8a83cba8a463690e98317add2c9ba72"

SOLO_NETWORK_CLUSTER_NAME=solo-network
SOLO_NETWORK_NAMESPACE=solo-network
SOLO_NETWORK_CLUSTER_SETUP_NAMESPACE=solo-network-cluster
kind delete cluster -n "${SOLO_NETWORK_CLUSTER_NAME}" || true
kind create cluster -n "${SOLO_NETWORK_CLUSTER_NAME}" --image "${KIND_IMAGE}" || exit 1
solo init --namespace "${SOLO_NETWORK_NAMESPACE}" -i node0,node1,node2 -t v0.42.5 -s "${SOLO_NETWORK_CLUSTER_SETUP_NAMESPACE}" || exit 1 # cache args for subsequent commands


#!/usr/bin/env bash
readonly KIND_IMAGE="kindest/node:v1.27.3@sha256:3966ac761ae0136263ffdb6cfd4db23ef8a83cba8a463690e98317add2c9ba72"

SOLO_NETWORK_NAMESPACE=solo-network
SOLO_CLUSTER_SETUP_NAMESPACE=solo-e2e-cluster
solo init --namespace "${SOLO_NETWORK_NAMESPACE}" -i node0,node1,node2 -t v0.42.5 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1 # cache args for subsequent commands


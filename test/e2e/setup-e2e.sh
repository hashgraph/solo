#!/usr/bin/env bash
readonly KIND_IMAGE="kindest/node:v1.27.3@sha256:3966ac761ae0136263ffdb6cfd4db23ef8a83cba8a463690e98317add2c9ba72"

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-e2e-cluster
kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
kind create cluster -n "${SOLO_CLUSTER_NAME}" --image "${KIND_IMAGE}" || exit 1
solo init --namespace "${SOLO_NAMESPACE}" -i node0,node1,node2 -t v0.42.5 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --fst-chart-version v0.22.0 --dev || exit 1 # cache args for subsequent commands
solo cluster setup  || exit 1
solo network deploy || exit 1
helm list --all-namespaces

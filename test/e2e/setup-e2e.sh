#!/usr/bin/env bash
readonly KIND_IMAGE="kindest/node:v1.27.3@sha256:3966ac761ae0136263ffdb6cfd4db23ef8a83cba8a463690e98317add2c9ba72"

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=fullstack-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
kind create cluster -n "${SOLO_CLUSTER_NAME}" --image "${KIND_IMAGE}" || exit 1

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# **********************************************************************************************************************
solo init --namespace "${SOLO_NAMESPACE}" -i node0,node1,node2 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev || exit 1 # cache args for subsequent commands
solo cluster setup  || exit 1
helm list --all-namespaces
solo network deploy || exit 1

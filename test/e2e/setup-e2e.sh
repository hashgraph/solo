#!/usr/bin/env bash
readonly KIND_IMAGE="kindest/node:v1.27.3@sha256:3966ac761ae0136263ffdb6cfd4db23ef8a83cba8a463690e98317add2c9ba72"

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=fullstack-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
kind create cluster -n "${SOLO_CLUSTER_NAME}" --image "${KIND_IMAGE}" || exit 1

# **********************************************************************************************************************
# Warm up the cluster by deploying the network
# This also helps to have the cluster loaded with the images.
# Most of the e2e test should bootstrap its own network in its own namespace. However, some tests can use this as a
# shared resource if required.
# **********************************************************************************************************************
solo init --namespace "${SOLO_NAMESPACE}" -i node0,node1,node2 -t v0.42.5 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --fst-chart-version v0.22.0 --dev || exit 1 # cache args for subsequent commands
solo cluster setup  || exit 1
helm list --all-namespaces
solo network deploy || exit 1

# **********************************************************************************************************************
# Don't delete the namespaces as some e2e tests (i.e. test/e2e/core/*.test.mjs) still uses it as shared resources.
# **********************************************************************************************************************
# kubectl delete ns "${SOLO_NAMESPACE}"v
# kubectl delete ns "${SOLO_CLUSTER_SETUP_NAMESPACE}"

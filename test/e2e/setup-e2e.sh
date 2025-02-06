#!/usr/bin/env bash
readonly KIND_IMAGE="kindest/node:v1.27.3@sha256:3966ac761ae0136263ffdb6cfd4db23ef8a83cba8a463690e98317add2c9ba72"
echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin

if [[ -z "${SOLO_TEST_CLUSTER}" && ${SOLO_CLUSTER_NAME} != "" ]]; then
  SOLO_CLUSTER_NAME=solo-e2e
else
  SOLO_CLUSTER_NAME=${SOLO_TEST_CLUSTER}
fi

SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
kind create cluster -n "${SOLO_CLUSTER_NAME}" --image "${KIND_IMAGE}" || exit 1

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# -d ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
npm run build
npm run solo -- init || exit 1 # cache args for subsequent commands
npm run solo -- cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
helm list --all-namespaces
sleep 10 # give time for solo-setup to finish deploying

#!/usr/bin/env bash

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly KIND_CONFIG_FILE="${SCRIPT_PATH}/kind-cluster.yaml"
readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"
echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin

if [[ -n "${SOLO_TEST_CLUSTER}" ]]; then
  SOLO_CLUSTER_NAME="${SOLO_TEST_CLUSTER}"
elif [[ -z "${SOLO_CLUSTER_NAME}" ]]; then
  SOLO_CLUSTER_NAME="solo-e2e"
fi

SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
kind create cluster -n "${SOLO_CLUSTER_NAME}" --image "${KIND_IMAGE}" --config "${KIND_CONFIG_FILE}" || exit 1

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# --chart-directory ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
task build
task solo-test -- init || exit 1 # cache args for subsequent commands
task solo-test -- cluster-ref setup --cluster-setup-namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
helm list --all-namespaces
sleep 10 # give time for solo-setup to finish deploying

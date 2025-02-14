#!/usr/bin/env bash
set -eo pipefail

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly CLUSTER_DIAGNOSTICS_PATH="${SCRIPT_PATH}/diagnostics/cluster"
readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"
export PATH=${PATH}:~/.solo/bin

if [[ -n "${SOLO_TEST_CLUSTER}" ]]; then
  SOLO_CLUSTER_NAME="${SOLO_TEST_CLUSTER}"
elif [[ -z "${SOLO_CLUSTER_NAME}" ]]; then
  SOLO_CLUSTER_NAME="solo-e2e"
fi

for i in {1..2}; do
  kind delete cluster -n "${SOLO_CLUSTER_NAME}-c${i}" || true
done

docker network rm kind
docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge

# Setup Helm Repos
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo add metallb https://metallb.github.io/metallb

for i in {1..2}; do
  kind create cluster -n "${SOLO_CLUSTER_NAME}-c${i}" --image "${KIND_IMAGE}" --config "${SCRIPT_PATH}/kind-cluster-${i}.yaml" || exit 1
  helm upgrade --install metrics-server metrics-server/metrics-server \
    --namespace kube-system --wait --atomic \
    --set "args[0]=--kubelet-insecure-tls"

  helm upgrade --install metallb metallb/metallb \
    --namespace metallb-system --create-namespace --wait --atomic \
    --set speaker.frr.enabled=true

  kubectl apply -f "${SCRIPT_PATH}/metallb-cluster-${i}.yaml"

  "${CLUSTER_DIAGNOSTICS_PATH}"/deploy.sh
done

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# -d ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
# SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
# npm run build
#npm run solo -- init || exit 1 # cache args for subsequent commands
#npm run solo -- cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || exit 1
#helm list --all-namespaces
#sleep 10 # give time for solo-setup to finish deploying

#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# test-solo-containers-image.sh - Regression check for the solo-containers consensus node image.
#
# Builds the debian-s6-java25 image from hiero-ledger/solo-containers, loads it into a Kind cluster
# (no registry push), deploys a one-node network with Solo that uses the loaded image for the
# root container, and fails unless the node reaches ACTIVE on that exact image.
#
# The image is pinned with pullPolicy: Never, so the pod can only start if the loaded image is used.
#
# Usage (from the root of the solo repository):
#   .github/workflows/script/test-solo-containers-image.sh
#
# Environment variables (all optional):
#   SOLO_CONTAINERS_REF  - solo-containers branch or tag to build (default: main)
#   SOLO_CMD             - Solo command to use (default: "npm run solo-test --")

set -eo pipefail

SOLO_CONTAINERS_REF="${SOLO_CONTAINERS_REF:-main}"
SOLO_CMD="${SOLO_CMD:-npm run solo-test --}"
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

# Not a real registry host, so nothing can pull it: the pod only starts from the Kind-loaded copy.
IMAGE_REPOSITORY=solo-local-test/debian-s6-java25
IMAGE_TAG=regression
# Kind stores an image without a registry under docker.io.
EXPECTED_IMAGE="docker.io/${IMAGE_REPOSITORY}:${IMAGE_TAG}"

WORK_DIR="$(mktemp -d)"
trap '/bin/rm -rf "${WORK_DIR}"' EXIT

echo "Cloning hiero-ledger/solo-containers at ${SOLO_CONTAINERS_REF}"
git clone --depth 1 --branch "${SOLO_CONTAINERS_REF}" \
  https://github.com/hiero-ledger/solo-containers.git "${WORK_DIR}/solo-containers"

echo "Building ${IMAGE_REPOSITORY}:${IMAGE_TAG}"
docker build -t "${IMAGE_REPOSITORY}:${IMAGE_TAG}" "${WORK_DIR}/solo-containers/docker/debian-s6-java25"

kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
/bin/rm -rf ~/.solo 2>/dev/null || true
kind create cluster --name "${SOLO_CLUSTER_NAME}" --image kindest/node:v1.34.0 --wait 5m \
  --config .github/workflows/script/kind-config.yaml

echo "Loading the image into Kind"
kind load docker-image "${IMAGE_REPOSITORY}:${IMAGE_TAG}" --name "${SOLO_CLUSTER_NAME}"

VALUES_FILE="${WORK_DIR}/root-image-values.yaml"
cat > "${VALUES_FILE}" <<EOF
defaults:
  root:
    image:
      registry: docker.io
      repository: ${IMAGE_REPOSITORY}
      tag: ${IMAGE_TAG}
      pullPolicy: Never
EOF

${SOLO_CMD} cluster-ref config connect --cluster-ref "${SOLO_CLUSTER_NAME}" --context "kind-${SOLO_CLUSTER_NAME}"
${SOLO_CMD} deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
${SOLO_CMD} deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "${SOLO_CLUSTER_NAME}" --num-consensus-nodes 1
${SOLO_CMD} cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
${SOLO_CMD} keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys
${SOLO_CMD} consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --values-file "${VALUES_FILE}"
${SOLO_CMD} consensus node setup --deployment "${SOLO_DEPLOYMENT}"
# node start waits for the node to reach ACTIVE and fails otherwise.
${SOLO_CMD} consensus node start --deployment "${SOLO_DEPLOYMENT}"

ROOT_IMAGES="$(kubectl get pods -n "${SOLO_NAMESPACE}" \
  -o jsonpath='{range .items[*].spec.containers[?(@.name=="root-container")]}{.image}{"\n"}{end}')"
echo "root-container images:"
echo "${ROOT_IMAGES}"
if [[ -z "${ROOT_IMAGES}" ]] || grep -qvxF "${EXPECTED_IMAGE}" <<< "${ROOT_IMAGES}"; then
  echo "FAIL: every root-container must run ${EXPECTED_IMAGE}"
  exit 1
fi

echo "PASS: consensus node is ACTIVE on the locally built solo-containers image"

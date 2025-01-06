#!/bin/bash
set -eo pipefail

source .github/workflows/script/helper.sh

if [ -z "${GCS_ACCESS_KEY}" ]; then
  echo "GCS_ACCESS_KEY is not set. Exiting..."
  exit 1
fi

if [ -z "${GCS_SECRET_KEY}" ]; then
  echo "GCS_SECRET_KEY is not set. Exiting..."
  exit 1
fi

if [ -z "${BUCKET_NAME}" ]; then
  streamBucket="solo-ci-test-streams"
else
  streamBucket=${BUCKET_NAME}
fi

if [ -z "${STORAGE_TYPE}" ]; then
  storageType="gcs_and_minio"
else
  storageType=${STORAGE_TYPE}
fi

echo "Using bucket name: ${streamBucket}"
echo "Test storage type: ${storageType}"

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
npm run solo-test -- init
npm run solo-test -- cluster setup \
  -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- node keys --gossip-keys --tls-keys -i node1
npm run solo-test -- network deploy -i node1 -n "${SOLO_NAMESPACE}" \
  --storage-endpoint "https://storage.googleapis.com" \
  --storage-access-key "${GCS_ACCESS_KEY}" --storage-secrets "${GCS_SECRET_KEY}" \
  --storage-type "${storageType}" --storage-bucket "${streamBucket}"

npm run solo-test -- node setup -i node1 -n "${SOLO_NAMESPACE}"
npm run solo-test -- node start -i node1 -n "${SOLO_NAMESPACE}"
npm run solo-test -- mirror-node deploy --namespace "${SOLO_NAMESPACE}" \
  --storage-endpoint "https://storage.googleapis.com" \
  --storage-access-key "${GCS_ACCESS_KEY}" --storage-secrets "${GCS_SECRET_KEY}" \
  --storage-type "${storageType}" --storage-bucket "${streamBucket}"

kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/hedera-explorer 8080:80 > /dev/null 2>&1 &

cd ..; create_test_account ; cd -

node examples/create-topic.js

npm run solo-test -- node stop -i node1 -n "${SOLO_NAMESPACE}"

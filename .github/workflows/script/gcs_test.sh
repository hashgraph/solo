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

if [ -z "${BUCKET_PREFIX}" ]; then
  streamBucket="solo-streams"
else
  streamBucket="${BUCKET_PREFIX}-solo-streams"
fi

echo "Generate GCS credentials to file gcs_values.yaml"
echo "cloud:" > gcs_values.yaml
echo "  buckets:" >> gcs_values.yaml
echo "    streamBucket: ${streamBucket}" >> gcs_values.yaml
echo "  gcs:" >> gcs_values.yaml
echo "    enabled: true" >> gcs_values.yaml
echo '    GCS_ACCESS_KEY: "'${GCS_ACCESS_KEY}'"' >> gcs_values.yaml
echo '    GCS_SECRET_KEY: "'${GCS_SECRET_KEY}'"' >> gcs_values.yaml
echo '    endpoint: "https://storage.googleapis.com"' >> gcs_values.yaml


SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup

kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo node keys --gossip-keys --tls-keys -i node1,node2
solo network deploy -i node1,node2 -n "${SOLO_NAMESPACE}" -f gcs_values.yaml
solo node setup -i node1,node2 -n "${SOLO_NAMESPACE}"
solo node start -i node1,node2 -n "${SOLO_NAMESPACE}"
solo mirror-node deploy --namespace "${SOLO_NAMESPACE}"

kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/hedera-explorer 8080:80 > /dev/null 2>&1 &

cd ..; create_test_account ; cd -

node examples/create-topic.js

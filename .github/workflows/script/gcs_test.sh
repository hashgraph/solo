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

echo "Using bucket name: ${streamBucket}"

echo "Generate GCS credentials to file gcs_values.yaml"
echo "cloud:" > gcs_values.yaml
echo "  buckets:" >> gcs_values.yaml
echo "    streamBucket: ${streamBucket}" >> gcs_values.yaml
echo "  gcs:" >> gcs_values.yaml
echo "    enabled: true" >> gcs_values.yaml
echo 'minio-server:' >> gcs_values.yaml
echo "  tenant:" >> gcs_values.yaml
echo "    configuration:" >> gcs_values.yaml
echo "      name: new-minio-secrets" >> gcs_values.yaml
echo "    buckets:" >> gcs_values.yaml
echo "      - name: ${streamBucket}" >> gcs_values.yaml
echo "      - name: solo-backups" >> gcs_values.yaml

echo "Generate mirror value file gcs_mirror_values.yaml"
echo "importer:" > gcs_mirror_values.yaml
echo "  config:" >> gcs_mirror_values.yaml
echo "    hedera:" >> gcs_mirror_values.yaml
echo "      mirror:" >> gcs_mirror_values.yaml
echo "        importer:" >> gcs_mirror_values.yaml
echo "          downloader:" >> gcs_mirror_values.yaml
echo "            bucketName: ${streamBucket}" >> gcs_mirror_values.yaml
echo "  env:" >> gcs_mirror_values.yaml
echo "    - name: HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_TYPE" >> gcs_mirror_values.yaml
echo "      value: GCP" >> gcs_mirror_values.yaml
echo "    - name: HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_URI" >> gcs_mirror_values.yaml
echo "      value: https://storage.googleapis.com" >> gcs_mirror_values.yaml
echo "    - name: HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_ACCESSKEY" >> gcs_mirror_values.yaml
echo "      value: ${GCS_ACCESS_KEY}" >> gcs_mirror_values.yaml
echo "    - name: HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_SECRETKEY" >> gcs_mirror_values.yaml
echo "      value: ${GCS_SECRET_KEY}" >> gcs_mirror_values.yaml

#echo "  extraEnvFrom:" >> gcs_mirror_values.yaml
#echo "    - secretRef:" >> gcs_mirror_values.yaml
#echo "        name: cloud-storage-secrets" >> gcs_mirror_values.yaml
#echo "monitor:" >> gcs_mirror_values.yaml
#echo "  extraEnvFrom:" >> gcs_mirror_values.yaml
#echo "    - secretRef:" >> gcs_mirror_values.yaml
#echo "        name: cloud-storage-secrets" >> gcs_mirror_values.yaml

#echo "  envFrom:" >> gcs_mirror_values.yaml
#echo "    - secretRef:" >> gcs_mirror_values.yaml
#echo "        name: cloud-storage-secrets" >> gcs_mirror_values.yaml
#echo "monitor:" >> gcs_mirror_values.yaml
#echo "  envFrom:" >> gcs_mirror_values.yaml
#echo "    - secretRef:" >> gcs_mirror_values.yaml
#echo "        name: cloud-storage-secrets" >> gcs_mirror_values.yaml

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
npm run solo-test -- init
npm run solo-test -- cluster setup --chart-dir /Users/jeffrey/solo-charts/charts -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- node keys --gossip-keys --tls-keys -i node1,node2
npm run solo-test -- network deploy --chart-dir /Users/jeffrey/solo-charts/charts -i node1,node2 -n "${SOLO_NAMESPACE}" -f gcs_values.yaml --storage-endpoint "https://storage.googleapis.com" \
  --storage-access-key "${GCS_ACCESS_KEY}" --storage-secrets "${GCS_SECRET_KEY}" --storage-type "gcs"
npm run solo-test -- node setup -i node1,node2 -n "${SOLO_NAMESPACE}"
npm run solo-test -- node start -i node1,node2 -n "${SOLO_NAMESPACE}"
npm run solo-test -- mirror-node deploy --namespace "${SOLO_NAMESPACE}" -f gcs_mirror_values.yaml

kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/hedera-explorer 8080:80 > /dev/null 2>&1 &

cd ..; create_test_account ; cd -

node examples/create-topic.js

npm run solo-test -- node stop -i node1,node2 -n "${SOLO_NAMESPACE}"

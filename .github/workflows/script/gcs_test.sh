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

if [ -z "${BACKUP_BUCKET_NAME}" ]; then
  streamBackupBucket="solo-ci-backups"
else
  streamBackupBucket=${BACKUP_BUCKET_NAME}
fi

if [ -z "${STORAGE_TYPE}" ]; then
  storageType="gcs_and_minio"
else
  storageType=${STORAGE_TYPE}
fi

if [ -z "${GCP_SERVICE_ACCOUNT_TOKEN}" ]; then
  echo "GCP_SERVICE_ACCOUNT_TOKEN is not set. Exiting..."
  exit 1
fi

if [ -z "${PREFIX}" ]; then
  echo "PREFIX is not set"
else
  echo "Using PREFIX: ${PREFIX}"
  BUCKET_PREFIX_OPTION="--storage-bucket-prefix ${PREFIX}"
fi

echo "${GCP_SERVICE_ACCOUNT_TOKEN}" > gcp_service_account.json

echo "Using bucket name: ${streamBucket}"
echo "Test storage type: ${storageType}"

if [[ -z "${SOLO_TEST_CLUSTER}" && ${SOLO_CLUSTER_NAME} != "" ]]; then
  SOLO_CLUSTER_NAME=solo-e2e
else
  SOLO_CLUSTER_NAME=${SOLO_TEST_CLUSTER}
fi
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
  --storage-type "${storageType}" --storage-bucket "${streamBucket}" $BUCKET_PREFIX_OPTION \
  --backup-bucket "${streamBackupBucket}" \
  --google-credential gcp_service_account.json

npm run solo-test -- node setup -i node1 -n "${SOLO_NAMESPACE}"
npm run solo-test -- node start -i node1 -n "${SOLO_NAMESPACE}"
npm run solo-test -- mirror-node deploy --namespace "${SOLO_NAMESPACE}" \
  --storage-endpoint "https://storage.googleapis.com" \
  --storage-access-key "${GCS_ACCESS_KEY}" --storage-secrets "${GCS_SECRET_KEY}" \
  --storage-type "${storageType}" --storage-bucket "${streamBucket}" $BUCKET_PREFIX_OPTION

npm run solo-test -- explorer deploy -n "${SOLO_NAMESPACE}" -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &

explorer_svc="$(kubectl get svc -l app.kubernetes.io/component=hedera-explorer -n ${SOLO_NAMESPACE} --output json | jq -r '.items[].metadata.name')"
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/"${explorer_svc}" 8080:80 > /dev/null 2>&1 &

cd ..; create_test_account ; cd -

node examples/create-topic.js

npm run solo-test -- node stop -i node1 -n "${SOLO_NAMESPACE}"

echo "Waiting for backup uploader to run"
# manually call script "backup.sh" from container backup-uploader since it only runs every 5 minutes
kubectl exec network-node1-0 -c backup-uploader -n solo-e2e -- /backup.sh

echo "Retrieve logs and check if it include the error message"
# example : {"level":"error","msg":"Updated modification time ......}
kubectl logs network-node1-0 -c backup-uploader -n solo-e2e > backup-uploader.log
if grep -q \""error\"" backup-uploader.log; then
  echo "Backup uploader logs contain error message"
  exit 1
fi

npm run solo-test -- network destroy -n "${SOLO_NAMESPACE}" --force -q

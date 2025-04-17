#!/bin/bash
set -eo pipefail

source .github/workflows/script/helper.sh

# Check the health of a service endpoint
# $1: URL to check
# $2: Expected content in response
# $3: Service name for logging
# $4: Protocol (http/https) for logging
check_service_health() {
  local url=$1
  local expected_content=$2
  local service_name=$3
  local protocol=$4
  local curl_args=()

  if [[ $url == https://* ]]; then
    curl_args+=(-k)
  fi

  local curl_output=$(curl "${curl_args[@]}" "$url")
  if [[ $curl_output == *"$expected_content"* ]]; then
    echo "$service_name $protocol is up and running"
    return 0
  else
    echo "$service_name $protocol is not up and running"
    return 1
  fi
}

if [ -z "${STORAGE_TYPE}" ]; then
  storageType="minio_only"
else
  storageType=${STORAGE_TYPE}
fi

if [ "${storageType}" != "minio_only" ]; then
  if [ -z "${GCS_ACCESS_KEY}" ]; then
    echo "GCS_ACCESS_KEY is not set. Exiting..."
    exit 1
  fi

  if [ -z "${GCS_SECRET_KEY}" ]; then
    echo "GCS_SECRET_KEY is not set. Exiting..."
    exit 1
  fi
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

if [ -z "${PREFIX}" ]; then
  echo "PREFIX is not set"
else
  echo "Using PREFIX: ${PREFIX}"
  if [ "${storageType}" == "aws_only" ]; then
    STORAGE_OPTIONS=(
        "--aws-endpoint" "https://storage.googleapis.com"
        "--aws-write-access-key" "${GCS_ACCESS_KEY}"
        "--aws-write-secrets" "${GCS_SECRET_KEY}"
        "--aws-bucket" "${streamBucket}"
        "--aws-bucket-prefix" "${PREFIX}"

        "--backupWriteSecrets" "${GCS_SECRET_KEY}"
        "--backupWriteAccessKey" "${GCS_ACCESS_KEY}"
        "--backupEndpoint" "storage.googleapis.com"
        "--backupRegion" "us-central1"
        "--backup-bucket" "${streamBackupBucket}"
    )
  elif [ "${storageType}" == "gcs_only" ]; then
    STORAGE_OPTIONS=(
        "--gcs-endpoint" "https://storage.googleapis.com"
        "--gcs-write-access-key" "${GCS_ACCESS_KEY}"
        "--gcs-write-secrets" "${GCS_SECRET_KEY}"
        "--gcs-bucket" "${streamBucket}"
        "--gcs-bucket-prefix" "${PREFIX}"

        "--backupWriteSecrets" "${GCS_SECRET_KEY}"
        "--backupWriteAccessKey" "${GCS_ACCESS_KEY}"
        "--backupEndpoint" "storage.googleapis.com"
        "--backupRegion" "us-central1"
        "--backup-bucket" "${streamBackupBucket}"
    )
  fi

  if [ "${storageType}" == "aws_only" ] || [ "${storageType}" == "gcs_only" ]; then
    MIRROR_STORAGE_OPTIONS=(
        "--storage-endpoint" "https://storage.googleapis.com"
        "--storage-read-access-key" "${GCS_ACCESS_KEY}"
        "--storage-read-secrets" "${GCS_SECRET_KEY}"
        "--storage-bucket" "${streamBucket}"
        "--storage-bucket-prefix" "${PREFIX}"
    )
  fi
fi

echo "STORAGE_OPTIONS: " "${STORAGE_OPTIONS[@]}"
echo "MIRROR_STORAGE_OPTIONS: " "${MIRROR_STORAGE_OPTIONS[@]}"

echo "Using bucket name: ${streamBucket}"
echo "Test storage type: ${storageType}"

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-e2e

kind delete cluster -n "${SOLO_CLUSTER_NAME}"

if [ "${storageType}" == "minio_only" ]; then
  cd examples
  SOLO_DEPLOYMENT=solo-deployment
  task default-with-mirror
  cd -
else
  # get current script base directory
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  echo "script_dir: ${script_dir}"
  # Use custom kind config file to expose ports used by explorer ingress controller NodePort configuration
  kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${script_dir}"/kind-config.yaml
  npm run solo-test -- init
  npm run solo-test -- cluster-ref setup \
    -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
  npm run solo-test -- cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --email john@doe.com

  npm run solo-test -- deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"

  npm run solo-test -- deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1

  npm run solo-test -- node keys --gossip-keys --tls-keys -i node1 --deployment "${SOLO_DEPLOYMENT}"

  npm run solo-test -- network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1 \
    --storage-type "${storageType}" \
    "${STORAGE_OPTIONS[@]}"

  npm run solo-test -- node setup -i node1 --deployment "${SOLO_DEPLOYMENT}"
  npm run solo-test -- node start -i node1 --deployment "${SOLO_DEPLOYMENT}"
  npm run solo-test -- mirror-node deploy  --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} \
    --storage-type "${storageType}" \
    "${MIRROR_STORAGE_OPTIONS[@]}" \
    --ingress-controller-value-file "${script_dir}"/mirror-ingress-controller-values.yaml \
    --enable-ingress --domain-name localhost

  kubectl port-forward -n "${SOLO_NAMESPACE}" svc/mirror-grpc 5600:5600 > /dev/null 2>&1 &
  kubectl port-forward -n "${SOLO_NAMESPACE}" svc/mirror-rest 5551:80 > /dev/null 2>&1 &

  npm run solo-test -- explorer deploy -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" \
    --cluster-ref kind-${SOLO_CLUSTER_NAME} --tls-cluster-issuer-type self-signed --enable-hedera-explorer-tls \
    --ingress-controller-value-file "${script_dir}"/explorer-ingress-controller-values.yaml \
    --enable-ingress --domain-name localhost

  kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &

  explorer_svc="$(kubectl get svc -l app.kubernetes.io/component=hedera-explorer -n ${SOLO_NAMESPACE} --output json | jq -r '.items[].metadata.name')"
  kubectl port-forward -n "${SOLO_NAMESPACE}" svc/"${explorer_svc}" 8080:80 > /dev/null 2>&1 &

  # Check Explorer endpoints
  check_service_health "https://localhost:31001" "Hedera Mirror Node Explorer" "Explorer" "https" || exit 1
  check_service_health "http://localhost:31000" "Hedera Mirror Node Explorer" "Explorer" "http" || exit 1

  # Check Mirror API endpoints
  check_service_health "https://localhost:32001/api/v1/accounts" "accounts" "Mirror" "https" || exit 1
  check_service_health "http://localhost:32000/api/v1/accounts" "accounts" "Mirror" "http" || exit 1
fi

cd ..; create_test_account ${SOLO_DEPLOYMENT}; cd -

ps -ef |grep port-forward

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.3/grpcurl_1.9.3_linux_x86_64.tar.gz" | sudo tar -xz -C /usr/local/bin
fi

grpcurl -plaintext -d '{"file_id": {"fileNum": 102}, "limit": 0}' localhost:5600 com.hedera.mirror.api.proto.NetworkService/getNodes

node examples/create-topic.js

npm run solo-test -- node stop -i node1 --deployment "${SOLO_DEPLOYMENT}"

if [ "${storageType}" == "aws_only" ] || [ "${storageType}" == "gcs_only" ]; then
  echo "Waiting for backup uploader to run"
  # manually call script "backup.sh" from container backup-uploader since it only runs every 5 minutes
  kubectl exec network-node1-0 -c backup-uploader -n solo-e2e -- /app/backup.sh

  echo "Retrieve logs and check if it include the error message"
  # example : {"level":"error","msg":"Updated modification time ......}
  kubectl logs network-node1-0 -c backup-uploader -n solo-e2e > backup-uploader.log
  if grep -q \""error\"" backup-uploader.log; then
    echo "-----------------------------------------"
    echo "Backup uploader logs contain error message"
    echo "-----------------------------------------"
    exit 1
  fi
fi

npm run solo-test -- network destroy --deployment "${SOLO_DEPLOYMENT}" --force -q

echo "-----------------------------------------"
echo "Solo test finished successfully"
echo "-----------------------------------------"

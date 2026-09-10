#!/bin/bash
set -eo pipefail

function create_test_account ()
{
  echo "Create test account with solo network"
  cd solo
  DEPLOYMENT_NAME=$1
  echo "DEPLOYMENT_NAME=${DEPLOYMENT_NAME}"
  # create new account and extract account id
  echo "Creating first test account..."
  npm run solo-test -- ledger account create --deployment "${DEPLOYMENT_NAME}" --hbar-amount 10000 --generate-ecdsa-key --set-alias > test.log
  echo "First account created."
  export OPERATOR_ID=$(grep \"accountId\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "OPERATOR_ID=${OPERATOR_ID}"
  rm test.log

  # get private key of the account
  npm run solo-test -- ledger account info --deployment "${DEPLOYMENT_NAME}" --account-id "${OPERATOR_ID}" --private-key > test.log

  # retrieve the field privateKey but not privateKeyRaw
  export OPERATOR_KEY=$(grep \"privateKey\" test.log | grep -v "privateKeyRaw" | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  export CONTRACT_TEST_KEY_ONE=0x$(grep \"privateKeyRaw\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_ONE=${CONTRACT_TEST_KEY_ONE}"
  rm test.log

  echo "Create second test account"
  npm run solo-test -- ledger account create --deployment "${DEPLOYMENT_NAME}" --hbar-amount 10000 --generate-ecdsa-key --set-alias > test.log
  echo "Second account created."
  export SECOND_KEY=$(grep \"accountId\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  npm run solo-test -- ledger account info --deployment "${DEPLOYMENT_NAME}" --account-id ${SECOND_KEY} --private-key > test.log
  export CONTRACT_TEST_KEY_TWO=0x$(grep \"privateKeyRaw\" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_TWO=${CONTRACT_TEST_KEY_TWO}"
  rm test.log

  export CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEY_ONE},${CONTRACT_TEST_KEY_TWO}
  export HEDERA_NETWORK="local-node"

  echo "OPERATOR_KEY=${OPERATOR_KEY}"
  echo "HEDERA_NETWORK=${HEDERA_NETWORK}"
  echo "CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEYS}"

  cd -
}

function log_and_exit()
{
  if [ -z "${SOLO_NAMESPACE}" ]; then
    echo "SOLO_NAMESPACE is not set. Exiting."
    exit 1
  fi
  echo "log_and_exit begin with rc=$1"

  printf "\r::group::Relay log dump\n"
  echo "------- BEGIN RELAY DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep relay-1 | grep -v '\-ws' | xargs -IRELAY kubectl logs -n "${SOLO_NAMESPACE}" RELAY > relay.log || true
  echo "------- END RELAY DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror REST log dump\n"
  echo "------- BEGIN MIRROR REST DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep rest | grep -v '\-restjava' | xargs -IREST kubectl logs -n "${SOLO_NAMESPACE}" REST > rest.log || true
  echo "------- END MIRROR REST DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror gRPC log dump\n"
  echo "------- BEGIN MIRROR GRPC DUMP -------"
  kubectl get services -n "${SOLO_NAMESPACE}" --output=name | grep grpc | xargs -IGRPC kubectl logs -n "${SOLO_NAMESPACE}" GRPC > grpc.log || true
  echo "------- END MIRROR GRPC DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror Importer log dump\n"
  echo "------- BEGIN MIRROR IMPORTER DUMP -------"
  kubectl get pods -n "${SOLO_NAMESPACE}" --output=name | grep importer | xargs -IIMPORTER kubectl logs -n "${SOLO_NAMESPACE}" IMPORTER > importer.log 2>/dev/null || true
  kubectl get pods -n "${SOLO_NAMESPACE}" --output=name | grep importer | xargs -IIMPORTER kubectl logs -n "${SOLO_NAMESPACE}" IMPORTER --previous > importer-prev.log 2>/dev/null || true
  echo "------- END MIRROR IMPORTER DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  echo "------- END MIRROR IMPORTER DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Mirror Monitor log dump\n"
  echo "------- BEGIN LOG DUMP -------"
  kubectl get pods -n "${SOLO_NAMESPACE}"  --output=name | grep mirror-monitor | xargs -IPOD kubectl logs -n "${SOLO_NAMESPACE}" POD > monitor.log 2>/dev/null || true
  echo "------- END LOG DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  printf "\r::group::Port-forward log dump\n"
  echo "------- Last port-forward check -------" >> port-forward.log
  ps -ef |grep port-forward >> port-forward.log
  printf "\r::endgroup::\n"

  printf "\r::group::Block Node log dump\n"
  echo "------- BEGIN BLOCK NODE DUMP -------"
  blockNodePod=$(kubectl get pods -n "${SOLO_NAMESPACE}" --output=name | sed 's#pod/##' | grep '^block-node' | head -n 1 || true)
  if [[ -n "${blockNodePod}" ]]; then
    kubectl logs -n "${SOLO_NAMESPACE}" "${blockNodePod}" -c block-node-server > block-node.log 2>/dev/null || true
    kubectl logs -n "${SOLO_NAMESPACE}" "${blockNodePod}" -c block-node-server --previous > block-node-prev.log 2>/dev/null || true
  else
    echo "No block node pod found in namespace ${SOLO_NAMESPACE}; skipping block node log dump."
  fi
  echo "------- END BLOCK NODE DUMP ------- (see 'Upload Logs to GitHub' step for download link)"
  printf "\r::endgroup::\n"

  cp relay.log rest.log importer.log port-forward.log grpc.log monitor.log "$HOME"/.solo/logs/ || true
  if [ -f importer-prev.log ]; then
    cp importer-prev.log "$HOME"/.solo/logs/ || true
  fi
   if [ -f block-node-prev.log ]; then
    cp block-node-prev.log "$HOME"/.solo/logs/ || true
  fi
  if [ -f block-node.log ]; then
    cp block-node.log "$HOME"/.solo/logs/ || true
  fi

  # sleep for a few seconds to give time for stdout to stream back in case it was called using nodejs
  sleep 5
  if [[ "$1" == "0" ]]; then
    echo "Script completed successfully."
    return 0
  else
    echo "An error occurred while running the script: $1"
    return 1
  fi
}

# Extract a version-like string from a TypeScript const declaration
#
# Usage:
#   extract_version <TARGET> <SOURCE_FILE>
#
# Arguments:
#   TARGET       TypeScript const name to extract (e.g., HEDERA_PLATFORM_VERSION)
#   SOURCE_FILE  Path to the TypeScript file to parse
#
# Examples:
#   extract_version PREV_BLOCK_NODE_VERSION version-test.ts
#   extract_version HEDERA_PLATFORM_VERSION version.ts
extract_version() {
  if [[ "$#" -ne 2 ]]; then
    echo "Usage: extract_version <TARGET> <SOURCE_FILE>" >&2
    return 1
  fi

  local TARGET="$1"
  local SOURCE_FILE="$2"

  if [[ ! -f "${SOURCE_FILE}" ]]; then
    echo "Source file not found: ${SOURCE_FILE}" >&2
    return 1
  fi

  local value
  value="$(awk -v target="${TARGET}" '
    BEGIN {
      RS = ";"
      value = ""
      declarationFound = 0
    }

    function extract_value(text,    idx, candidate, s, token, v) {
      idx = index(text, "||")
      if (idx > 0) {
        candidate = substr(text, idx + 2)
      } else {
        candidate = text
      }

      s = candidate
      v = ""
      while (match(s, /\047[^\047]*\047|\"[^\"]*\"/)) {
        token = substr(s, RSTART, RLENGTH)
        v = substr(token, 2, length(token) - 2)
        s = substr(s, RSTART + RLENGTH)
      }

      return v
    }

    {
      if ($0 ~ "(^|[[:space:]])(export[[:space:]]+)?const[[:space:]]+" target "([[:space:]]|:)" ) {
        declarationFound = 1
        value = extract_value($0)
        if (value != "") {
          print value
          exit
        }
      }
    }

    END {
      if (declarationFound == 0 || value == "") {
        exit 1
      }
    }
  ' "${SOURCE_FILE}" | head -n 1)"

  if [[ -z "${value}" ]]; then
    echo "Unable to extract value for target \"${TARGET}\" from ${SOURCE_FILE}" >&2
    return 1
  fi

  printf '%s' "${value}"
}

# Resolve the published release a migration test should start from
#
# Prefers the newest release on the same major.minor line as CURRENT_VERSION,
# falling back to the newest release on any line. Both candidates are required
# to be strictly older than CURRENT_VERSION, so the result is never the version
# under test nor a newer one. The npm "latest" dist-tag cannot be used for this:
# it points at the newest release across every line, which on a maintenance
# branch selects a newer release and makes the test migrate downwards into a
# config schema the older code cannot read.
#
# Usage:
#   resolve_prior_release <PACKAGE> <CURRENT_VERSION>
#
# Arguments:
#   PACKAGE          npm package name to query (e.g., @hashgraph/solo)
#   CURRENT_VERSION  version being built (e.g., 0.85.0)
#
# Examples:
#   resolve_prior_release @hashgraph/solo "$(jq -r '.version' package.json)"
resolve_prior_release() {
  if [[ "$#" -ne 2 ]]; then
    echo "Usage: resolve_prior_release <PACKAGE> <CURRENT_VERSION>" >&2
    return 1
  fi

  local PACKAGE="$1"
  local CURRENT_VERSION="$2"
  local RELEASE_LINE="${CURRENT_VERSION%.*}"

  local all_versions
  all_versions="$(curl -s "https://registry.npmjs.org/${PACKAGE}" \
    | jq -r '.versions // {} | keys[]' 2>/dev/null \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$')" || true

  if [[ -z "${all_versions}" ]]; then
    echo "Unable to list published versions for ${PACKAGE}" >&2
    return 1
  fi

  # Appending CURRENT_VERSION and cutting the version-sorted list at its first
  # occurrence leaves only strictly older releases, whether or not the current
  # version is itself published yet.
  local prior
  prior="$(printf '%s\n%s\n' \
    "$(printf '%s\n' "${all_versions}" | grep -E "^${RELEASE_LINE}\.")" \
    "${CURRENT_VERSION}" \
    | grep -v '^$' | sort -V \
    | awk -v current="${CURRENT_VERSION}" '$0 == current { exit } { print }' | tail -n 1)"

  if [[ -z "${prior}" ]]; then
    prior="$(printf '%s\n%s\n' "${all_versions}" "${CURRENT_VERSION}" \
      | grep -v '^$' | sort -V \
      | awk -v current="${CURRENT_VERSION}" '$0 == current { exit } { print }' | tail -n 1)"
  fi

  if [[ -z "${prior}" ]]; then
    echo "No published release of ${PACKAGE} older than ${CURRENT_VERSION} was found" >&2
    return 1
  fi

  printf '%s' "${prior}"
}

function get_latest_mirror_block_number ()
{
  local mirror_url="${1:-http://127.0.0.1:38081}"
  local response=""

  response=$(curl -sfS \
    -H 'Cache-Control: no-cache, no-store, must-revalidate' \
    -H 'Pragma: no-cache' \
    -H 'Expires: 0' \
    "${mirror_url}/api/v1/blocks?limit=1&order=desc" || true)

  node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
try {
  const data = JSON.parse(input);
  const value = Number(data.blocks?.[0]?.number);
  console.log(Number.isFinite(value) ? value : -1);
} catch {
  console.log(-1);
}
' <<< "${response}"
}

function wait_for_mirror_block_progress ()
{
  local label="${1}"
  local previous_block="${2:--1}"
  local required_new_blocks="${3:-3}"
  local max_attempts="${4:-120}"
  local sleep_seconds="${5:-2}"
  local latest_block=-1
  local minimum_block=$((previous_block + required_new_blocks))

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for mirror block progress (${label}), minimum block ${minimum_block}"
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    latest_block=$(get_latest_mirror_block_number)
    if [[ "${latest_block}" -ge "${minimum_block}" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Mirror block progress ready (${label}): latest block ${latest_block}"
      return 0
    fi

    echo "Mirror block progress not ready (${label}) [attempt=${attempt}/${max_attempts}, latest=${latest_block}, minimum=${minimum_block}]"
    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for mirror block progress (${label}); latest=${latest_block}, minimum=${minimum_block}"
  return 1
}

function wait_for_mirror_block_count_progress ()
{
  local label="${1}"
  local previous_block="${2:--1}"
  local required_new_blocks="${3:-1}"
  local max_attempts="${4:-90}"
  local sleep_seconds="${5:-2}"
  wait_for_mirror_block_progress "${label}" "${previous_block}" "${required_new_blocks}" "${max_attempts}" "${sleep_seconds}"
}

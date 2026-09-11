#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/helper.sh"

TEMP_ONE_SHOT_VALUES_FILE=""
TEMP_SOURCE_APPLICATION_PROPERTIES_FILE=""
TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE=""
TEMP_BN_UPGRADE_VALUES_FILE=""

collect_failure_diagnostics() {
  local rc="${1}"

  echo "::group::Failure diagnostics"
  echo "launch_network.sh failed with exit code ${rc}"

  if command -v npm &> /dev/null; then
    echo "Collecting Solo deployment diagnostics for ${SOLO_DEPLOYMENT}..."
    npm run solo -- deployment diagnostics all --deployment "${SOLO_DEPLOYMENT}" -q --dev || true
    echo "Solo diagnostics collection finished. Check ~/.solo/logs for downloaded artifacts."
  else
    echo "npm is not available; skipping Solo diagnostics collection"
  fi

  echo "::endgroup::"
}

on_exit() {
  local rc=$?

  if [[ -n "${RENDERED_KIND_CLUSTER_CONFIG_FILE:-}" && -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}" ]]; then
    rm -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
  fi


  if [[ -n "${TEMP_ONE_SHOT_VALUES_FILE:-}" && -f "${TEMP_ONE_SHOT_VALUES_FILE}" ]]; then
    rm -f "${TEMP_ONE_SHOT_VALUES_FILE}"
  fi

  if [[ -n "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE:-}" && -f "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" ]]; then
    rm -f "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"
  fi

  if [[ -n "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE:-}" && -f "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" ]]; then
    rm -f "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
  fi

  if [[ -n "${TEMP_BN_UPGRADE_VALUES_FILE:-}" && -f "${TEMP_BN_UPGRADE_VALUES_FILE}" ]]; then
    rm -f "${TEMP_BN_UPGRADE_VALUES_FILE}"
  fi

  if [[ ${rc} -ne 0 ]]; then
    echo "Test failed, current port forward process: "
    ps -ef | grep port-forward
    collect_failure_diagnostics "${rc}"
  fi

  exit "${rc}"
}

trap on_exit EXIT

set_application_property() {
  local file_path="${1}"
  local key="${2}"
  local value="${3}"

  if grep -q "^${key}=" "${file_path}"; then
    sed -i.bak "s/^${key}=.*/${key}=${value}/" "${file_path}"
  else
    echo "${key}=${value}" >> "${file_path}"
  fi
  rm -f "${file_path}.bak"
}

add_application_properties_overwrite_marker() {
  local file_path="${1}"

  if grep -q '^# SOLO_ENABLE_OVERWRITE=true$' "${file_path}"; then
    return 0
  fi

  local marked_file
  marked_file="$(mktemp -t solo-application-properties-overwrite-XXXX.properties)"
  printf '# SOLO_ENABLE_OVERWRITE=true\n' > "${marked_file}"
  cat "${file_path}" >> "${marked_file}"
  mv "${marked_file}" "${file_path}"
}

extract_required_test_version() {
  local variable_name="${1}"
  local version_value=""

  if ! version_value="$(extract_version "${variable_name}" version-test.ts)"; then
    echo "${variable_name} is empty, please check version-test.ts" >&2
    return 1
  fi

  printf '%s' "${version_value}"
}


# Function to save current service ClusterIPs
save_cluster_ips() {
  local namespace="${1}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Saving current ClusterIPs..."
  NODE1_IP=$(kubectl get svc -n "${namespace}" network-node1-svc -o jsonpath='{.spec.clusterIP}')
  NODE2_IP=$(kubectl get svc -n "${namespace}" network-node2-svc -o jsonpath='{.spec.clusterIP}')
  echo "  node1: ${NODE1_IP}"
  echo "  node2: ${NODE2_IP}"
}

# Function to restore service ClusterIPs using saved values
restore_cluster_ips() {
  local namespace="${1}"
  local saved_node1_ip="${2}"
  local saved_node2_ip="${3}"

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking if ClusterIPs changed..."
  local current_node1_ip=$(kubectl get svc -n "${namespace}" network-node1-svc -o jsonpath='{.spec.clusterIP}')
  local current_node2_ip=$(kubectl get svc -n "${namespace}" network-node2-svc -o jsonpath='{.spec.clusterIP}')

  if [[ "${saved_node1_ip}" != "${current_node1_ip}" ]] || [[ "${saved_node2_ip}" != "${current_node2_ip}" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ClusterIPs changed! Restoring old IPs..."
    echo "  node1: ${current_node1_ip} -> ${saved_node1_ip}"
    echo "  node2: ${current_node2_ip} -> ${saved_node2_ip}"

    # Save service definitions before deletion
    kubectl get svc -n "${namespace}" network-node1-svc -o yaml > /tmp/node1-svc-original.yaml
    kubectl get svc -n "${namespace}" network-node2-svc -o yaml > /tmp/node2-svc-original.yaml

    # Modify YAML to use preserved ClusterIPs and remove immutable/server-managed fields
    yq eval ".spec.clusterIP = \"${saved_node1_ip}\" | .spec.clusterIPs[0] = \"${saved_node1_ip}\" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .status)" \
      /tmp/node1-svc-original.yaml > /tmp/node1-svc-patched.yaml

    yq eval ".spec.clusterIP = \"${saved_node2_ip}\" | .spec.clusterIPs[0] = \"${saved_node2_ip}\" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .status)" \
      /tmp/node2-svc-original.yaml > /tmp/node2-svc-patched.yaml

    # Delete services and recreate with preserved IPs
    kubectl delete svc -n "${namespace}" network-node1-svc network-node2-svc
    kubectl apply -f /tmp/node1-svc-patched.yaml
    kubectl apply -f /tmp/node2-svc-patched.yaml

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Verified restored IPs:"
    kubectl get svc -n "${namespace}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ClusterIPs unchanged, no restoration needed"
  fi
}

# Function to display service IPs
show_service_ips() {
  local namespace="${1}"
  local label="${2}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs ${label}:"
  kubectl get svc -n "${namespace}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
}

get_latest_mirror_block_number() {
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

wait_for_mirror_block_progress() {
  local label="${1}"
  local previous_block="${2:--1}"
  local max_attempts="${3:-90}"
  local sleep_seconds="${4:-2}"
  local latest_block=-1
  local minimum_block=$((previous_block + 1))

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for mirror block ingestion (${label}), minimum block ${minimum_block}" >&2
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    latest_block=$(get_latest_mirror_block_number)
    if [[ "${latest_block}" -ge "${minimum_block}" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Mirror block ingestion ready (${label}): latest block ${latest_block}" >&2
      echo "${latest_block}"
      return 0
    fi

    echo "Mirror block ingestion not ready (${label}) [attempt=${attempt}/${max_attempts}, latest=${latest_block}, minimum=${minimum_block}]" >&2
    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for mirror block ingestion (${label}); latest=${latest_block}, minimum=${minimum_block}" >&2
  return 1
}

wait_for_mirror_block_count_progress() {
  local label="${1}"
  local previous_block="${2:--1}"
  local required_new_blocks="${3:-1}"
  local max_attempts="${4:-90}"
  local sleep_seconds="${5:-2}"
  local minimum_previous_block=$((previous_block + required_new_blocks - 1))

  wait_for_mirror_block_progress "${label}" "${minimum_previous_block}" "${max_attempts}" "${sleep_seconds}"
}

# Restart relay after upgrade and refresh port-forwards.
refresh_relay_network_config() {
  local namespace="${1}"
  local deployment="${2}"

  echo "[RELAY_RECOVERY] Relay already upgraded; restarting relay deployment to reset SDK node health state"
  kubectl rollout restart deployment/relay-1 deployment/relay-1-ws -n "${namespace}" 2>/dev/null || true

  echo "[RELAY_STABILITY] Waiting for relay deployments to report rolled out"
  kubectl rollout status deployment/relay-1 -n "${namespace}" --timeout=4m --context kind-solo-e2e || return 1
  kubectl rollout status deployment/relay-1-ws -n "${namespace}" --timeout=4m --context kind-solo-e2e || return 1

  echo "[RELAY_STABILITY] Refreshing port-forwards for deployment ${deployment}"
  npm run solo -- deployment refresh port-forwards --deployment "${deployment}"
}

# Resolve the active importer pod deterministically.
# Prefer running pods selected by importer component label, then fall back to name matching.
get_active_importer_pod() {
  local namespace="${1}"
  local importerPod=""

  importerPod=$(kubectl get pods -n "${namespace}" \
    -l 'app.kubernetes.io/component=importer' \
    --field-selector=status.phase=Running \
    --sort-by=.metadata.creationTimestamp \
    -o name 2>/dev/null | tail -n 1 | sed 's#pod/##' || true)

  if [[ -z "${importerPod}" ]]; then
    importerPod=$(kubectl get pods -n "${namespace}" --field-selector=status.phase=Running \
      -o custom-columns=NAME:.metadata.name --no-headers 2>/dev/null | grep 'importer' | tail -n 1 || true)
  fi

  if [[ -z "${importerPod}" ]]; then
    importerPod=$(kubectl get pods -n "${namespace}" -o name 2>/dev/null | grep 'importer' | head -n 1 | sed 's#pod/##' || true)
  fi

  echo "${importerPod}"
}

# Function to collect targeted diagnostics around the freeze/restart boundary where
# mirror importer hash-chain mismatches are most likely to occur.
collect_restart_boundary_diagnostics() {
  local namespace="${1}"
  local networkPods

  echo "::group::Restart boundary diagnostics"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Collecting CN/MN boundary diagnostics in namespace ${namespace}"

  networkPods=$(kubectl get pods -n "${namespace}" -l 'solo.hedera.com/type=network-node' -o name | sed 's#pod/##' || true)
  if [[ -z "${networkPods}" ]]; then
    echo "[BOUNDARY_DIAG] No network-node pods found in namespace ${namespace}"
  else
    while IFS= read -r podName; do
      [[ -z "${podName}" ]] && continue
      echo ""
      echo "[BOUNDARY_DIAG] Node pod: ${podName}"

      # Show restart/state loading markers from swirlds.log to confirm whether the node
      # resumed from saved state and whether empty rounds were observed.
      kubectl exec -n "${namespace}" "${podName}" -- bash -lc '
        logFile="/opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log"
        if [[ -f "${logFile}" ]]; then
          echo "  swirlds.log restart markers:"
          grep -E "StartupStateUtils|Ignoring empty consensus round|Platform has loaded a saved state|Loading signed state from disk" "${logFile}" | tail -n 30 || true
        else
          echo "  swirlds.log not found at ${logFile}"
        fi
      ' || true

      # Show newest local record/sig files produced by this node. This helps correlate
      # whether a boundary file existed on-node before uploader/importer processing.
      kubectl exec -n "${namespace}" "${podName}" -- bash -lc '
        shopt -s nullglob
        mapfile -t recordDirs < <(find /opt/hgcapp/services-hedera/HapiApp2.0/output -maxdepth 1 -type d -name "record0.0.*" | sort)
        if [[ ${#recordDirs[@]} -eq 0 ]]; then
          echo "  No record0.0.* directories found under output/"
          exit 0
        fi
        for dir in "${recordDirs[@]}"; do
          echo "  Recent files in ${dir}:"
          ls -1t "${dir}"/*.rcd.gz "${dir}"/*.rcd_sig 2>/dev/null | head -n 12 || true
        done
      ' || true
    done <<< "${networkPods}"
  fi

  inspect_importer_boundary_mismatch "${namespace}" "${networkPods}"
  echo "::endgroup::"
}

# Function to inspect importer mismatch details and correlate the first mismatch file
# with files present on consensus-node local disks.
inspect_importer_boundary_mismatch() {
  local namespace="${1}"
  local networkPods="${2}"
  local importerPod
  local mismatchLine
  local mismatchFile
  local mismatchSig
  local lastAcceptedLine
  local foundRecord=0
  local foundSig=0

  importerPod=$(get_active_importer_pod "${namespace}")
  if [[ -z "${importerPod}" ]]; then
    echo "[BOUNDARY_DIAG] No importer pod found in namespace ${namespace}"
    return 0
  fi

  echo ""
  echo "[BOUNDARY_DIAG] Importer pod: ${importerPod}"

  mismatchLine=$(kubectl logs -n "${namespace}" "${importerPod}" --since=60m 2>/dev/null | grep -m1 "Running hash mismatch for file" || true)
  lastAcceptedLine=$(kubectl logs -n "${namespace}" "${importerPod}" --since=60m 2>/dev/null | grep -m1 "Failed processing signatures after" || true)

  if [[ -z "${mismatchLine}" ]]; then
    echo "[BOUNDARY_DIAG] No running-hash mismatch line found in importer logs (last 60m)"
    return 0
  fi

  echo "[BOUNDARY_DIAG] First mismatch line: ${mismatchLine}"
  if [[ -n "${lastAcceptedLine}" ]]; then
    echo "[BOUNDARY_DIAG] Last accepted pointer line: ${lastAcceptedLine}"
  fi

  # Parse the .rcd.gz filename without trailing punctuation from log text:
  # "... Running hash mismatch for file <name>. Expected = ..."
  mismatchFile=$(echo "${mismatchLine}" | sed -nE "s/.*Running hash mismatch for file ([^ ]+)\\. Expected.*/\\1/p")
  if [[ -z "${mismatchFile}" ]]; then
    mismatchFile=$(echo "${mismatchLine}" | sed -nE "s/.*Running hash mismatch for file ([^ ]+).*/\\1/p" | sed 's/[[:punct:]]$//')
  fi
  if [[ -z "${mismatchFile}" ]]; then
    echo "[BOUNDARY_DIAG] Could not parse mismatch filename from importer log line"
    return 0
  fi
  mismatchSig="${mismatchFile%.rcd.gz}.rcd_sig"

  echo "[BOUNDARY_DIAG] Parsed mismatch data file: ${mismatchFile}"
  echo "[BOUNDARY_DIAG] Parsed mismatch signature file: ${mismatchSig}"

  if [[ -z "${networkPods}" ]]; then
    return 0
  fi

  while IFS= read -r podName; do
    [[ -z "${podName}" ]] && continue
    if kubectl exec -n "${namespace}" "${podName}" -- bash -lc "find /opt/hgcapp/services-hedera/HapiApp2.0/output -type f -name '${mismatchFile}' -print -quit" 2>/dev/null | grep -q "${mismatchFile}"; then
      echo "[BOUNDARY_DIAG] Found ${mismatchFile} on ${podName}"
      foundRecord=1
    fi
    if kubectl exec -n "${namespace}" "${podName}" -- bash -lc "find /opt/hgcapp/services-hedera/HapiApp2.0/output -type f -name '${mismatchSig}' -print -quit" 2>/dev/null | grep -q "${mismatchSig}"; then
      echo "[BOUNDARY_DIAG] Found ${mismatchSig} on ${podName}"
      foundSig=1
    fi
  done <<< "${networkPods}"

  if [[ ${foundRecord} -eq 0 ]]; then
    echo "[BOUNDARY_DIAG] WARNING: ${mismatchFile} not found on any CN pod local output"
  fi
  if [[ ${foundSig} -eq 0 ]]; then
    echo "[BOUNDARY_DIAG] WARNING: ${mismatchSig} not found on any CN pod local output"
  fi
}

# Function to realign mirror importer hash chain in postgres to the first mismatched
# record-file previous hash reported by importer logs.
# Temporary workaround tracked in https://github.com/hiero-ledger/solo/issues/4492
# for https://github.com/hiero-ledger/hiero-consensus-node/issues/25486.
#
# We must not set hash='' because newer importer parser paths still validate and will fail
# with "Expected = , Actual = ...". Instead we set the last DB hash to the mismatch line's
# "Actual" running-hash value to bridge the restart boundary deterministically.
reset_importer_hash_chain_for_upgrade() {
  local namespace="${1}"

  echo ""
  echo "[IMPORTER_RESET] Resetting mirror importer hash chain for upgrade boundary..."

  # Find the postgres pod via label
  local postgresPod
  postgresPod=$(kubectl get pod -n "${namespace}" -l 'app.kubernetes.io/name=postgres' \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

  if [[ -z "${postgresPod}" ]]; then
    echo "[IMPORTER_RESET] Could not find postgres pod (label: app.kubernetes.io/name=postgres), skipping"
    return 0
  fi

  echo "[IMPORTER_RESET] Found postgres pod: ${postgresPod}"

  # Get the postgres superuser password from the Kubernetes secret
  local pgPassword
  pgPassword=$(kubectl get secret -n "${namespace}" solo-shared-resources-passwords \
    -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || echo "")

  if [[ -z "${pgPassword}" ]]; then
    echo "[IMPORTER_RESET] Could not get postgres password from secret solo-shared-resources-passwords, skipping"
    return 0
  fi

  # Show current state for diagnostics
  local currentHash
  currentHash=$(kubectl exec -i -n "${namespace}" "${postgresPod}" -c postgresql -- sh <<EOF
set -euo pipefail
cat > /tmp/.solo-pgpass <<'PGPASS'
localhost:5432:mirror_node:postgres:${pgPassword}
PGPASS
chmod 600 /tmp/.solo-pgpass
PGPASSFILE=/tmp/.solo-pgpass psql -U postgres -d mirror_node -t -A \
  -c "SELECT hash FROM record_file ORDER BY consensus_end DESC LIMIT 1;"
rm -f /tmp/.solo-pgpass
EOF
  ) || currentHash="query_failed"
  echo "[IMPORTER_RESET] Current last record_file hash: ${currentHash:-none}"

  local importerPod
  local mismatchLine
  local mismatchActualHash
  importerPod=$(get_active_importer_pod "${namespace}")
  if [[ -z "${importerPod}" ]]; then
    echo "[IMPORTER_RESET] Could not find importer pod in namespace ${namespace}, skipping"
    return 0
  fi

  mismatchLine=$(kubectl logs -n "${namespace}" "${importerPod}" --since=90m 2>/dev/null | grep -m1 "Running hash mismatch for file" || true)
  mismatchActualHash=$(echo "${mismatchLine}" | sed -nE 's/.*Actual = ([0-9a-fA-F]+).*/\1/p')

  if [[ -z "${mismatchActualHash}" ]]; then
    echo "[IMPORTER_RESET] No mismatch line with parsable Actual hash found; skipping DB hash rewrite"
    return 0
  fi
  if ! [[ "${mismatchActualHash}" =~ ^[0-9a-fA-F]{96}$ ]]; then
    echo "[IMPORTER_RESET] Parsed mismatch hash is invalid (expected 96 hex chars); skipping DB hash rewrite"
    return 0
  fi

  echo "[IMPORTER_RESET] Using mismatch Actual hash as bridge value: ${mismatchActualHash}"

  local sqlResult
  sqlResult=$(kubectl exec -i -n "${namespace}" "${postgresPod}" -c postgresql -- sh <<EOF
set -euo pipefail
cat > /tmp/.solo-pgpass <<'PGPASS'
localhost:5432:mirror_node:postgres:${pgPassword}
PGPASS
chmod 600 /tmp/.solo-pgpass
PGPASSFILE=/tmp/.solo-pgpass psql -v ON_ERROR_STOP=1 -U postgres -d mirror_node -t -A \
  -v mismatch_hash="${mismatchActualHash}" <<'SQL'
UPDATE record_file
SET hash = :'mismatch_hash'
WHERE consensus_end = (SELECT MAX(consensus_end) FROM record_file);
SQL
rm -f /tmp/.solo-pgpass
EOF
  ) || sqlResult="SQL_FAILED"

  if [[ "${sqlResult}" == *"SQL_FAILED"* ]] || echo "${sqlResult}" | grep -qi "error"; then
    echo "[IMPORTER_RESET] WARNING: Hash chain reset SQL failed: ${sqlResult}"
    echo "[IMPORTER_RESET] Mirror importer may still experience hash chain mismatch after upgrade"
  else
    echo "[IMPORTER_RESET] Hash chain reset completed (${sqlResult} row updated)"
    echo "[IMPORTER_RESET] Importer last hash realigned to mismatch boundary hash"
  fi
  echo ""
}

# Function to check whether importer currently reports the known post-restart hash mismatch.
importer_hash_mismatch_detected() {
  local namespace="${1}"
  local sinceWindow="${2:-30m}"
  local importerPod

  importerPod=$(get_active_importer_pod "${namespace}")
  if [[ -z "${importerPod}" ]]; then
    echo "[IMPORTER_RECOVERY] No importer pod found in namespace ${namespace}"
    return 1
  fi

  if kubectl logs -n "${namespace}" "${importerPod}" --since="${sinceWindow}" 2>/dev/null | \
    grep -Eq "Running hash mismatch for file|None of the data files could be verified"; then
    return 0
  fi
  return 1
}

# Function to restart importer deployments after hash-chain reset.
restart_importer_pods_for_recovery() {
  local namespace="${1}"
  local importerDeployments

  importerDeployments=$(kubectl get deployment -n "${namespace}" -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-importer$' || true)
  if [[ -z "${importerDeployments}" ]]; then
    importerDeployments=$(kubectl get deployment -n "${namespace}" -o name | grep 'importer' || true)
  fi
  if [[ -z "${importerDeployments}" ]]; then
    echo "[IMPORTER_RECOVERY] No importer deployment found to restart in namespace ${namespace}"
    return 0
  fi

  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart -n "${namespace}" "${deploymentName}"
    kubectl rollout status -n "${namespace}" "${deploymentName}" --timeout=4m || true
  done <<< "${importerDeployments}"
}

# Function to apply one-shot importer hash-chain recovery after CN restart.
auto_recover_importer_hash_chain() {
  local namespace="${1}"
  echo "[IMPORTER_RECOVERY] Applying preventive importer hash-chain recovery for migration boundary"
  reset_importer_hash_chain_for_upgrade "${namespace}"
  restart_importer_pods_for_recovery "${namespace}"

  if importer_hash_mismatch_detected "${namespace}" "10m"; then
    echo "[IMPORTER_RECOVERY] WARNING: mismatch still present after one-shot recovery"
  else
    echo "[IMPORTER_RECOVERY] Recovery completed; mismatch not observed in recent importer logs"
  fi
}

# Dumps recent BN log lines at a labelled checkpoint. Omits the very verbose FINE-level
# messages (per-item appends, ACK/SKIP responses) and keeps INFO/WARN/ERROR plus the FINE
# messages that carry actionable state: block completion, RESEND, handler connect/disconnect.
# Call at each major upgrade step so post-mortem analysis has a BN-state timeline.
dump_bn_log() {
  local label="${1}"
  echo "=== [BN_DIAG] ${label} — $(date '+%Y-%m-%d %H:%M:%S') ==="
  local bnPod
  bnPod=$(kubectl get pods -n "${SOLO_NAMESPACE}" \
    --field-selector=status.phase=Running \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null \
    | grep '^block-node' | head -1 || echo "")
  if [[ -z "${bnPod}" ]]; then
    bnPod=$(kubectl get pods -n "${SOLO_NAMESPACE}" \
      -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null \
      | grep '^block-node' | head -1 || echo "")
  fi
  if [[ -z "${bnPod}" ]]; then
    echo "(no block-node pod found in namespace ${SOLO_NAMESPACE})"
  else
    echo "BN pod: ${bnPod}"
    kubectl logs -n "${SOLO_NAMESPACE}" "${bnPod}" --tail=400 2>/dev/null \
      | grep -v "FINE.*Appending\|FINE.*sendResponse\|FINE.*Started new block verif\|FINE.*Sending block verif\|FINE.*Sending block persisted\|FINE.*sendPublisherStatus\|FINE.*registerNoBackpressure\|FINE.*Finished verification\|FINE.*Persistence Handle verif\|FINE.*sendBlockVerif\|FINE.*sendBlockPersisted\|FINE.*Sending publisher status" \
      | tail -80 || echo "(kubectl logs failed)"
  fi
  echo "=== [BN_DIAG end] ==="
}

fromSoloVersion="${1}"
toConsensusNodeVersion="${2}"
if [[ -z "${fromSoloVersion}" ]]; then
  echo "Usage: $0 <fromSoloVersion> [toConsensusNodeVersion]"
  exit 1
fi

# check if yq is installed
if ! command -v yq &> /dev/null
then
    echo "yq could not be found, please install it first"
    exit 1
fi

echo "::group::Prerequisites"
expectedSoloVersion="${fromSoloVersion#v}"
installedSoloVersion=""

if command -v solo &> /dev/null; then
  installedSoloVersion=$(solo --version 2>/dev/null | grep -Eo '([0-9]+\.){2}[0-9]+' | head -n 1 || true)
  installedSoloVersion="${installedSoloVersion#v}"
fi

if [[ -n "${installedSoloVersion}" && "${installedSoloVersion}" == "${expectedSoloVersion}" ]]; then
  echo "Solo version ${installedSoloVersion} already installed, skipping npm install"
else
  SOLO_NO_CACHE=true npm install -g @hashgraph/solo@"${fromSoloVersion}" --force
fi

solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=one-shot
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=one-shot
export SOLO_LOG_LEVEL=debug
PREV_BLOCK_VERSION="$(extract_required_test_version PREV_BLOCK_NODE_VERSION)"
PREV_EXPLORER_VERSION="$(extract_required_test_version PREV_EXPLORER_VERSION)"
PREV_MIRROR_VERSION="$(extract_required_test_version PREV_MIRROR_NODE_VERSION)"
PREV_RELAY_VERSION="$(extract_required_test_version PREV_RELAY_VERSION)"
export PREV_BLOCK_VERSION
export PREV_EXPLORER_VERSION
export PREV_MIRROR_VERSION
export PREV_RELAY_VERSION

KIND_CLUSTER_CONFIG_FILE="${KIND_CLUSTER_CONFIG_FILE:-.github/workflows/script/kind-config.yaml}"
KIND_CONFIG_RENDERER=".github/workflows/script/render_kind_config.sh"
RENDERED_KIND_CLUSTER_CONFIG_FILE=""

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
if [[ -f "${KIND_CLUSTER_CONFIG_FILE}" ]]; then
  if [[ -x "${KIND_CONFIG_RENDERER}" && -n "${KIND_DOCKER_REGISTRY_MIRRORS:-}" ]]; then
    RENDERED_KIND_CLUSTER_CONFIG_FILE="$(mktemp -t kind-config-XXXX.yaml)"
    "${KIND_CONFIG_RENDERER}" "${KIND_CLUSTER_CONFIG_FILE}" "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    echo "Using rendered kind config file: ${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    rm -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
  else
    echo "Using kind config file: ${KIND_CLUSTER_CONFIG_FILE}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${KIND_CLUSTER_CONFIG_FILE}"
  fi
else
  echo "kind config file not found: ${KIND_CLUSTER_CONFIG_FILE}; creating cluster without custom registry mirror config."
  kind create cluster -n "${SOLO_CLUSTER_NAME}"
fi

rm -rf ~/.solo/*
echo "::endgroup::"

echo "::group::Launch solo using released Solo version ${fromSoloVersion}"

if [[ -z "${toConsensusNodeVersion}" ]]; then
  export TO_CONSENSUS_NODE_VERSION=$(extract_version TEST_UPGRADE_TO_VERSION version-test.ts)
  if [[ -z "${TO_CONSENSUS_NODE_VERSION}" ]]; then
    echo "TO_CONSENSUS_NODE_VERSION is empty, please check version-test.ts for TEST_UPGRADE_TO_VERSION"
    exit 1
  fi
else
  export TO_CONSENSUS_NODE_VERSION="${toConsensusNodeVersion}"
fi

export FROM_CONSENSUS_NODE_VERSION=$(extract_version TEST_UPGRADE_FROM_VERSION version-test.ts)
if [[ -z "${FROM_CONSENSUS_NODE_VERSION}" ]]; then
  echo "FROM_CONSENSUS_NODE_VERSION is empty, please check version-test.ts for TEST_UPGRADE_FROM_VERSION"
  exit 1
fi

echo "Consensus Node Version (from): ${FROM_CONSENSUS_NODE_VERSION}"
echo "Consensus Node Version (to): ${TO_CONSENSUS_NODE_VERSION}"
echo "Block Node Version (previous): ${PREV_BLOCK_VERSION}"
echo "Mirror Node Version (previous): ${PREV_MIRROR_VERSION}"
echo "Explorer Version (previous): ${PREV_EXPLORER_VERSION}"
echo "Relay Version (previous): ${PREV_RELAY_VERSION}"

TEMP_ONE_SHOT_VALUES_FILE="$(mktemp -t falcon-values-migration-XXXX.yaml)"
TEMP_SOURCE_APPLICATION_PROPERTIES_FILE="$(mktemp -t source-application-properties-XXXX.properties)"

cp resources/templates/application.properties "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"
add_application_properties_overwrite_marker "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"

CURRENT_BLOCK_VERSION="$(extract_version BLOCK_NODE_VERSION version.ts)"
CURRENT_BLOCK_VERSION="${CURRENT_BLOCK_VERSION#v}"
PREV_BLOCK_VERSION_NO_V="${PREV_BLOCK_VERSION#v}"

# TEMPORARY WORKAROUND:
#   Keep the migration source network in BOTH mode while hiero-block-node#3150 is open.
#   Pure BLOCKS mode makes mirror importer depend entirely on BN live-subscriber streaming.
#   That path can send batches starting with ROUND_HEADER, causing mirror to reconnect and
#   contract-result ingestion to stall. BOTH keeps native block streaming enabled for BN while
#   also preserving record streams/MinIO for mirror smoke coverage.
MIGRATION_BLOCK_STREAM_MODE="BOTH"

set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamMode" "${MIGRATION_BLOCK_STREAM_MODE}"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamWrappedRecordBlocks" "false"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.writerMode" "FILE_AND_GRPC"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.buffer.isBufferPersistenceEnabled" "true"
# Keep enough blocks so the BN pod replacement (50s) + gRPC reconnect delay still finds block 96
# in CN's in-memory buffer. Default 150 is too small: at 2s/block CN evicts block 96 after ~300s.
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.buffer.maxBlocks" "1000"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockNode.wantedBlockExpirationMillis" "60000"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.hintsEnabled" "true"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.historyEnabled" "true"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.forceMockSignatures" "false"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.wrapsEnabled" "true"
chmod 644 "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"

cat > "${TEMP_ONE_SHOT_VALUES_FILE}" <<EOF
# Generated for migration workflow launch.
network:
  --pvcs: true
  --consensus-node-version: "${FROM_CONSENSUS_NODE_VERSION}"
  --application-properties: "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"
  --tss: true

setup:
  --consensus-node-version: "${FROM_CONSENSUS_NODE_VERSION}"
EOF

cat >> "${TEMP_ONE_SHOT_VALUES_FILE}" <<EOF

mirrorNode:
  --mirror-node-version: "${PREV_MIRROR_VERSION}"

relayNode:
  --relay-release: "${PREV_RELAY_VERSION}"

explorerNode:
  --explorer-version: "${PREV_EXPLORER_VERSION}"
EOF

# TEMPORARY WORKAROUND:
#   Do not let released Solo 0.83.0 deploy the source network in block-node one-shot mode.
#   That released one-shot path forces MinIO and record uploaders off for CN >= v0.74.0, even
#   when this migration explicitly runs the source CN in BOTH mode. If mirror is forced back to
#   record import afterward, the importer has no MinIO/record source and relay never becomes ready.
#   Deploy the source CN/mirror/relay with records first, then add the previous BN with current
#   Solo below so the BN upgrade path is still covered while mirror smoke avoids BN #3150.
export ONE_SHOT_WITH_BLOCK_NODE=false
export BLOCK_STREAM_STREAM_MODE="${MIGRATION_BLOCK_STREAM_MODE}"
export BLOCK_STREAM_WRITER_MODE="FILE_AND_GRPC"
export DISABLE_IMPORTER_SPRING_PROFILES="true"

solo one-shot falcon deploy \
  --num-consensus-nodes 2 \
  --consensus-node-version "${FROM_CONSENSUS_NODE_VERSION}" \
  --values-file "${TEMP_ONE_SHOT_VALUES_FILE}" \
  --no-parallel-deploy

SKIP_IMPORTER_CHECK=true
.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"

wait_for_mirror_block_progress "source deployment after one-shot" -1 1 90 2 > /dev/null
source_block_after_one_shot="$(get_latest_mirror_block_number)"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Source mirror block before consensus upgrade: ${source_block_after_one_shot}"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Deploying source block node ${PREV_BLOCK_VERSION_NO_V} after record-backed one-shot deploy"
npm run solo -- block node add \
  --deployment "${SOLO_DEPLOYMENT}" \
  --block-node-version "${PREV_BLOCK_VERSION_NO_V}" \
  --block-node-tss-overlay \
  -q --dev
echo "$(date '+%Y-%m-%d %H:%M:%S') - Source block node ${PREV_BLOCK_VERSION_NO_V} deployed"
dump_bn_log "after source BN add"

echo "::endgroup::"


echo "::group::Consensus Node Upgrade Decision"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before consensus node upgrade decision"
ps -ef |grep port-forward

echo "Block node version: source=${PREV_BLOCK_VERSION_NO_V}, target=${CURRENT_BLOCK_VERSION}"
echo "Upgrade to Consensus Node Version: ${TO_CONSENSUS_NODE_VERSION}"

# TEMPORARY BYPASS:
#   CN upgrade is disabled in this migration test until hiero-consensus-node#26498 is fixed.
#   Current CN FREEZE_UPGRADE can reach FREEZE_COMPLETE while the freeze-boundary block is only
#   partially delivered to BN. CN v0.76.1 then resumes at N+1 instead of replaying N, leaving
#   mirror permanently stuck at N-1 because block N cannot be provided by BN.
#
#   Keep the CN-upgrade code below this flag so the test can be restored once CN guarantees
#   boundary block continuity or exposes a deterministic final-block-flushed signal for Solo.
SKIP_CONSENSUS_NODE_UPGRADE_UNTIL_CN_26498_FIXED=true

# BN upgrade is enabled while smoke tests use record-stream import. BN #3150 still affects the
# mirror BN live-subscriber path, so the migration smoke checks avoid that path by keeping mirror
# on the record-stream profile. The previous BN is added after the prior one-shot deploy because
# released Solo 0.83.0 disables MinIO/record uploaders when block-node one-shot mode is active for
# CN >= v0.74.0.
SKIP_BLOCK_NODE_UPGRADE_UNTIL_BN_3150_FIXED=false

# Strategy while the bypass is active:
#  1. Source deploy — deploy CN/mirror/relay with records/MinIO, smoke it, then add previous BN
#                     with current Solo for component upgrade coverage.
#  2. BN upgrade — upgrade BN while CN source version keeps running; mirror smoke imports records
#                  so BN #3150 does not block REST/contract-result ingestion.
#  3. Source stream stabilise — poll until mirror advances 3+ blocks via record import, then
#                              wait 120 s more. BN remains deployed but smoke does not depend on it.
#  4. Skip CN upgrade — leave consensus nodes on the source version and continue covering
#                      Solo/component migration behavior until CN issue #26498 is fixed.

# Step 1: Upgrade BN while CN source version is running, unless the BN bypass is re-enabled.
ACTIVE_BLOCK_NODE_VERSION="${PREV_BLOCK_VERSION_NO_V}"
if [[ "${SKIP_BLOCK_NODE_UPGRADE_UNTIL_BN_3150_FIXED}" == "true" ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - TEMPORARILY skipping BN upgrade to ${CURRENT_BLOCK_VERSION}"
  echo "Reason: hiero-block-node#3150 can make mirror importer reject live-stream batches starting with ROUND_HEADER."
  echo "Block node remains on ${PREV_BLOCK_VERSION_NO_V}; continuing component migration coverage."
  dump_bn_log "BN upgrade skipped due to hiero-block-node#3150"
elif [[ "${PREV_BLOCK_VERSION_NO_V}" != "${CURRENT_BLOCK_VERSION}" ]]; then
  TEMP_BN_UPGRADE_VALUES_FILE="$(mktemp -t bn-upgrade-values-XXXX.yaml)"
  cat > "${TEMP_BN_UPGRADE_VALUES_FILE}" <<'VALS'
blockNode:
  config:
    # TEMPORARY WORKAROUND:
    #   BN v0.38.1 can send a live stream batch starting with ROUND_HEADER when mirror
    #   reconnects mid-block (hiero-block-node#3150). Mirror v0.159.0 rejects that
    #   stream shape with "Incorrect first block item case ROUND_HEADER", reconnects
    #   rapidly, and contract-result ingestion can stall long enough for smoke tests
    #   to time out. Keep this migration-only buffer/HTTP2 mitigation until BN fixes
    #   the subscriber stream boundary behavior.
    SERVER_HTTP2_MAX_RAPID_RESETS: "500"
    MESSAGING_BLOCK_ITEM_QUEUE_SIZE: "65536"
  initContainers:
    - name: init-storage-dirs
      image: busybox:1.36.1
      command:
        - sh
        - -c
        - |
          mkdir -p /application-state-pvc && \
          chown 2000:2000 /application-state-pvc && \
          chmod 700 /application-state-pvc && \
          mkdir -p /archive-pvc/archive-data && \
          chown 2000:2000 /archive-pvc/archive-data && \
          chmod 700 /archive-pvc/archive-data && \
          mkdir -p /live-pvc/live-data && \
          chown 2000:2000 /live-pvc/live-data && \
          chmod 700 /live-pvc/live-data
      volumeMounts:
        - name: application-state-storage
          mountPath: /application-state-pvc
        - name: archive-storage
          mountPath: /archive-pvc
        - name: live-storage
          mountPath: /live-pvc
        - name: logging-storage
          mountPath: /logging-pvc
    - name: cleanup-block-ranges
      image: busybox:1.36.1
      command:
        - rm
        - -f
        - /application-state-pvc/block-ranges.json
      volumeMounts:
        - name: application-state-storage
          mountPath: /application-state-pvc
VALS
  npm run solo -- block node upgrade \
    --deployment "${SOLO_DEPLOYMENT}" \
    --values-file "${TEMP_BN_UPGRADE_VALUES_FILE}"
  rm -f "${TEMP_BN_UPGRADE_VALUES_FILE}"
  echo "BN ${CURRENT_BLOCK_VERSION} installed"
  ACTIVE_BLOCK_NODE_VERSION="${CURRENT_BLOCK_VERSION}"
  dump_bn_log "after BN upgrade"
fi

# Step 2: Wait for source streaming to stabilise before the CN upgrade decision.
#   Poll until mirror receives 3 new blocks via record import, then wait 120 s more. If the
#   temporary bypasses are turned off later, this also gives BN a stable window before CN v0.75
#   makes its first connection attempt.
bn_stabilize_start_block="$(get_latest_mirror_block_number)"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for source stream with BN ${ACTIVE_BLOCK_NODE_VERSION} deployed to stabilise (mirror at block ${bn_stabilize_start_block})"
wait_for_mirror_block_count_progress "source stream stabilise before CN upgrade decision" "${bn_stabilize_start_block}" 3 120 5
echo "$(date '+%Y-%m-%d %H:%M:%S') - Source stream is advancing; waiting 120s for full stability"
sleep 120
dump_bn_log "after source stream stability wait, before CN upgrade decision"

if [[ "${SKIP_CONSENSUS_NODE_UPGRADE_UNTIL_CN_26498_FIXED}" == "true" ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - TEMPORARILY skipping CN upgrade to ${TO_CONSENSUS_NODE_VERSION}"
  echo "Reason: hiero-consensus-node#26498 can leave the freeze-boundary block missing from BN/mirror."
  echo "Consensus nodes remain on ${FROM_CONSENSUS_NODE_VERSION}; continuing component migration coverage."
  dump_bn_log "CN upgrade skipped due to hiero-consensus-node#26498"
else
  # CN 0.74 source runs with tss.hintsEnabled/historyEnabled=true; CN 0.75 inherits those and
  # crashes in ProofControllerImpl.advanceConstruction with NPE during TSS state reconciliation.
  # Pass explicit overrides to disable TSS hints/history for the upgrade.
  # forceMockSignatures must also be true: with hints/history/wraps all disabled, CN 0.75 cannot
  # complete real TSS block signing and crashes ~30s after ACTIVE, reverting to CHECKING.
  TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE="$(mktemp -t solo-upgrade-application-properties-XXXX.properties)"
  cp resources/templates/application.properties "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
  add_application_properties_overwrite_marker "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.hintsEnabled" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.historyEnabled" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.wrapsEnabled" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.forceMockSignatures" "true"
  # Also carry the block-stream and block-buffer settings into CN 0.75 so that it keeps
  # native blocks for BN and record streams for mirror smoke coverage.
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamMode" "${MIGRATION_BLOCK_STREAM_MODE}"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamWrappedRecordBlocks" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.writerMode" "FILE_AND_GRPC"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.buffer.maxBlocks" "1000"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.buffer.isBufferPersistenceEnabled" "true"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockNode.wantedBlockExpirationMillis" "300000"
  chmod 644 "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"

  # Step 3: Atomic CN upgrade — PREPARE_UPGRADE + FREEZE_UPGRADE + execute, without starting v0.75 yet.
  npm run solo -- \
    consensus network upgrade \
    -i node1,node2 \
    --deployment "${SOLO_DEPLOYMENT}" \
    --upgrade-version "${TO_CONSENSUS_NODE_VERSION}" \
    --application-properties "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" \
    --freeze-block-drain-seconds 30 \
    --skip-node-start \
    -q --dev
  dump_bn_log "immediately after CN upgrade staging (v0.75 not started)"

  # Step 4: Restart BN, then start CN v0.75 to clear the freeze-boundary incomplete block session.
  #
  # At the freeze boundary, FREEZE_UPGRADE kills CN v0.74 while one block is always mid-stream.
  # BN v0.38.1 retains the partial in-memory session for that block even after all publishers
  # disconnect. When CN v0.75 connects, BN's incomplete session state prevents it from cleanly
  # accepting CN v0.75's fresh copy of the block -> BN stalls or rejects -> CN v0.75 either gets
  # immediately blacklisted (wantedBlock < firstAvailableBlock) or later blacklisted (connection
  # error after BN rejects the partial-session block).
  #
  # Fix after CN issue #26498 is resolved:
  #  a. Skip the first CN v0.75 start in the network-upgrade command. If CN starts before BN
  #     is reset, BN can ingest later blocks and report blocksAvailable=N+2..M while CN still
  #     wants N. That recreates the permanent out-of-range condition and mirror remains stuck on N.
  #  b. Restart BN — the pod restart clears all in-memory partial session state. BN comes back
  #     with clean state: only the fully verified blocks on its PVC (0 through N-1, where N is
  #     the freeze-boundary gap block).
  #  c. Wait for BN to be ready and initialize from PVC. CN is stopped, so BN cannot advance
  #     past the gap before CN reconnects.
  #  d. Start CN v0.75 — first v0.75 connection happens while BN still expects
  #     the gap block. CN streams N, BN writes it, and mirror receives it.

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Restarting BN to clear freeze-boundary incomplete session"
  kubectl rollout restart statefulset/block-node-1 -n "${SOLO_NAMESPACE}"
  kubectl rollout status statefulset/block-node-1 -n "${SOLO_NAMESPACE}" --timeout=3m
  echo "$(date '+%Y-%m-%d %H:%M:%S') - BN pod restarted; incomplete session cleared"
  dump_bn_log "after BN restart (clean state from PVC; no partial session)"

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting 60s for BN to fully initialize from PVC"
  sleep 60
  dump_bn_log "after 60s wait, before CN start (gap window check)"
  npm run solo -- consensus node start \
    -i node1,node2 \
    --deployment "${SOLO_DEPLOYMENT}" \
    -q --dev
  echo "$(date '+%Y-%m-%d %H:%M:%S') - CN v0.75 started; blacklist cleared"
  dump_bn_log "after CN v0.75 start (check gap block delivery)"
  post_upgrade_start_block="$(get_latest_mirror_block_number)"
  wait_for_mirror_block_count_progress "CN v0.75 post-start pipeline" "${post_upgrade_start_block}" 3 120 5
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Pipeline healthy; CN→BN→mirror confirmed"
fi

npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --pinger -q --dev

.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"

npm run solo -- explorer node upgrade --deployment "${SOLO_DEPLOYMENT}" --mirrorNamespace ${SOLO_NAMESPACE} -q --dev

target_block_before_final_wait="$(get_latest_mirror_block_number)"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Target mirror block before post-upgrade account create: ${target_block_before_final_wait}"

npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev
wait_for_mirror_block_count_progress "target deployment after component upgrades" "${target_block_before_final_wait}" 1 180 2 > /dev/null

npm run solo -- relay node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev
# Restart relay and refresh forwards after upgrade to reduce stale-connection windows.
refresh_relay_network_config "${SOLO_NAMESPACE}" "${SOLO_DEPLOYMENT}"

echo "::endgroup::"

echo "::group::Final Verification"
SKIP_IMPORTER_CHECK=true
export SMOKE_MIRROR_BLOCK_SETTLE_BLOCKS=3
.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"
echo "::endgroup::"

echo "::group::Cleanup"
# uninstall components using current Solo version
npm run solo -- explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- relay node destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --dev
npm run solo -- mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- block node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --dev
npm run solo -- consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
echo "::endgroup::"

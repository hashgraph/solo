#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
#
# Captures the explorer's live routing state for issue #6118 ("explorer node upgrade does not
# actually change the explorer's live routing config") and compares:
#   1. the `/api` proxy_pass target recorded in the explorer ConfigMap (the value `explorer node
#      upgrade` just wrote), against
#   2. the `/api` proxy_pass target actually loaded inside the running explorer pod's
#      /etc/nginx/nginx.conf (subPath-mounted ConfigMap files are never live-refreshed by kubelet).
# It also attempts a real request through the explorer's port-forwarded proxy and records whether
# it succeeds or times out. Results are appended to a results file so a "baseline" run (before the
# routing change) can be diffed against a "post-upgrade" run (after it).
set -uo pipefail

NAMESPACE="${1:?namespace required}"
EXPLORER_INSTANCE_LABEL="${2:?explorer instance label required (e.g. hiero-explorer-1)}"
LABEL="${3:?result label required (e.g. baseline, post-upgrade)}"
RESULTS_DIR="${4:?results directory required}"
BASE_URL="${5:?explorer base url required (e.g. http://localhost:38080)}"
PROBE_PATH="${6:?probe path required (e.g. /api/v1/network/nodes)}"
CURL_MAX_TIME="${7:-10}"

mkdir -p "${RESULTS_DIR}"
RESULT_FILE="${RESULTS_DIR}/${LABEL}.txt"

POD_NAME="$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${EXPLORER_INSTANCE_LABEL}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
if [[ -z "${POD_NAME}" ]]; then
  echo "ERROR: no explorer pod found for app.kubernetes.io/instance=${EXPLORER_INSTANCE_LABEL} in ${NAMESPACE}" >&2
  exit 1
fi

CONFIGMAP_NAME="$(kubectl get configmap -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${EXPLORER_INSTANCE_LABEL}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
if [[ -z "${CONFIGMAP_NAME}" ]]; then
  # fall back to name-based discovery if the chart does not label its ConfigMap
  CONFIGMAP_NAME="$(kubectl get configmap -n "${NAMESPACE}" -o name | grep "${EXPLORER_INSTANCE_LABEL}" | grep -i config | head -1 | sed 's#configmap/##')"
fi
if [[ -z "${CONFIGMAP_NAME}" ]]; then
  echo "ERROR: no explorer ConfigMap found for ${EXPLORER_INSTANCE_LABEL} in ${NAMESPACE}" >&2
  exit 1
fi

# Extract the proxy_pass target under `location /api` from the ConfigMap's nginx.conf data.
CONFIGMAP_PROXY_TARGET="$(kubectl get configmap "${CONFIGMAP_NAME}" -n "${NAMESPACE}" -o jsonpath='{.data.nginx\.conf}' \
  | awk '/location[ \t]+\/api[ \t]*\{/{flag=1} flag && /proxy_pass/{print $2; exit}' \
  | tr -d ';')"

# Extract the same value from the file actually loaded inside the running pod.
POD_PROXY_TARGET="$(kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- sh -c "awk '/location[ \t]+\/api[ \t]*{/{flag=1} flag && /proxy_pass/{print \$2; exit}' /etc/nginx/nginx.conf" 2>/dev/null | tr -d ';')"

if [[ "${CONFIGMAP_PROXY_TARGET}" == "${POD_PROXY_TARGET}" ]]; then
  CONFIG_DIFF_STATUS="MATCH (pod is in sync with ConfigMap)"
else
  CONFIG_DIFF_STATUS="MISMATCH (pod is STALE relative to ConfigMap)"
fi

# Attempt a real request through the explorer's proxy with a short timeout.
HTTP_CODE="$(curl -s -o /tmp/explorer-routing-probe-body.json -w '%{http_code}' --max-time "${CURL_MAX_TIME}" "${BASE_URL}${PROBE_PATH}")"
CURL_EXIT_CODE=$?
if [[ ${CURL_EXIT_CODE} -ne 0 ]]; then
  CURL_SUMMARY="FAILED (curl exit code ${CURL_EXIT_CODE}, likely timeout -> hung proxy to a dead backend)"
elif [[ "${HTTP_CODE}" == "200" ]]; then
  CURL_SUMMARY="SUCCESS (HTTP ${HTTP_CODE})"
else
  CURL_SUMMARY="UNEXPECTED (HTTP ${HTTP_CODE})"
fi
RESPONSE_BODY_SNIPPET="$(head -c 300 /tmp/explorer-routing-probe-body.json 2>/dev/null)"

{
  echo "label: ${LABEL}"
  echo "timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "namespace: ${NAMESPACE}"
  echo "explorer_pod: ${POD_NAME}"
  echo "explorer_configmap: ${CONFIGMAP_NAME}"
  echo "configmap_proxy_pass_target: ${CONFIGMAP_PROXY_TARGET}"
  echo "pod_live_proxy_pass_target: ${POD_PROXY_TARGET}"
  echo "configmap_vs_pod: ${CONFIG_DIFF_STATUS}"
  echo "curl_url: ${BASE_URL}${PROBE_PATH}"
  echo "curl_result: ${CURL_SUMMARY}"
  echo "curl_exit_code: ${CURL_EXIT_CODE}"
  echo "curl_http_code: ${HTTP_CODE}"
  echo "response_body_snippet: ${RESPONSE_BODY_SNIPPET}"
} | tee "${RESULT_FILE}"

echo ""
echo "✅ Wrote routing verification result to ${RESULT_FILE}"

#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
#
# Reproduces and verifies the fix for the stale local-config issue:
#   "Solo local state becomes out-of-sync when users manually clean up Docker/Kubernetes resources"
#
# What this script tests:
#   The `deployment config create` command (called internally by `one-shot single deploy`)
#   must detect when an existing deployment entry in the local config no longer has any
#   matching resources in the cluster (stale state) and automatically clean it up instead
#   of failing with "A deployment named X already exists."
#
#   Additionally, `ledger account create` (and other commands that require a live cluster)
#   must properly report an error when the cluster referenced by the deployment is gone.
#
# Steps:
#   1. Create a Kind cluster and register it with solo
#   2. Create a deployment entry in local config (simulates what one-shot single deploy does)
#   3. Attach the cluster ref to the deployment (simulates what one-shot single deploy does)
#   4. Delete the Kind cluster — the local config entry is now STALE
#   5. Run `ledger account create` — should fail with a cluster-connection error,
#      confirming that solo properly detects the deployment no longer matches the live cluster
#   6. Re-create the deployment config
#      EXPECTED: Solo detects the stale entry, logs the warning, cleans it up, and
#                proceeds with a fresh deployment instead of failing with
#                "A deployment named one-shot already exists."
#   7. Verify the expected stale-config message appeared in the output
#
# Usage (from the root of the solo repository):
#   .github/workflows/script/reproduce-stale-config.sh
#
# Requirements:
#   kind   - https://kind.sigs.k8s.io/
#   yq     - https://github.com/mikefarah/yq (used in Step 4 to update the local config YAML)
#   Node.js and npm (to run the solo CLI)
#
# Environment variables (all optional):
#   SOLO_CMD         - Solo command to use (default: "npm run solo --")
#   SOLO_CLUSTER     - Kind cluster name      (default: "solo-cluster")

set -eo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SOLO_CMD="${SOLO_CMD:-npm run solo --}"
SOLO_CLUSTER="${SOLO_CLUSTER:-solo-cluster}"
KUBE_CONTEXT="kind-${SOLO_CLUSTER}"
CLUSTER_REF="one-shot"
DEPLOYMENT="one-shot"
NAMESPACE="one-shot"

EXPECTED_MSG="no matching resources were found in the cluster"
EXPECTED_ACCOUNT_ERR="Received an incorrect or unexpected response from the Kubernetes API"
REDEPLOY_LOG="$(mktemp /tmp/solo-stale-config-redeploy-XXXX.log)"
ACCOUNT_LOG="$(mktemp /tmp/solo-stale-config-account-XXXX.log)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step() {
  echo ""
  echo "============================================================"
  echo "  $*"
  echo "============================================================"
}

cleanup() {
  local rc=$?
  rm -f "${REDEPLOY_LOG}" "${ACCOUNT_LOG}"
  kind delete cluster --name "${SOLO_CLUSTER}" 2>/dev/null || true
  if [[ ${rc} -ne 0 ]]; then
    echo ""
    echo "Script FAILED (exit code ${rc})"
  fi
  exit "${rc}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if ! command -v kind &>/dev/null; then
  echo "ERROR: 'kind' not found in PATH."
  exit 1
fi

if ! command -v yq &>/dev/null; then
  echo "ERROR: 'yq' not found in PATH. Install from https://github.com/mikefarah/yq"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 0 – Build the solo CLI from source
#   This ensures the script always tests the latest TypeScript source and not
#   a potentially stale dist/ folder from a previous build.
# ---------------------------------------------------------------------------
step "Step 0: Build solo CLI from source"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
echo "Repository root: ${REPO_ROOT}"
(
  cd "${REPO_ROOT}"
  if [[ ! -f node_modules/.bin/tsc ]]; then
    echo "TypeScript compiler not found. Running npm ci…"
    npm ci
  fi
  echo "Compiling TypeScript…"
  rm -rf dist
  node_modules/.bin/tsc
  node resources/post-build-script.js
)
echo "Step 0 complete: solo CLI built successfully."

# ---------------------------------------------------------------------------
# Step 1 – Clean up any previous state and create a fresh Kind cluster
# ---------------------------------------------------------------------------
step "Step 1: Clean up previous state and create Kind cluster '${SOLO_CLUSTER}'"
kind delete cluster --name "${SOLO_CLUSTER}" 2>/dev/null || true
rm -rf "${HOME}/.solo"
kind create cluster --name "${SOLO_CLUSTER}"
echo "Step 1 complete: Kind cluster '${SOLO_CLUSTER}' created (context: '${KUBE_CONTEXT}')."

# ---------------------------------------------------------------------------
# Step 2 – Register the cluster ref with solo
# ---------------------------------------------------------------------------
step "Step 2: Register cluster ref '${CLUSTER_REF}' → '${KUBE_CONTEXT}'"
${SOLO_CMD} cluster-ref config connect \
  --cluster-ref "${CLUSTER_REF}" \
  --context "${KUBE_CONTEXT}" \
  --quiet-mode
echo "Step 2 complete: cluster ref registered."

# ---------------------------------------------------------------------------
# Step 3 – Create a deployment entry in local config
# ---------------------------------------------------------------------------
step "Step 3: Create deployment '${DEPLOYMENT}' in namespace '${NAMESPACE}'"
${SOLO_CMD} deployment config create \
  --deployment "${DEPLOYMENT}" \
  --namespace "${NAMESPACE}" \
  --quiet-mode
echo "Step 3 complete: deployment config created."

# ---------------------------------------------------------------------------
# Step 4 – Attach the cluster ref to the deployment
#   Simulates what `one-shot single deploy` (or `deployment cluster attach`) does.
#   After this, the local config has:
#     deployments[0].clusters = ["one-shot"]
#     clusterRefs["one-shot"]  = "kind-solo-cluster"
#   This is the "healthy" state — the deployment exists and has a cluster ref.
# ---------------------------------------------------------------------------
step "Step 4: Attach cluster ref '${CLUSTER_REF}' to deployment '${DEPLOYMENT}'"
yq -i "
  (.deployments[] | select(.name == \"${DEPLOYMENT}\")).clusters =
    [\"${CLUSTER_REF}\"]
" "${HOME}/.solo/local-config.yaml"

echo "Local config after cluster attachment:"
cat "${HOME}/.solo/local-config.yaml"
echo ""
echo "Step 4 complete: cluster ref attached to deployment."

# ---------------------------------------------------------------------------
# Step 5 – Delete the Kind cluster (reproduce the issue)
#   'kind delete cluster' also removes the context from kubeconfig.
#   The local config entry is now STALE: it references a cluster + namespace
#   that no longer exist.
# ---------------------------------------------------------------------------
step "Step 5: Delete Kind cluster '${SOLO_CLUSTER}' (simulating user cleanup)"
kind delete cluster --name "${SOLO_CLUSTER}"
echo "Step 5 complete: Kind cluster deleted."
echo "  Local config still references deployment '${DEPLOYMENT}' — it is now STALE."

# ---------------------------------------------------------------------------
# Step 6 – Run `ledger account create` to confirm it properly fails
#   With the cluster gone, any command that requires a live cluster must report
#   an error about being unable to connect.  This step verifies that solo does
#   NOT silently succeed or give a misleading message — it must clearly tell the
#   user that the deployment's cluster is unreachable.
# ---------------------------------------------------------------------------
step "Step 6: Run 'ledger account create' — should fail (cluster is gone)"

set +e
${SOLO_CMD} ledger account create \
  --deployment "${DEPLOYMENT}" 2>&1 | tee "${ACCOUNT_LOG}"
ACCOUNT_EXIT=${PIPESTATUS[0]}
set -e

if grep -q "${EXPECTED_ACCOUNT_ERR}" "${ACCOUNT_LOG}"; then
  echo "✅  'ledger account create' correctly reported a cluster-connection error."
  echo "    Found expected error: \"${EXPECTED_ACCOUNT_ERR}\""
else
  echo "❌  Expected cluster-connection error NOT found in 'ledger account create' output."
  echo "    Searched for: \"${EXPECTED_ACCOUNT_ERR}\""
  exit 1
fi

if [[ ${ACCOUNT_EXIT} -eq 0 ]]; then
  echo "❌  'ledger account create' unexpectedly succeeded (exit code 0)."
  echo "    It should have failed because the cluster no longer exists."
  exit 1
fi

echo "✅  'ledger account create' failed as expected (exit code ${ACCOUNT_EXIT})."

# ---------------------------------------------------------------------------
# Step 7 – Re-create deployment config (should detect stale entry and proceed)
# ---------------------------------------------------------------------------
step "Step 7: Re-create deployment config (should detect stale local config)"

# Capture stdout+stderr to check for the expected message.
# Also tee to terminal so CI logs remain readable.
set +e
${SOLO_CMD} deployment config create \
  --deployment "${DEPLOYMENT}" \
  --namespace "${NAMESPACE}" \
  --quiet-mode 2>&1 | tee "${REDEPLOY_LOG}"
REDEPLOY_EXIT=${PIPESTATUS[0]}
set -e

# ---------------------------------------------------------------------------
# Step 8 – Verify the stale-config warning appeared
# ---------------------------------------------------------------------------
step "Step 8: Verify stale-config detection message"

if grep -q "${EXPECTED_MSG}" "${REDEPLOY_LOG}"; then
  echo "✅  Stale config detection is working correctly."
  echo "    Found expected message: \"${EXPECTED_MSG}\""
else
  echo "❌  Expected stale-config message NOT found in output."
  echo "    Searched for: \"${EXPECTED_MSG}\""
  echo "    This means the fix is not active or the message changed."
  exit 1
fi

if [[ ${REDEPLOY_EXIT} -ne 0 ]]; then
  echo "❌  Command exited with code ${REDEPLOY_EXIT} (expected 0)."
  exit "${REDEPLOY_EXIT}"
fi

echo "✅  Command succeeded after stale config cleanup."

echo ""
echo "============================================================"
echo "  All steps passed. Stale config fix verified successfully."
echo "============================================================"

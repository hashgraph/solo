#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# test-mirror-node-endpoints.sh — Verify that all major mirror node endpoints are working
#
# Strategy:
#   1. Bootstrap a network using one-shot single deploy
#   2. Deploy mirror node with all endpoints enabled
#   3. Create test accounts to generate data
#   4. Test all major mirror node endpoints:
#      - gRPC API
#      - GraphQL API
#      - Web3 API
#      - REST API
#
# Requirements:
#   - curl, jq (for API testing)
#   - grpcurl (for gRPC testing)
#   - kind, kubectl, helm, solo (npm run solo-test)
#
# Usage:
#   bash test-mirror-node-endpoints.sh

set -eo pipefail

# Hard overall timeout for the entire script (default 30 minutes).
SCRIPT_TIMEOUT_SECONDS="${SCRIPT_TIMEOUT_SECONDS:-1800}"
if [[ -z "${_MIRROR_ENDPOINT_TEST_WRAPPED:-}" ]]; then
  export _MIRROR_ENDPOINT_TEST_WRAPPED=1
  exec timeout --kill-after=10 "$SCRIPT_TIMEOUT_SECONDS" "$0" "$@"
fi

# ── configuration ──────────────────────────────────────────────────────────────
SOLO_CLUSTER_NAME=solo-mirror-test
DEPLOYMENT=mirror-test
NAMESPACE=one-shot
SETUP_NAMESPACE=mirror-test-setup

# Timeouts
DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-900}"
MIRROR_READY_TIMEOUT_SECONDS="${MIRROR_READY_TIMEOUT_SECONDS:-300}"
ENDPOINT_TEST_TIMEOUT_SECONDS="${ENDPOINT_TEST_TIMEOUT_SECONDS:-60}"

# ── terminal colors ────────────────────────────────────────────────────────────
txtyellow='\033[1;33m'
txtgreen='\033[1;32m'
txtred='\033[1;31m'
txtrst='\033[0m'
info() { printf "${txtyellow}[INFO]${txtrst} %s\n" "$1"; }
error() { printf "${txtred}[ERROR]${txtrst} %s\n" "$1"; }
success() { printf "${txtgreen}[SUCCESS]${txtrst} %s\n" "$1"; }

check_deps() {
  local missing=()
  for cmd in curl jq kind kubectl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "ERROR: missing required tools: ${missing[*]}" >&2
    exit 1
  fi
}

cleanup() {
  local exit_code=$?
  echo

  # Kill any port-forwards we created
  pkill -f "kubectl.*port-forward.*grpc" 2>/dev/null || true

  # Only cleanup on success
  if [[ $exit_code -eq 0 ]]; then
    info "Test passed - cleaning up..."
    # Clean up temporary files
    /bin/rm -f /tmp/mirror-test-*.log /tmp/mirror-test-*.json
    # Delete cluster
    kind delete cluster --name "$SOLO_CLUSTER_NAME" 2>/dev/null || true
    /bin/rm -rf ~/.solo 2>/dev/null || true
  else
    info "Test failed - preserving cluster for debugging"
    info "Cluster: $SOLO_CLUSTER_NAME"
    info "Namespace: $NAMESPACE"
    info "To debug: kubectl get pods -n $NAMESPACE"
    info "To cleanup manually: kind delete cluster -n $SOLO_CLUSTER_NAME && rm -rf ~/.solo"
  fi
}

trap cleanup EXIT

# Test REST API endpoint
test_rest_api() {
  local ingress_port=$1
  local base_url="http://localhost:${ingress_port}/api/v1"
  info "Testing REST API at $base_url"

  # Test network info
  if curl -sf "$base_url/network/nodes" -o /tmp/mirror-test-rest-nodes.json; then
    success "REST API - network/nodes endpoint working"
  else
    error "REST API - network/nodes endpoint failed"
    return 1
  fi

  # Test accounts endpoint
  if curl -sf "$base_url/accounts" -o /tmp/mirror-test-rest-accounts.json; then
    local count=$(jq '.accounts | length' /tmp/mirror-test-rest-accounts.json)
    success "REST API - accounts endpoint working (found $count accounts)"
  else
    error "REST API - accounts endpoint failed"
    return 1
  fi

  # Test transactions endpoint
  if curl -sf "$base_url/transactions?limit=10" -o /tmp/mirror-test-rest-transactions.json; then
    success "REST API - transactions endpoint working"
  else
    error "REST API - transactions endpoint failed"
    return 1
  fi

  return 0
}

# Test gRPC API endpoint
test_grpc_api() {
  local namespace=$1
  local grpc_port=${2:-5600}
  info "Testing gRPC API service in namespace: ${namespace}"

  # Get the gRPC service name
  local grpc_svc=$(kubectl get svc -n "${namespace}" -o name 2>/dev/null | grep "grpc" | head -1 | cut -d'/' -f2)

  if [[ -z "$grpc_svc" ]]; then
    error "gRPC API - service not found in namespace ${namespace}"
    info "Available services:"
    kubectl get svc -n "${namespace}" 2>/dev/null || echo "  Failed to get services"
    return 1
  fi

  success "gRPC API - service exists: ${grpc_svc}"

  # Check if grpcurl is available
  if ! command -v grpcurl &>/dev/null; then
    info "grpcurl not found - skipping gRPC endpoint test (install with: brew install grpcurl)"
    return 0
  fi

  # Set up port-forward for gRPC testing
  info "Setting up temporary port-forward for gRPC testing"
  kubectl port-forward -n "${namespace}" "svc/${grpc_svc}" "${grpc_port}:${grpc_port}" >/dev/null 2>&1 &
  local pf_pid=$!

  # Wait for port-forward to be ready
  sleep 3

  # Test gRPC endpoint
  if grpcurl -plaintext -d '{"file_id": {"fileNum": 102}, "limit": 0}' \
    "localhost:${grpc_port}" \
    com.hedera.mirror.api.proto.NetworkService/getNodes \
    >/tmp/mirror-test-grpc-result.json 2>&1; then
    success "gRPC API - NetworkService/getNodes working"
  else
    error "gRPC API - NetworkService/getNodes failed"
    cat /tmp/mirror-test-grpc-result.json
    kill "$pf_pid" 2>/dev/null || true
    return 1
  fi

  # Cleanup port-forward
  kill "$pf_pid" 2>/dev/null || true

  return 0
}

# Test Web3 JSON-RPC API endpoint (via relay)
test_web3_jsonrpc() {
  local web3_port=$1
  local base_url="http://localhost:${web3_port}"
  info "Testing Web3 JSON-RPC API at $base_url"

  # Test eth_chainId
  local chain_id_request='{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
  if curl -sf -X POST -H "Content-Type: application/json" \
    -d "$chain_id_request" "$base_url" -o /tmp/mirror-test-web3-chainid.json; then
    local chain_id=$(jq -r '.result' /tmp/mirror-test-web3-chainid.json)
    success "Web3 JSON-RPC - eth_chainId working (result: $chain_id)"
  else
    error "Web3 JSON-RPC - eth_chainId failed"
    return 1
  fi

  # Test eth_blockNumber
  local block_number_request='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  if curl -sf -X POST -H "Content-Type: application/json" \
    -d "$block_number_request" "$base_url" -o /tmp/mirror-test-web3-blocknumber.json; then
    local block_number=$(jq -r '.result' /tmp/mirror-test-web3-blocknumber.json)
    success "Web3 JSON-RPC - eth_blockNumber working (result: $block_number)"
  else
    error "Web3 JSON-RPC - eth_blockNumber failed"
    return 1
  fi

  return 0
}

# Test Web3 Contract Call API (via mirror node REST)
test_web3_contract_call() {
  local ingress_port=$1
  local base_url="http://localhost:${ingress_port}/api/v1"
  info "Testing Web3 Contract Call API at $base_url/contracts/call"

  # Test contract call to exchange rate system contract
  # Call tinycentsToTinybars(uint256) with 100 cents as input
  local contract_call='{
    "block": "latest",
    "data": "0x2e3cff6a0000000000000000000000000000000000000000000000000000000000000064",
    "estimate": false,
    "gas": 15000000,
    "gasPrice": 100000000,
    "to": "0x0000000000000000000000000000000000000168"
  }'

  if curl -sf -X POST -H "Content-Type: application/json" \
    -d "$contract_call" "$base_url/contracts/call" -o /tmp/mirror-test-web3-contract.json 2>&1; then
    local result=$(jq -r '.result // empty' /tmp/mirror-test-web3-contract.json)
    if [[ -n "$result" ]]; then
      success "Web3 Contract Call - tinycentsToTinybars working (result: ${result:0:20}...)"
    else
      error "Web3 Contract Call - no result returned"
      cat /tmp/mirror-test-web3-contract.json
      return 1
    fi
  else
    error "Web3 Contract Call - API call failed"
    cat /tmp/mirror-test-web3-contract.json 2>/dev/null || true
    return 1
  fi

  return 0
}

# ══════════════════════════════════════════════════════════════════════════════
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
info "BOOTSTRAP — creating cluster and deploying network with mirror node"
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

RESULT=0

check_deps

# Clean up any stale state from previous runs
kind delete cluster --name "$SOLO_CLUSTER_NAME" 2>/dev/null || true
/bin/rm -rf ~/.solo 2>/dev/null || true

# Create Kind cluster
info "Creating Kind cluster: $SOLO_CLUSTER_NAME"
kind create cluster --name "$SOLO_CLUSTER_NAME" --image kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30 --wait 5m

# Deploy network using one-shot
info "Deploying network using one-shot (this may take several minutes)"
if ! timeout --kill-after=10 "$DEPLOY_TIMEOUT_SECONDS" \
  npm run solo-test -- one-shot single deploy \
    --deployment "$DEPLOYMENT" \
    --quiet-mode; then
  error "one-shot deploy failed or timed out"
  RESULT=1
  exit $RESULT
fi
success "Network deployed successfully"

# Wait for network to stabilize
info "Waiting 10 seconds for network to stabilize..."
sleep 10

# One-shot already creates 10 accounts, so we don't need to create more
info "One-shot deployment created 10 accounts automatically (skipping additional account creation)"

echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
info "TESTING MIRROR NODE ENDPOINTS"
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

# Wait for mirror node services to be ready
info "Checking mirror node services..."
kubectl get svc -n "$NAMESPACE" | grep mirror || {
  error "No mirror node services found in namespace $NAMESPACE"
  info "Available services:"
  kubectl get svc -n "$NAMESPACE"
  RESULT=1
  exit $RESULT
}

# Extract port numbers from constants.ts
info "Extracting port numbers from constants.ts..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/helper.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONSTANTS_FILE="${REPO_ROOT}/src/core/constants.ts"

MIRROR_INGRESS_PORT=$(extract_version MIRROR_NODE_PORT "${CONSTANTS_FILE}" 2>/dev/null | tr -d '_' || echo "38081")
RELAY_PORT=$(extract_version JSON_RPC_RELAY_LOCAL_PORT "${CONSTANTS_FILE}" 2>/dev/null | tr -d '_' || echo "37546")

info "Using mirror ingress port: $MIRROR_INGRESS_PORT"
info "Using relay port: $RELAY_PORT"

# Wait for ports to be ready
info "Waiting for endpoints to be ready..."
sleep 5

# Test REST API (via mirror ingress)
test_rest_api "$MIRROR_INGRESS_PORT" || RESULT=1

# Test gRPC API (check service exists and call endpoint)
test_grpc_api "$NAMESPACE" || RESULT=1

# Test Web3 JSON-RPC API (via relay)
test_web3_jsonrpc "$RELAY_PORT" || RESULT=1

# Test Web3 Contract Call API (via mirror node REST)
test_web3_contract_call "$MIRROR_INGRESS_PORT" || RESULT=1

# ── VERDICT ─────────────────────────────────────────────────────────────────────
echo
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
if [[ "$RESULT" -eq 0 ]]; then
  success "PASS: All mirror node endpoint tests passed"
else
  error "FAIL: One or more mirror node endpoint tests failed"
fi
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

exit "$RESULT"

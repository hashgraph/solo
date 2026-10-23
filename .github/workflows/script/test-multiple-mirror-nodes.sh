#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# test-multiple-mirror-nodes.sh — Verify two mirror nodes with different data sources in one namespace
#
# Strategy:
#   1. Create a Kind cluster and deploy a block node and a consensus node that streams both record files and blocks
#   2. Deploy a previous mirror node version: mirror node 1 importing from the bucket (with the pinger, which
#      generates user transactions) and mirror node 2 importing from the block node, both in the same namespace
#   3. Verify every resource of the two mirror nodes is separate (releases, secrets, databases, ingresses)
#   4. Verify the sources really differ: only the block node mirror node holds the hinTS partial signature
#      transactions, which the record stream leaves out
#   5. Verify the user transactions of both mirror nodes are identical over a common window
#   6. Upgrade both mirror nodes to the current mirror node version and verify the releases moved, the database
#      passwords, databases, sources and ingresses are unchanged, ingestion continues and the transactions
#      of both mirror nodes are still identical
#   7. Destroy mirror node 2 and verify mirror node 1 keeps serving, then destroy mirror node 1
#      and verify the shared resources are removed
#
# Requirements:
#   - curl, jq, kind, kubectl, base64, solo (npm run solo-test); helm is installed by solo into ~/.solo/bin
#
# Usage:
#   bash test-multiple-mirror-nodes.sh

set -eo pipefail

# Hard overall timeout for the entire script (default 50 minutes).
SCRIPT_TIMEOUT_SECONDS="${SCRIPT_TIMEOUT_SECONDS:-3000}"
if [[ -z "${_MULTIPLE_MIRROR_NODES_TEST_WRAPPED:-}" && "${BASH_SOURCE[0]}" == "$0" ]]; then
  export _MULTIPLE_MIRROR_NODES_TEST_WRAPPED=1
  exec timeout --kill-after=10 "$SCRIPT_TIMEOUT_SECONDS" "$0" "$@"
fi

# solo installs helm into ~/.solo/bin; make it available to the helm calls in this script
export PATH="${HOME}/.solo/bin:${PATH}"

# ── configuration ──────────────────────────────────────────────────────────────
SOLO_CLUSTER_NAME="${SOLO_CLUSTER_NAME:-solo-multi-mirror-test}"
CLUSTER_REF="kind-${SOLO_CLUSTER_NAME}"
NAMESPACE="${NAMESPACE:-multi-mirror-ns}"
DEPLOYMENT="${DEPLOYMENT:-multi-mirror-deployment}"

BUCKET_PORT="${BUCKET_PORT:-19081}"
BLOCK_NODE_PORT="${BLOCK_NODE_PORT:-19082}"

# The mirror node version deployed first, and the one the mirror nodes are upgraded to (the default of this checkout)
PREVIOUS_MIRROR_NODE_VERSION="${PREVIOUS_MIRROR_NODE_VERSION:-v0.162.0}"
CURRENT_MIRROR_NODE_VERSION="${CURRENT_MIRROR_NODE_VERSION:-$(sed -n "s/^export const MIRROR_NODE_VERSION: string = .*|| '\(v[0-9.]*\)'.*/\1/p" version.ts 2>/dev/null)}"

# Timeouts
TRAFFIC_TIMEOUT_SECONDS="${TRAFFIC_TIMEOUT_SECONDS:-300}"
REST_TIMEOUT_SECONDS="${REST_TIMEOUT_SECONDS:-120}"
MIN_COMPARED_TRANSACTIONS="${MIN_COMPARED_TRANSACTIONS:-10}"

# ── terminal colors ────────────────────────────────────────────────────────────
txtyellow='\033[1;33m'
txtgreen='\033[1;32m'
txtred='\033[1;31m'
txtrst='\033[0m'
info() { printf "${txtyellow}[INFO]${txtrst} %s\n" "$1"; }
error() { printf "${txtred}[ERROR]${txtrst} %s\n" "$1"; }
success() { printf "${txtgreen}[SUCCESS]${txtrst} %s\n" "$1"; }

fail() {
  error "$1"
  exit 1
}

check_deps() {
  local missing=()
  # helm is not preinstalled on the runner; solo downloads it into ~/.solo/bin on first use
  for cmd in curl jq kind kubectl base64; do
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

  pkill -f "kubectl.*port-forward.*mirror-ingress-controller" 2>/dev/null || true

  if [[ $exit_code -eq 0 ]]; then
    info "Test passed - cleaning up..."
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

solo_cmd() {
  npm run --silent solo-test -- "$@"
}

# ── assertions ─────────────────────────────────────────────────────────────────
assert_eq() {
  local description=$1 expected=$2 actual=$3
  [[ "$expected" == "$actual" ]] || fail "$description: expected '$expected', got '$actual'"
  success "$description: $actual"
}

assert_secret() {
  kubectl get secret -n "$NAMESPACE" "$1" &>/dev/null || fail "secret $1 is missing"
  success "secret $1 exists"
}

assert_release() {
  local status
  status=$(helm list -n "$NAMESPACE" --filter "^$1\$" -o json | jq -r '.[0].status // empty')
  assert_eq "helm release $1" "deployed" "$status"
}

# Asserts the chart of a mirror node release is the given mirror node version (v0.163.0 -> hedera-mirror-0.163.0)
assert_chart_version() {
  local release=$1 version=$2
  assert_eq "chart of helm release $release" "hedera-mirror-${version#v}" \
    "$(helm list -n "$NAMESPACE" --filter "^${release}\$" -o json | jq -r '.[0].chart // empty')"
}

secret_data() {
  kubectl get secret -n "$NAMESPACE" "$1" -o json | jq -S -c '.data'
}

# Asserts every key of a secret as captured earlier still has the same value; keys a newer chart adds are fine
assert_secret_values_kept() {
  local secret=$1 before=$2 changed
  changed=$(jq -n --argjson before "$before" --argjson after "$(secret_data "$secret")" \
    '[$before | to_entries[] | select($after[.key] != .value) | .key] | length')
  assert_eq "changed values in secret $secret" "0" "$changed"
}

psql_postgres() {
  kubectl exec -n "$NAMESPACE" solo-shared-resources-postgres-0 -c postgresql -- bash -c \
    "PGPASSWORD=\$(cat \$POSTGRES_PASSWORD_FILE) psql -U postgres -h 127.0.0.1 -Atc \"$1\""
}

importer_env() {
  kubectl get deploy -n "$NAMESPACE" "$1-importer" -o \
    jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="SPRING_PROFILES_ACTIVE")].value}'
}

# ── mirror node REST helpers ───────────────────────────────────────────────────
forward_ingress() {
  local service=$1 port=$2
  kubectl port-forward -n "$NAMESPACE" "svc/$service" "$port:80" >/dev/null 2>&1 &
}

wait_for_rest() {
  local port=$1 deadline=$((SECONDS + REST_TIMEOUT_SECONDS))
  until curl -sf --max-time 5 "http://localhost:${port}/api/v1/blocks?limit=1" >/dev/null; do
    (( SECONDS < deadline )) || fail "mirror node REST on port $port did not become ready"
    sleep 3
  done
}

start_port_forwards() {
  forward_ingress "mirror-ingress-controller-${NAMESPACE}" "$BUCKET_PORT"
  forward_ingress "mirror-ingress-controller-${NAMESPACE}-2" "$BLOCK_NODE_PORT"
  wait_for_rest "$BUCKET_PORT"
  wait_for_rest "$BLOCK_NODE_PORT"
}

# A port-forward is bound to the pod it started with, and an upgrade may replace the ingress controller pods
restart_port_forwards() {
  pkill -f "kubectl.*port-forward.*mirror-ingress-controller" 2>/dev/null || true
  sleep 2
  start_port_forwards
}

latest_user_timestamp() {
  curl -sf --max-time 20 "http://localhost:$1/api/v1/transactions?limit=1&order=desc" | jq -r '.transactions[0].consensus_timestamp'
}

# Waits until the mirror node on port $1 has seen at least $3 pinger transfers after timestamp $2
wait_for_new_traffic() {
  local port=$1 after=$2 wanted=$3 deadline=$((SECONDS + TRAFFIC_TIMEOUT_SECONDS)) transfers=0
  while (( SECONDS < deadline )); do
    transfers=$(curl -sf --max-time 20 "http://localhost:${port}/api/v1/transactions?limit=100&order=desc&timestamp=gt:${after}" |
      jq '[.transactions[] | select(.name == "CRYPTOTRANSFER")] | length' || echo 0)
    (( transfers >= wanted )) && return 0
    sleep 5
  done
  fail "mirror node on port $port saw only $transfers CRYPTOTRANSFER transactions after $after, expected at least $wanted"
}

# Prints a JSON array with up to $3 pages (default 3) of transactions, newest first, up to timestamp $2
fetch_transactions() {
  local port=$1 upto=$2 pages=${3:-3} out='[]' page next
  local url="http://localhost:${port}/api/v1/transactions?limit=100&order=desc&timestamp=lte:${upto}"
  while [[ -n "$url" && $pages -gt 0 ]]; do
    page=$(curl -sf --max-time 20 "$url") || fail "could not fetch $url"
    out=$(jq -c -n --argjson a "$out" --argjson b "$page" '$a + $b.transactions')
    next=$(jq -r '.links.next // empty' <<<"$page")
    url=""
    [[ -n "$next" ]] && url="http://localhost:${port}${next}"
    pages=$((pages - 1))
  done
  echo "$out"
}

count_named() {
  jq --arg name "$2" '[.[] | select(.name == $name)] | length' <<<"$1"
}

# Waits until the mirror node on port $1 has seen at least $2 pinger transfers
wait_for_traffic() {
  local port=$1 wanted=$2 deadline=$((SECONDS + TRAFFIC_TIMEOUT_SECONDS)) transfers=0
  while (( SECONDS < deadline )); do
    transfers=$(count_named "$(fetch_transactions "$port" 9999999999.999999999 1)" CRYPTOTRANSFER)
    (( transfers >= wanted )) && return 0
    sleep 5
  done
  fail "mirror node on port $port saw only $transfers CRYPTOTRANSFER transactions, expected at least $wanted"
}

# Compares the user transactions (everything but hinTS partial signatures) of two mirror nodes over the
# window both of them cover. Block numbers differ between the sources, so records are matched on
# consensus timestamp, name, result and transaction hash.
compare_user_transactions() {
  local bucket_port=$1 block_node_port=$2
  local latest='9999999999.999999999'
  local bucket block_node
  bucket=$(fetch_transactions "$bucket_port" "$latest")
  block_node=$(fetch_transactions "$block_node_port" "$latest")
  block_node=$(jq -c '[.[] | select(.name != "HINTSPARTIALSIGNATURE")]' <<<"$block_node")

  local high low
  high=$(jq -rn --argjson a "$bucket" --argjson b "$block_node" '[$a[0].consensus_timestamp, $b[0].consensus_timestamp] | min')
  low=$(jq -rn --argjson a "$bucket" --argjson b "$block_node" '[$a[-1].consensus_timestamp, $b[-1].consensus_timestamp] | max')

  local keys='[.[] | select(.consensus_timestamp >= $low and .consensus_timestamp <= $high)
    | "\(.consensus_timestamp)|\(.name)|\(.result)|\(.transaction_hash)"] | sort | .[]'
  local bucket_keys block_node_keys
  bucket_keys=$(jq -r --arg low "$low" --arg high "$high" "$keys" <<<"$bucket")
  block_node_keys=$(jq -r --arg low "$low" --arg high "$high" "$keys" <<<"$block_node")

  local bucket_count block_node_count
  bucket_count=$(grep -c . <<<"$bucket_keys" || true)
  block_node_count=$(grep -c . <<<"$block_node_keys" || true)
  info "Comparing user transactions in window ${low} .. ${high}: bucket=${bucket_count}, block node=${block_node_count}"

  (( bucket_count >= MIN_COMPARED_TRANSACTIONS )) ||
    fail "only $bucket_count user transactions in the common window, expected at least $MIN_COMPARED_TRANSACTIONS"
  if [[ "$bucket_keys" != "$block_node_keys" ]]; then
    error "user transactions differ between the bucket and block node mirror nodes:"
    diff <(echo "$bucket_keys") <(echo "$block_node_keys") | head -20 || true
    exit 1
  fi
  success "the user transactions of both mirror nodes are identical (${bucket_count} transactions)"
}

# ── test stages ────────────────────────────────────────────────────────────────
deploy() {
  info "Creating Kind cluster: $SOLO_CLUSTER_NAME"
  kind delete cluster --name "$SOLO_CLUSTER_NAME" 2>/dev/null || true
  kind create cluster --name "$SOLO_CLUSTER_NAME" \
    --image kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30 --wait 5m

  # the consensus node writes record files for the bucket and blocks for the block node
  export BLOCK_STREAM_STREAM_MODE=BOTH

  info "Deploying the deployment, block node and consensus node"
  solo_cmd cluster-ref config connect --cluster-ref "$CLUSTER_REF" --context "$CLUSTER_REF"
  solo_cmd deployment config create --deployment "$DEPLOYMENT" --namespace "$NAMESPACE"
  solo_cmd deployment cluster attach --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --num-consensus-nodes 1
  solo_cmd cluster-ref config setup --cluster-ref "$CLUSTER_REF"
  solo_cmd block node add --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --quiet-mode
  solo_cmd keys consensus generate --gossip-keys --tls-keys --deployment "$DEPLOYMENT"
  solo_cmd consensus network deploy --deployment "$DEPLOYMENT"
  solo_cmd consensus node setup --deployment "$DEPLOYMENT"
  solo_cmd consensus node start --deployment "$DEPLOYMENT"

  info "Deploying mirror node 1 (bucket, with pinger) and mirror node 2 (block node) on ${PREVIOUS_MIRROR_NODE_VERSION}"
  solo_cmd mirror node add --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --enable-ingress \
    --mirror-node-version "$PREVIOUS_MIRROR_NODE_VERSION" --mirror-node-source bucket --pinger --quiet-mode
  solo_cmd mirror node add --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --enable-ingress \
    --mirror-node-version "$PREVIOUS_MIRROR_NODE_VERSION" --mirror-node-source block-node --quiet-mode
}

verify_separate_resources() {
  info "Verifying the resources of the two mirror nodes are separate"
  for release in mirror-1 mirror-2 haproxy-ingress-1 haproxy-ingress-2; do
    assert_release "$release"
  done
  assert_secret mirror-passwords
  assert_secret mirror-passwords-2

  local classes
  classes=$(kubectl get ingressclass -o name | sort | tr '\n' ' ')
  [[ "$classes" == *"ingressclass.networking.k8s.io/mirror-ingress-class "* ]] || fail "ingress class mirror-ingress-class is missing"
  [[ "$classes" == *"ingressclass.networking.k8s.io/mirror-ingress-class-2 "* ]] || fail "ingress class mirror-ingress-class-2 is missing"
  success "both ingress classes exist"

  assert_eq "ingress class of mirror-1-rest" "mirror-ingress-class" \
    "$(kubectl get ingress -n "$NAMESPACE" mirror-1-rest -o jsonpath='{.spec.ingressClassName}')"
  assert_eq "ingress class of mirror-2-rest" "mirror-ingress-class-2" \
    "$(kubectl get ingress -n "$NAMESPACE" mirror-2-rest -o jsonpath='{.spec.ingressClassName}')"

  assert_eq "databases" "mirror_node,mirror_node_2" \
    "$(psql_postgres "select string_agg(datname, ',' order by datname) from pg_database where datname like 'mirror%'")"
  assert_eq "mirror node 2 database users" "8" \
    "$(psql_postgres "select count(*) from pg_roles where rolname like 'mirror%\_2'")"
}

verify_sources() {
  info "Verifying the importers use different sources"
  assert_eq "SPRING_PROFILES_ACTIVE of the bucket importer" "" "$(importer_env mirror-1)"
  [[ "$(importer_env mirror-2)" == *blocknode* ]] || fail "the block node importer does not have the blocknode profile"
  success "the block node importer has the blocknode profile"

  start_port_forwards

  info "Waiting for the pinger traffic to reach both mirror nodes"
  wait_for_traffic "$BUCKET_PORT" 20
  wait_for_traffic "$BLOCK_NODE_PORT" 20

  # hinTS partial signatures are submitted by the consensus nodes among themselves; the consensus node
  # writes them to the block stream but never to the record stream
  local latest='9999999999.999999999' bucket block_node
  bucket=$(fetch_transactions "$BUCKET_PORT" "$latest" 1)
  block_node=$(fetch_transactions "$BLOCK_NODE_PORT" "$latest" 1)
  assert_eq "HINTSPARTIALSIGNATURE transactions in the bucket mirror node" "0" "$(count_named "$bucket" HINTSPARTIALSIGNATURE)"
  local hints
  hints=$(count_named "$block_node" HINTSPARTIALSIGNATURE)
  (( hints > 0 )) || fail "the block node mirror node has no HINTSPARTIALSIGNATURE transactions"
  success "the block node mirror node has $hints HINTSPARTIALSIGNATURE transactions the bucket mirror node lacks"
}

# Values captured before the upgrade, to compare against afterwards
BEFORE_PASSWORDS_1=''
BEFORE_PASSWORDS_2=''
BEFORE_LATEST_TIMESTAMP=''

snapshot_before_upgrade() {
  info "Capturing the state of the mirror nodes before the upgrade"
  assert_chart_version mirror-1 "$PREVIOUS_MIRROR_NODE_VERSION"
  assert_chart_version mirror-2 "$PREVIOUS_MIRROR_NODE_VERSION"
  BEFORE_PASSWORDS_1=$(secret_data mirror-passwords)
  BEFORE_PASSWORDS_2=$(secret_data mirror-passwords-2)
  BEFORE_LATEST_TIMESTAMP=$(latest_user_timestamp "$BUCKET_PORT")
  info "Latest transaction before the upgrade: $BEFORE_LATEST_TIMESTAMP"
}

upgrade_mirror_nodes() {
  [[ -n "$CURRENT_MIRROR_NODE_VERSION" ]] || fail "could not determine the current mirror node version from version.ts"
  [[ "$CURRENT_MIRROR_NODE_VERSION" != "$PREVIOUS_MIRROR_NODE_VERSION" ]] ||
    fail "the previous and the current mirror node version are both $CURRENT_MIRROR_NODE_VERSION"

  # the source, the pinger and the ingress are passed again: none of them is remembered by an upgrade
  info "Upgrading mirror node 1 and mirror node 2 to ${CURRENT_MIRROR_NODE_VERSION}"
  solo_cmd mirror node upgrade --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --id 1 --enable-ingress \
    --mirror-node-version "$CURRENT_MIRROR_NODE_VERSION" --mirror-node-source bucket --pinger --quiet-mode
  solo_cmd mirror node upgrade --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --id 2 --enable-ingress \
    --mirror-node-version "$CURRENT_MIRROR_NODE_VERSION" --mirror-node-source block-node --quiet-mode
}

verify_after_upgrade() {
  info "Verifying the upgrade moved the mirror nodes and changed nothing else"
  assert_chart_version mirror-1 "$CURRENT_MIRROR_NODE_VERSION"
  assert_chart_version mirror-2 "$CURRENT_MIRROR_NODE_VERSION"
  assert_secret_values_kept mirror-passwords "$BEFORE_PASSWORDS_1"
  assert_secret_values_kept mirror-passwords-2 "$BEFORE_PASSWORDS_2"

  # the same checks as before the upgrade: separate resources, same sources, same ingresses and databases
  verify_separate_resources
  assert_eq "SPRING_PROFILES_ACTIVE of the bucket importer" "" "$(importer_env mirror-1)"
  [[ "$(importer_env mirror-2)" == *blocknode* ]] || fail "the block node importer lost the blocknode profile in the upgrade"
  success "the block node importer still has the blocknode profile"

  restart_port_forwards
  info "Waiting for new pinger traffic to reach both upgraded mirror nodes"
  wait_for_new_traffic "$BUCKET_PORT" "$BEFORE_LATEST_TIMESTAMP" 20
  wait_for_new_traffic "$BLOCK_NODE_PORT" "$BEFORE_LATEST_TIMESTAMP" 20
  compare_user_transactions "$BUCKET_PORT" "$BLOCK_NODE_PORT"
}

verify_destroy() {
  info "Destroying mirror node 2 while mirror node 1 keeps running"
  solo_cmd mirror node destroy --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --id 2 --force --quiet-mode

  assert_eq "databases after destroying mirror node 2" "mirror_node" \
    "$(psql_postgres "select string_agg(datname, ',' order by datname) from pg_database where datname like 'mirror%'")"
  assert_eq "mirror node 2 database users after destroy" "0" \
    "$(psql_postgres "select count(*) from pg_roles where rolname like 'mirror%\_2'")"
  assert_eq "shared roles after destroying mirror node 2" "3" \
    "$(psql_postgres "select count(*) from pg_roles where rolname in ('readonly','readwrite','temporary_admin')")"
  kubectl get secret -n "$NAMESPACE" mirror-passwords-2 &>/dev/null && fail "secret mirror-passwords-2 survived the destroy"
  success "mirror node 2 is gone"

  local before after
  before=$(curl -sf "http://localhost:${BUCKET_PORT}/api/v1/blocks?limit=1&order=desc" | jq -r '.blocks[0].number')
  sleep 20
  after=$(curl -sf "http://localhost:${BUCKET_PORT}/api/v1/blocks?limit=1&order=desc" | jq -r '.blocks[0].number')
  (( after > before )) || fail "mirror node 1 stopped ingesting after mirror node 2 was destroyed ($before -> $after)"
  success "mirror node 1 keeps ingesting ($before -> $after)"

  info "Destroying mirror node 1, the last mirror node"
  solo_cmd mirror node destroy --deployment "$DEPLOYMENT" --cluster-ref "$CLUSTER_REF" --id 1 --force --quiet-mode
  local postgres_pods
  postgres_pods=$(kubectl get pods -n "$NAMESPACE" -o name | grep -c solo-shared-resources-postgres || true)
  assert_eq "shared postgres pods after destroying the last mirror node" "0" "$postgres_pods"
}

main() {
  check_deps
  trap cleanup EXIT

  deploy
  verify_separate_resources
  verify_sources
  compare_user_transactions "$BUCKET_PORT" "$BLOCK_NODE_PORT"
  snapshot_before_upgrade
  upgrade_mirror_nodes
  verify_after_upgrade
  verify_destroy
  success "multiple mirror nodes test passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

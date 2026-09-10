#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# test-jvm-debugger.sh — Verify that --debug-node-alias exposes a working JDWP debug port.
#
# Strategy (no IntelliJ / GUI required):
#   1. Bootstrap a 2-node kind cluster with debug enabled on node2 (port 5005, JVM suspend=y).
#   2. Solo sets up kubectl port-forward (localhost:5005 → pod:5005) before showing the
#      interactive "attach debugger" prompt.
#   3. This script auto-confirms the debugger prompt using stdin redirection so it can:
#        a. Wait for localhost:5005 to be reachable.
#        b. Perform a JDWP handshake  ("JDWP-Handshake" → "JDWP-Handshake").
#        c. Send a VirtualMachine.Resume JDWP command so the JVM is no longer suspended.
#   4. Auto-answer "y" to the Solo prompt and wait for all nodes to reach ACTIVE.
#   5. Report PASS / FAIL and clean up.
#
# Requirements:
#   - node  (for JDWP test)
#   - kind, kubectl, helm, solo (npm run solo-test)
#
# Usage:
#   bash test-jvm-debugger.sh [--skip-bootstrap]
#     --skip-bootstrap   Skip cluster creation and key generation; assume they are already done.

set -eo pipefail

# Hard overall timeout for the entire script (default 5 minutes).
# This prevents the script from hanging indefinitely in any phase.
SCRIPT_TIMEOUT_SECONDS="${SCRIPT_TIMEOUT_SECONDS:-300}"
if [[ -z "${_JVM_DEBUGGER_TEST_WRAPPED:-}" ]]; then
  export _JVM_DEBUGGER_TEST_WRAPPED=1
  exec timeout --kill-after=10 "$SCRIPT_TIMEOUT_SECONDS" "$0" "$@"
fi

# ── configuration ──────────────────────────────────────────────────────────────
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment
NODE_ALIASES="node1,node2"
DEBUG_NODE=node2
DEBUG_PORT=5005
# Hard stop for the full solo start flow so tests fail boundedly instead of hanging.
NODE_START_TIMEOUT_SECONDS="${NODE_START_TIMEOUT_SECONDS:-180}"
# Separate timeout for JDWP handshake/resume retries.
JDWP_PROBE_WAIT_TIMEOUT_SECONDS="${JDWP_PROBE_WAIT_TIMEOUT_SECONDS:-60}"

SKIP_BOOTSTRAP=false
for arg in "$@"; do
  [[ "$arg" == "--skip-bootstrap" ]] && SKIP_BOOTSTRAP=true
done

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
  for cmd in node kind kubectl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "ERROR: missing required tools: ${missing[*]}" >&2
    exit 1
  fi
}

# Kill any process using the given port to ensure it's available
free_port() {
  local port=$1
  local pids

  # Find processes using the port (works on macOS and Linux)
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
  elif command -v netstat >/dev/null 2>&1; then
    pids=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | cut -d'/' -f1 || true)
  fi

  if [[ -n "$pids" ]]; then
    info "Freeing port $port (killing PIDs: $pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

# Wait for PID to exit with a timeout. Return 0 if process exits successfully, 1 if timeout or error.
wait_for_pid_with_timeout() {
  local pid=$1
  local timeout_seconds=$2
  local description="${3:-process $pid}"
  local deadline=$(($(date +%s) + timeout_seconds))

  # Poll until the process exits or we hit the deadline
  while true; do
    if ! kill -0 "$pid" 2>/dev/null; then
      # Process has exited
      break
    fi
    if (( $(date +%s) >= deadline )); then
      error "Timed out waiting for $description (PID $pid) after ${timeout_seconds}s"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
      return 1
    fi
    sleep 2
  done

  # Reap the process and get its exit code. Assign to exit_code before applying || so
  # that set -e does not exit the script before we check the value ourselves.
  local exit_code=0
  wait "$pid" 2>/dev/null || exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    error "$description (PID $pid) failed with exit code $exit_code"
    return 1
  fi
  return 0
}

cleanup() {
  echo
  info "Cleanup ..."

  # Kill specific background processes
  [[ -n "${JDWP_PROBE_PID:-}" ]] && kill -TERM "$JDWP_PROBE_PID" 2>/dev/null || true
  touch /tmp/solo-jdwp-stop  # Signal probe to exit
  sleep 2
  [[ -n "${JDWP_PROBE_PID:-}" ]] && kill -KILL "$JDWP_PROBE_PID" 2>/dev/null || true

  # Kill any remaining Solo processes that might be hanging
  pkill -f "jdwp-tester" 2>/dev/null || true
  pkill -f "persist-port-forward" 2>/dev/null || true
  pkill -f "solo-test.*consensus.*node.*start" 2>/dev/null || true

  # Free the debug port for future runs
  free_port "$DEBUG_PORT"

  # Clean up temp files
  /bin/rm -f /tmp/solo-jdwp-probe.log /tmp/solo-jdwp-stop

  if [[ "$SKIP_BOOTSTRAP" == false ]]; then
    # Do not call kind delete cluster so that we can inspect the cluster state after a failure if needed.
    /bin/rm -rf ~/.solo 2>/dev/null || true
  fi
}

trap cleanup EXIT

# ══════════════════════════════════════════════════════════════════════════════
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
info "BOOTSTRAP — creating cluster and deploying network"
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

RESULT=0

check_deps

# Ensure debug port is available by killing any process using it
free_port "$DEBUG_PORT"

if [[ "$SKIP_BOOTSTRAP" == false ]]; then
  # Clean up any stale state from previous runs
  kind delete cluster --name "$SOLO_CLUSTER_NAME" >/dev/null 2>&1 || true
  /bin/rm -rf ~/.solo 2>/dev/null || true

  kind create cluster --name "$SOLO_CLUSTER_NAME" --image kindest/node:v1.34.0 --wait 5m --config .github/workflows/script/kind-config.yaml

  npm run solo-test -- cluster-ref config connect --cluster-ref "$SOLO_CLUSTER_NAME" --context "kind-$SOLO_CLUSTER_NAME"
  npm run solo-test -- deployment config create --namespace "$SOLO_NAMESPACE" --deployment "$SOLO_DEPLOYMENT"
  npm run solo-test -- deployment cluster attach --deployment "$SOLO_DEPLOYMENT" --cluster-ref "$SOLO_CLUSTER_NAME" --num-consensus-nodes 2
  npm run solo-test -- cluster-ref config setup -s "$SOLO_CLUSTER_SETUP_NAMESPACE"
  npm run solo-test -- keys consensus generate --deployment "$SOLO_DEPLOYMENT" --gossip-keys --tls-keys -i "$NODE_ALIASES"
  npm run solo-test -- consensus network deploy --deployment "$SOLO_DEPLOYMENT" -i "$NODE_ALIASES" --debug-node-alias "$DEBUG_NODE"
  npm run solo-test -- consensus node setup --deployment "$SOLO_DEPLOYMENT" -i "$NODE_ALIASES"
fi

echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
info "TEST: --debug-node-alias $DEBUG_NODE  (JDWP port $DEBUG_PORT)"
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

# ── Step 1: verify JDWP args were applied ──────────────────────────────────────
info "Step 1: Verify pod $DEBUG_NODE carries JDWP JVM arg in Helm values"

# Check if environment variable is visible in the pod's environment:
if kubectl get pod "consensus-$DEBUG_NODE" -n "$SOLO_NAMESPACE" -o jsonpath='{.spec.containers[0].env[*].value}' 2>/dev/null | grep -q "\-agentlib:jdwp="; then
  success "JDWP argument found in pod environment for node $DEBUG_NODE"
else
  info "JDWP arg not visible in pod env at pre-start (may be injected at start time); continuing."
fi

# ── Step 2: start nodes with debugger, auto-confirm the interactive prompt ───
info "Step 2: Starting nodes with --debug-node-alias ${DEBUG_NODE} (auto-confirm)"

/bin/rm -f /tmp/solo-jdwp-stop

# Start JDWP probe in background FIRST - it retries until the debug port is reachable.
# Probe both the configured port and detect the actual port from logs.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
info "Starting JDWP probe in background (will connect once port-forward is ready)"
npx tsx "${SCRIPT_DIR}/jdwp-tester.ts" localhost ${DEBUG_PORT} --timeout ${JDWP_PROBE_WAIT_TIMEOUT_SECONDS} > /tmp/solo-jdwp-probe.log 2>&1 &
JDWP_PROBE_PID=$!

# Give the JDWP probe a moment to start probing
sleep 2

# Run node start in foreground with "y" piped to auto-answer the debug prompt.
# The "y" sits in the pipe buffer until Solo reads stdin for the prompt.
# Use a much shorter timeout and kill process group if it hangs.
info "Auto-confirming debugger prompt via stdin pipe (timeout: ${NODE_START_TIMEOUT_SECONDS}s)"
info "Expected sequence: JVM suspends → JDWP connects → VirtualMachine.Resume → auto-confirm 'y' → node becomes ACTIVE"

# Set up a process group to ensure we can kill everything
set -m  # Enable job control
if ! timeout --kill-after=5 "$NODE_START_TIMEOUT_SECONDS" bash -c \
  'echo y | npm run solo-test -- consensus node start --deployment '"${SOLO_DEPLOYMENT}"' -i '"${NODE_ALIASES}"' --debug-node-alias '"${DEBUG_NODE}"' --quiet-mode'; then
  exit_code=$?
  if [[ $exit_code -eq 124 ]]; then
    error "consensus node start timed out after ${NODE_START_TIMEOUT_SECONDS}s"
  else
    error "consensus node start failed with exit code $exit_code"
  fi
  RESULT=1
fi
set +m  # Disable job control

# Stop the probe loop and wait for it to finish.
touch /tmp/solo-jdwp-stop
if wait_for_pid_with_timeout "$JDWP_PROBE_PID" 30 "JDWP probe shutdown"; then
  # Check if JDWP probe successfully connected and resumed
  if [[ -f /tmp/solo-jdwp-probe.log ]] && grep -q "Handshake + Resume successful" /tmp/solo-jdwp-probe.log; then
    success "JDWP debugger connected and JVM resumed successfully"
  else
    error "JDWP debugger failed to connect or resume JVM"
    RESULT=1
  fi
else
  RESULT=1
fi

# ── VERDICT ─────────────────────────────────────────────────────────────────────
echo
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
if [[ "$RESULT" -eq 0 ]]; then
  success "PASS: All verification steps passed"
else
  error "FAIL: One or more verification steps failed"
  if [[ -f /tmp/solo-jdwp-probe.log ]]; then
    echo "JDWP probe output:"
    cat /tmp/solo-jdwp-probe.log
  fi
fi
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

exit "$RESULT"
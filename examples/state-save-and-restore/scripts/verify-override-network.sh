#!/usr/bin/env bash
#
# Asserts that a transplanted network adopted the roster solo generated for it, rather than the one carried
# inside the restored state.
#
# Usage: verify-override-network.sh <target-namespace> <source-namespace>

set -uo pipefail

TARGET_NAMESPACE=${1:?target namespace required}
SOURCE_NAMESPACE=${2:?source namespace required}
HAPI=/opt/hgcapp/services-hedera/HapiApp2.0
FAILURES=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

POD=$(kubectl get pods -n "$TARGET_NAMESPACE" -l solo.hedera.com/type=network-node \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$POD" ]; then
  fail "no consensus node pod in $TARGET_NAMESPACE"
  exit 1
fi
echo "verifying $TARGET_NAMESPACE/$POD"

in_pod() { kubectl exec -n "$TARGET_NAMESPACE" "$POD" -c root-container -- sh -c "$1" 2>/dev/null; }

# Probe once before asserting. in_pod discards stderr, so a failed exec is indistinguishable from a grep
# that matched nothing — and the AccessDeniedException assertion below tests for *absence*, so it would
# report PASS against a pod that was never reached.
if ! kubectl exec -n "$TARGET_NAMESPACE" "$POD" -c root-container -- true >/dev/null 2>&1; then
  fail "cannot exec into $TARGET_NAMESPACE/$POD; nothing below can be trusted"
  exit 1
fi

# The node reporting that it parsed the file is the strongest evidence available; everything else is
# circumstantial. Note the node MOVES the file into data/config/.archive/<round>/ once it has been consumed,
# so asserting on data/config/override-network.json after a successful start would wrongly fail.
if [ -n "$(in_pod "grep -h 'Parsed OVERRIDE network info' $HAPI/output/hgcaa.log")" ]; then
  pass "consensus node parsed override-network.json"
else
  fail "node never parsed override-network.json"
fi

# A root-owned file is rejected here while the rest of the deploy still looks healthy.
if [ -z "$(in_pod "grep -h 'AccessDeniedException.*override-network' $HAPI/output/hgcaa.log")" ]; then
  pass "file was readable by the hedera user the node runs as"
else
  fail "node was denied access to override-network.json"
fi

# The consumed roster must describe this network, not the one the state came from.
ARCHIVED=$(in_pod "find $HAPI/data/config/.archive -name override-network.json | head -1")
if [ -n "$ARCHIVED" ] &&
  [ -n "$(in_pod "grep -o '$TARGET_NAMESPACE' $ARCHIVED")" ] &&
  [ -z "$(in_pod "grep -o '$SOURCE_NAMESPACE' $ARCHIVED")" ]; then
  pass "roster describes $TARGET_NAMESPACE, not $SOURCE_NAMESPACE"
else
  fail "roster did not describe $TARGET_NAMESPACE (checked ${ARCHIVED:-<not found>})"
fi

# With keys generated separately from the source network, reaching this state at all requires the override.
if [ "$(in_pod "grep -c 'signing certificate does not match' $HAPI/output/swirlds.log")" = "0" ] &&
  [ "$(kubectl get pod "$POD" -n "$TARGET_NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null)" = "Running" ]; then
  pass "node running with no signing-certificate mismatch"
else
  fail "node did not come up cleanly from the transplanted state"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mtransplant verified\033[0m\n'
else
  printf '\033[31m%s assertion(s) failed\033[0m\n' "$FAILURES"
fi
exit "$FAILURES"

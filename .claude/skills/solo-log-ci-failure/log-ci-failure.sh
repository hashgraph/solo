#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Solo CI Failure Logger
#
# Fetches CI failure data, extracts errors, creates a secret gist of all log
# files, and files a fully-tagged P0 Bug issue in hiero-ledger/solo.
#
# Usage:
#   bash log-ci-failure.sh <workflow-url> [<parent-issue-id>]
#
# Supported URL formats:
#   https://github.com/hiero-ledger/solo/actions/runs/<RUN_ID>/job/<JOB_ID>
#   https://github.com/hiero-ledger/solo/actions/runs/<RUN_ID>
#   https://github.com/hiero-ledger/solo/suites/<SUITE_ID>/logs?attempt=1
#
# Arguments:
#   workflow-url     Required.
#   parent-issue-id  Optional. Node ID of initiative issue to link as parent.
#                    Defaults to Q3 2026 Developer Experience (#5004).
#
# Requirements: gh (with repo + gist scopes), jq, bash 4+

set -euo pipefail

# --dry-run performs every read-only step (fetch, download, extract) and prints
# the generated title and body, but creates no gist, issue, or board item. Use
# it to confirm the extracted root cause is the right one before filing.
DRY_RUN=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) ARGS+=("$arg") ;;
  esac
done
set -- "${ARGS[@]+${ARGS[@]}}"

INPUT_URL="${1:?Usage: bash log-ci-failure.sh <workflow-url> [parent-issue-id] [--dry-run]}"
PARENT_ISSUE_ID="${2:-I_kwDOLMTWdc8AAAABIo7dFw}"

# ── Parse IDs from URL ────────────────────────────────────────────────────────
RUN_ID=$(echo "$INPUT_URL" | grep -oE 'runs/[0-9]+'    | head -1 | cut -d/ -f2 || true)
JOB_ID=$(echo "$INPUT_URL" | grep -oE 'job/[0-9]+'     | head -1 | cut -d/ -f2 || true)
SUITE_ID=$(echo "$INPUT_URL" | grep -oE 'suites/[0-9]+' | head -1 | cut -d/ -f2 || true)

# Resolve suite → run
if [[ -z "${RUN_ID:-}" && -n "${SUITE_ID:-}" ]]; then
  RUN_ID=$(gh api "repos/hiero-ledger/solo/check-suites/${SUITE_ID}/check-runs" \
    --jq '.check_runs[0].details_url' 2>/dev/null \
    | grep -oE 'runs/[0-9]+' | head -1 | cut -d/ -f2 || true)
  if [[ -z "${RUN_ID:-}" ]]; then
    HEAD_SHA=$(gh api "repos/hiero-ledger/solo/check-suites/${SUITE_ID}" --jq '.head_sha')
    RUN_ID=$(gh api "repos/hiero-ledger/solo/actions/runs?head_sha=${HEAD_SHA}&per_page=10" \
      --jq '.workflow_runs[0].id' 2>/dev/null || true)
  fi
fi

[[ -z "${RUN_ID:-}" ]] && { echo "ERROR: could not parse RUN_ID from: ${INPUT_URL}"; exit 1; }
echo "run=${RUN_ID}  job=${JOB_ID:-<resolving>}"

# ── Scratch dir ───────────────────────────────────────────────────────────────
SCRATCH="/tmp/solo-ci-${RUN_ID}"
mkdir -p "${SCRATCH}/artifact"

# ── Run metadata ──────────────────────────────────────────────────────────────
echo "Fetching run metadata..."
RUN_META=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}" \
  --jq '{name:.name,run_number:.run_number,head_branch:.head_branch,
         html_url:.html_url,attempt:.run_attempt}')
RUN_NUMBER=$(echo "$RUN_META"  | jq -r '.run_number')
RUN_URL=$(echo "$RUN_META"     | jq -r '.html_url')
RUN_ATTEMPT=$(echo "$RUN_META" | jq -r '.attempt')
HEAD_BRANCH=$(echo "$RUN_META" | jq -r '.head_branch')

# ── Job info ──────────────────────────────────────────────────────────────────
echo "Fetching job metadata..."
if [[ -n "${JOB_ID:-}" ]]; then
  JOB_META=$(gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}" \
    --jq '{id:.id,name:.name,conclusion:.conclusion,html_url:.html_url}')
else
  JOB_META=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/jobs?per_page=100" \
    --jq '[.jobs[]|select(.conclusion=="failure")]|first|
          {id:.id,name:.name,conclusion:.conclusion,html_url:.html_url}')
  JOB_ID=$(echo "$JOB_META" | jq -r '.id')
fi
JOB_NAME=$(echo "$JOB_META" | jq -r '.name')
JOB_URL=$(echo "$JOB_META"  | jq -r '.html_url')
echo "  job: ${JOB_NAME} (${JOB_ID})"

# ── Artifacts — list + auto-select best match ─────────────────────────────────
echo "Listing artifacts..."
ARTIFACTS_JSON=$(gh api "repos/hiero-ledger/solo/actions/runs/${RUN_ID}/artifacts" 2>/dev/null \
  || echo '{"artifacts":[]}')

JOB_SLUG=$(echo "$JOB_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//')
# Score = size of the (deduplicated) token intersection between the job slug
# and the artifact name, both normalized the same way (lowercase, non-alnum
# runs -> "-") first. Two bugs made the original formula pick unrelated
# artifacts in multi-job runs: (1) it split only on "-", so underscore/mixed-
# case names (e.g. "E2E_Integration_Tests_Coverage_Report") never shared a
# token with the slug; (2) it flattened slug+name tokens into one list and
# counted *any* repeated value, which also fires when a token merely repeats
# within the artifact name itself (e.g. "e2e" and "test" both appear twice in
# "e2e_test_report_test-e2e-integration"), regardless of the job slug. Using
# a real set intersection and requiring score > 0 lets the "log"-name and
# single-artifact fallbacks below run instead of surfacing a false match.
ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | jq -r --arg slug "$JOB_SLUG" '
  ($slug | split("-") | unique) as $slug_tokens
  | [.artifacts[]|select(.expired==false)]
  | map(. + {score: ((.name|ascii_downcase|gsub("[^a-z0-9]+";"-")|split("-")|unique) as $name_tokens
                      | [$slug_tokens[] | select(IN($name_tokens[]))] | length)})
  | map(select(.score>0))
  | sort_by(-.score) | .[0].name // ""' 2>/dev/null || true)
# Both fallbacks below require the candidate set to be unambiguous (exactly
# one match) rather than blindly taking "the first" — with several unrelated
# artifacts in a multi-job workflow run, guessing produces exactly the kind of
# misattributed artifact this scoring fix was added for. Better to attach no
# artifact than the wrong one.
[[ -z "${ARTIFACT_NAME:-}" ]] && \
  ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | \
    jq -r '[.artifacts[]|select(.expired==false)|select(.name|test("log";"i"))]
      | if length==1 then .[0].name else "" end')
[[ -z "${ARTIFACT_NAME:-}" ]] && \
  ARTIFACT_NAME=$(echo "$ARTIFACTS_JSON" | \
    jq -r '[.artifacts[]|select(.expired==false)] | if length==1 then .[0].name else "" end')
echo "  artifact: ${ARTIFACT_NAME:-"(none)"}"

# ── Download job log ──────────────────────────────────────────────────────────
echo "Downloading job log..."
JOB_LOG_PATH="${SCRATCH}/job-${JOB_ID}.log"
# Never use `gh run view --log-failed` — it returns empty for matrix/integration jobs.
gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}/logs" 2>/dev/null \
  > "$JOB_LOG_PATH" \
  && echo "  $(wc -l < "$JOB_LOG_PATH") lines" \
  || { echo "  unavailable"; printf "(job log unavailable)\n" > "$JOB_LOG_PATH"; }

# ── Download artifact ─────────────────────────────────────────────────────────
ARTIFACT_DIR="${SCRATCH}/artifact"
if [[ -n "${ARTIFACT_NAME:-}" ]]; then
  echo "Downloading artifact: ${ARTIFACT_NAME}..."
  gh run download "${RUN_ID}" --repo hiero-ledger/solo \
    --name "${ARTIFACT_NAME}" --dir "${ARTIFACT_DIR}/" 2>/dev/null \
    && echo "  done" || echo "  not found or expired — continuing without it"
fi

SOLO_LOG="${ARTIFACT_DIR}/solo.log"
DIAG="${ARTIFACT_DIR}/hiero-components-logs/diagnostics-analysis.txt"

# ── Failed step — scope error extraction to it, not the whole job log ────────
# A job's raw log interleaves every step. A later, unrelated step (e.g. a
# best-effort diagnostics collector run with `... || true`) can print its own
# SOLO-NNNN error box even though that step itself succeeded — a plain
# first-match grep over the whole log picks that up instead of the step that
# actually failed. Slice the log down to the first failed step's time window
# so every extraction below only sees that step's own output.
echo "Fetching job steps..."
JOB_STEPS_JSON=$(gh api "repos/hiero-ledger/solo/actions/jobs/${JOB_ID}" --jq '.steps' 2>/dev/null || echo '[]')
FAILED_STEP_JSON=$(echo "$JOB_STEPS_JSON" | jq -c '[.[]|select(.conclusion=="failure")]|sort_by(.number)|.[0] // empty')

FAILED_STEP_NAME=""
FAILED_STEP_START=""
NEXT_STEP_START=""
if [[ -n "${FAILED_STEP_JSON:-}" ]]; then
  FAILED_STEP_NAME=$(echo "$FAILED_STEP_JSON" | jq -r '.name // empty')
  FAILED_STEP_START=$(echo "$FAILED_STEP_JSON" | jq -r '.started_at // empty' | cut -c1-19)
  FAILED_STEP_NUMBER=$(echo "$FAILED_STEP_JSON" | jq -r '.number // empty')
  [[ -n "${FAILED_STEP_NUMBER:-}" ]] && \
    NEXT_STEP_START=$(echo "$JOB_STEPS_JSON" | jq -r --argjson n "$FAILED_STEP_NUMBER" '
      [.[]|select(.number>$n)|select(.started_at!=null)]|sort_by(.number)|.[0].started_at // empty' \
      | cut -c1-19)
fi
echo "  failed step: ${FAILED_STEP_NAME:-"<none found — using whole job log>"}"

# GitHub's step started_at/completed_at are whole-second, but the step's own
# last log lines carry fractional seconds and commonly land on that same
# whole second as the next step's started_at — an exact/exclusive boundary
# would clip the tail of the failing step's own output (including the actual
# error) right when it matters most. Pad the upper bound by a few seconds;
# the next step's own content still starts well after that in practice.
add_seconds_to_iso() {
  local ts="$1" secs="$2"
  local date_part="${ts:0:10}" h="${ts:11:2}" m="${ts:14:2}" s="${ts:17:2}"
  local total=$(( 10#$h * 3600 + 10#$m * 60 + 10#$s + secs ))
  total=$(( total % 86400 ))
  printf '%sT%02d:%02d:%02d' "$date_part" $((total/3600)) $((total%3600/60)) $((total%60))
}

FAILED_STEP_LOG_PATH="${SCRATCH}/failed-step.log"
if [[ -n "${FAILED_STEP_START:-}" ]]; then
  if [[ -n "${NEXT_STEP_START:-}" ]]; then
    NEXT_STEP_START_BUFFERED=$(add_seconds_to_iso "$NEXT_STEP_START" 3)
    awk -v start="$FAILED_STEP_START" -v end="$NEXT_STEP_START_BUFFERED" \
      '{ts=substr($0,1,19); if (ts>=start && ts<end) print}' \
      "$JOB_LOG_PATH" > "$FAILED_STEP_LOG_PATH" 2>/dev/null || true
  else
    awk -v start="$FAILED_STEP_START" \
      '{ts=substr($0,1,19); if (ts>=start) print}' \
      "$JOB_LOG_PATH" > "$FAILED_STEP_LOG_PATH" 2>/dev/null || true
  fi
fi
# No step metadata, or the slice came up empty — fall back to the whole job
# log rather than lose signal entirely.
[[ -s "$FAILED_STEP_LOG_PATH" ]] || cp "$JOB_LOG_PATH" "$FAILED_STEP_LOG_PATH"

# solo.log is a single artifact file and may span multiple steps (or belong to
# a step other than the one that failed, as above). Only trust it for this run
# when the failed step's own output shows a solo command actually ran there —
# identified by solo's own banner line.
FAILED_STEP_RAN_SOLO=false
grep -q "Current Command" "$FAILED_STEP_LOG_PATH" 2>/dev/null && FAILED_STEP_RAN_SOLO=true

# ── Extract errors ────────────────────────────────────────────────────────────
echo "Extracting errors..."

# Infrastructure failures — a pod that never becomes ready because a container
# is crash-looping, unschedulable, or failing to pull — are logged by solo at
# *INFO* level, not ERROR. They are almost always the root cause, and they are
# reported minutes before the ERROR-level symptom they cause (see the
# "root cause candidate" note below). Every extraction pattern in this script
# used to be ERROR/exception-shaped, so this whole class was invisible.
POD_FAILURE_RE='Pod readiness check failed|did not reach the required state|CrashLoopBackOff|ImagePullBackOff|ErrImagePull|InvalidImageName|CreateContainerConfigError|OOMKilled|Init:Error|Unschedulable|FailedScheduling|FailedMount'

# Lines the diagnostics collector prints while echoing solo.log back to itself
# ("- line 2631: [..] ERROR: ..."), plus the noisy container-engine probe
# cascade. Both re-report other errors and must never win as a root cause.
ECHO_NOISE_RE="line [0-9]+: |Error executing: '"

JOB_ERRORS=$(grep -E "SOLO-[0-9]+|╭|╰|Current Command|##\[error\]|AssertionError|Timeout of [0-9]+ms|failed with error|exit status [1-9][0-9]*|${POD_FAILURE_RE}" \
  "$FAILED_STEP_LOG_PATH" 2>/dev/null \
  | grep -v "timeout_minutes\|continue_on_error\|shell:\|DOCKER_HOST\|STEP_TIMEOUT\|warn deprecated" \
  | head -50 || true)

SOLO_ERRORS=""
[[ -f "$SOLO_LOG" && "$FAILED_STEP_RAN_SOLO" == true ]] && \
  SOLO_ERRORS=$(grep -E "ERROR|SOLO-[0-9]+|Current Command" "$SOLO_LOG" 2>/dev/null | head -40 || true)

# All distinct pod/container-state failures, in first-seen (chronological)
# order. Reported as their own issue section: when several pods crash-loop, the
# set matters — one pod's name in the title is not the whole picture.
POD_FAILURES=$(grep -hE "${POD_FAILURE_RE}" "$FAILED_STEP_LOG_PATH" 2>/dev/null \
  | grep -vE "${ECHO_NOISE_RE}" | head -20 || true)
if [[ -z "${POD_FAILURES:-}" && "$FAILED_STEP_RAN_SOLO" == true && -f "$SOLO_LOG" ]]; then
  POD_FAILURES=$(grep -hE "${POD_FAILURE_RE}" "$SOLO_LOG" 2>/dev/null \
    | grep -vE "${ECHO_NOISE_RE}" | head -20 || true)
fi

# `exit status 124` is the shell's timeout-kill status: the step was killed by
# `timeout`, so *nothing threw* and there is no exception or SOLO code to find.
# In that case the pod-state evidence above is the only real root cause, and it
# must outrank any ERROR-level symptom logged before the kill.
TIMEOUT_KILLED=false
grep -qE "exit status 124|Timeout of [0-9]+ms|timed out (after|waiting)" "$FAILED_STEP_LOG_PATH" 2>/dev/null \
  && TIMEOUT_KILLED=true

DIAG_TEXT=""
[[ -f "$DIAG" ]] && DIAG_TEXT=$(cat "$DIAG")

# ── Auto-generate issue title ─────────────────────────────────────────────────
# Priority: SOLO code → first meaningful ERROR: line → ##[error] → fallback

# "Error: Executing command: /path/cmd --flags url dest" → "cmd url"
# Prefers a URL-like token (contains dot-slash, e.g. "quay.io/") over generic flag values.
extract_cmd_summary() {
  local rest
  rest=$(echo "$1" | sed 's|.*Executing command: [^ ]*/||')
  local url_tok
  url_tok=$(echo "$rest" | tr ' ' '\n' | grep -E '[a-zA-Z0-9][.][a-zA-Z0-9]+/' | head -1 || true)
  if [[ -n "${url_tok:-}" ]]; then
    echo "$(echo "$rest" | awk '{print $1}') ${url_tok}"
  else
    echo "$rest" | awk '{print $1}'
  fi
}

# A raw readiness line is ~350 characters of labels and container states — far
# too long for a title. Condense it to "Pod <name> not ready: container <c>
# <State>", keeping the two facts that identify the failure.
condense_pod_failure() {
  local line="$1" pod container container_name state
  pod=$(echo "$line" | sed -nE 's/.*[Pp]od ([A-Za-z0-9][A-Za-z0-9.-]*) (matched|did not|is |has ).*/\1/p' | head -1)
  # Drop the ReplicaSet+pod hash suffix ("haproxy-node2-7fc8fb7456-fgb64" ->
  # "haproxy-node2"): it is regenerated every deploy, so keeping it makes the
  # title unreadably long and gives the same recurring flake a different title
  # on every run, defeating duplicate detection. A StatefulSet ordinal
  # ("network-node1-0") is meaningful and is left intact.
  pod=$(echo "$pod" | sed -E 's/-[a-z0-9]{9,10}-[a-z0-9]{5}$//')
  # The first container the line reports as not-ready, with its state clause.
  container=$(echo "$line" | grep -oE '[a-z0-9-]+ \(ready: false[^)]*\)' | head -1 || true)
  container_name="${container%% (*}"
  state=$(echo "$container" | grep -oE '(waiting|terminated): [A-Za-z]+' | head -1 | sed 's/.*: //' || true)
  # Fall back to whichever failure keyword the line does carry (FailedScheduling,
  # OOMKilled, ...) when it is not in the container-status shape above.
  [[ -z "${state:-}" ]] && state=$(echo "$line" | grep -oE "${POD_FAILURE_RE}" | grep -vE 'Pod readiness check failed|did not reach the required state' | head -1 || true)

  if [[ -n "${pod:-}" && -n "${container_name:-}" && -n "${state:-}" ]]; then
    echo "Pod ${pod} not ready: container ${container_name} ${state}"
  elif [[ -n "${pod:-}" && -n "${state:-}" ]]; then
    echo "Pod ${pod} not ready: ${state}"
  elif [[ -n "${pod:-}" ]]; then
    echo "Pod ${pod} did not reach the required state"
  else
    # No pod name parsed — hand back the de-prefixed line, truncated by caller.
    echo "$line" | sed -E 's/^\[[0-9:.]+\] [A-Z]+: //' | sed -E 's/ \[traceId=.*$//'
  fi
}

# Remove GitHub log prefixes/ANSI noise and extract the most informative
# exception stack block from a log.
extract_exception_stack() {
  local log_path="$1"
  [[ -f "${log_path}" ]] || return 0

  awk '
function clean_line(value, cleaned) {
  cleaned = value
  gsub(/\r/, "", cleaned)
  sub(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z[[:space:]]+/, "", cleaned)
  gsub(/\033\[[0-9;]*[[:alpha:]]/, "", cleaned)
  # Strip a Task/go-task "[job-name] " log-group prefix that Task prepends to
  # every output line of a step -- without this, neither the headline anchor
  # nor the "at ..." frame anchor below ever matches Task-wrapped step output.
  # Only the single separator space is consumed, preserving any indentation
  # that follows it (frame detection below needs that leading whitespace).
  sub(/^\[[^]]*\][[:space:]]/, "", cleaned)
  # Strip a leading marker glyph (e.g. the "\xe2\x9d\x8c " in "\xe2\x9d\x8c Error: ...")
  # so headline detection below still anchors on "Error:"/"Exception:".
  sub(/^[^[:alnum:][:space:]]+[[:space:]]*/, "", cleaned)
  return cleaned
}

function flush_block() {
  if (current_stack != "") {
    if ((current_frames > best_frames) || (current_frames == best_frames && length(current_stack) > length(best_stack))) {
      best_stack = current_stack
      best_frames = current_frames
    }
  }
  current_stack = ""
  current_frames = 0
  in_stack = 0
}

BEGIN {
  in_stack = 0
  current_frames = 0
  best_frames = -1
  current_stack = ""
  best_stack = ""
}

{
  line = clean_line($0)

  if (line ~ /^[[:space:]]*[A-Za-z0-9_.-]*(Error|Exception|SoloError):[[:space:]]+/) {
    flush_block()
    in_stack = 1
    current_stack = line ORS
    next
  }

  if (in_stack && line ~ /^[[:space:]]*Caused by:[[:space:]]+/) {
    current_stack = current_stack line ORS
    next
  }

  if (in_stack && line ~ /^[[:space:]]+at[[:space:]]+/) {
    current_stack = current_stack line ORS
    current_frames++
    next
  }

  if (in_stack && line ~ /^[[:space:]]*$/) {
    # Preserve blank spacing within stack traces without over-capturing.
    current_stack = current_stack line ORS
    next
  }

  if (in_stack) {
    flush_block()
  }
}

END {
  flush_block()
  printf "%s", best_stack
}
' "${log_path}" | sed '/^[[:space:]]*$/N;/^\n$/D'
}

# Scoped to the failed step first — see "Failed step" section above for why.
STACK_TRACE=$(extract_exception_stack "$FAILED_STEP_LOG_PATH" || true)
[[ -z "${STACK_TRACE:-}" && "$FAILED_STEP_RAN_SOLO" == true && -f "$SOLO_LOG" ]] && \
  STACK_TRACE=$(extract_exception_stack "$SOLO_LOG" || true)
[[ -z "${STACK_TRACE:-}" ]] && STACK_TRACE=$(extract_exception_stack "$JOB_LOG_PATH" || true)

STACK_FIRST_LINE=$(echo "${STACK_TRACE:-}" | grep -m1 -E '^[[:space:]]*[A-Za-z0-9_.-]*(Error|Exception|SoloError):[[:space:]]+' || true)

# Scoped to the failed step — a later, unrelated step's SOLO-NNNN must not
# outrank the code (if any) that the failed step itself reported.
SOLO_CODE=$(grep -oE 'SOLO-[0-9]+' "$FAILED_STEP_LOG_PATH" 2>/dev/null | head -1 || true)

if [[ -n "${SOLO_CODE:-}" ]]; then
  SOLO_MSG=""
  [[ "$FAILED_STEP_RAN_SOLO" == true && -f "$SOLO_LOG" ]] && \
    SOLO_MSG=$(grep -A2 "$SOLO_CODE" "$SOLO_LOG" 2>/dev/null \
      | grep "ERROR:" | head -1 | sed 's/.*ERROR: //' | cut -c1-80 || true)
  ERROR_DESC="[${SOLO_CODE}]${SOLO_MSG:+ ${SOLO_MSG}}"
elif [[ -n "${POD_FAILURES:-}" && "$TIMEOUT_KILLED" == true ]]; then
  # Timeout-killed step: nothing threw, so the earliest pod-state failure is
  # the root cause. Without this branch the title came from the first
  # ERROR-level line instead — a downstream symptom logged minutes later (e.g.
  # "failed to sdk ping network node" for an SDK call routed through a
  # port-forward whose haproxy backend was in CrashLoopBackOff the whole time).
  ERROR_DESC=$(condense_pod_failure "$(echo "$POD_FAILURES" | head -1)" | cut -c1-100)
else
  # Skip generic "Error executing: 'podman' {" / "Error executing: 'sudo' {" lines.
  # Only consult solo.log's leveled-log format when the failed step's own
  # output confirms a solo command actually ran there (see FAILED_STEP_RAN_SOLO).
  #
  # Root cause candidate: match ERROR-level lines *and* INFO-level pod/container
  # state failures in a single pass and take the earliest hit. solo.log is
  # append-only, so file order is chronological order — and the earliest failure
  # is the cause, while later ones are usually its consequences. Grepping only
  # for "ERROR:" silently ranked by log level instead of by time, which reports
  # a symptom whenever the true cause was logged at INFO.
  FIRST_SOLO_ERROR=""
  FIRST_SOLO_RAW=""
  if [[ "$FAILED_STEP_RAN_SOLO" == true && -f "$SOLO_LOG" ]]; then
    FIRST_SOLO_RAW=$(grep -hE "ERROR:|${POD_FAILURE_RE}" "$SOLO_LOG" 2>/dev/null \
      | grep -vE "${ECHO_NOISE_RE}" | head -1 || true)
    FIRST_SOLO_ERROR=$(echo "$FIRST_SOLO_RAW" | sed 's/.*\] ERROR: //' | sed 's/.*ERROR: //')
  fi

  if [[ -n "${FIRST_SOLO_RAW:-}" ]] && echo "$FIRST_SOLO_RAW" | grep -qE "${POD_FAILURE_RE}"; then
    ERROR_DESC=$(condense_pod_failure "$FIRST_SOLO_RAW" | cut -c1-100)
  elif [[ -n "${FIRST_SOLO_ERROR:-}" ]]; then
    if echo "$FIRST_SOLO_ERROR" | grep -q "Executing command:"; then
      ERROR_DESC=$(extract_cmd_summary "$FIRST_SOLO_ERROR")
    else
      ERROR_DESC=$(echo "$FIRST_SOLO_ERROR" | cut -c1-90)
    fi
  elif [[ -n "${STACK_FIRST_LINE:-}" ]]; then
    STACK_HEADLINE=$(echo "$STACK_FIRST_LINE" | sed -E 's/^[[:space:]]+//' | tr -s ' ')
    ERROR_DESC=$(echo "$STACK_HEADLINE" | cut -c1-90)
  else
    JOB_ERR_LINE=$(grep "##\[error\]" "$FAILED_STEP_LOG_PATH" 2>/dev/null \
      | head -1 | sed 's/.*##\[error\]//' | cut -c1-90 || true)
    ERROR_DESC="${JOB_ERR_LINE:-task failed}"
  fi
fi

TITLE="${JOB_NAME} > ${ERROR_DESC}"
# Truncate on a word boundary with an ellipsis rather than mid-word — a hard
# 120-char cut produced titles ending in fragments like "container haproxy CrashLo".
if (( ${#TITLE} > 120 )); then
  TITLE="$(echo "${TITLE:0:117}" | sed -E 's/[[:space:]]+[^[:space:]]*$//')…"
fi
echo "  title: ${TITLE}"

# ── Current Command ───────────────────────────────────────────────────────────
# Scoped to the failed step: an unrelated later step's banner (e.g. a
# best-effort diagnostics collector) must not be reported as the failed command.
# `deployment diagnostics logs` is the best-effort collector the test harness
# always runs *after* a failure — and it runs inside the failing step, so step
# slicing does not exclude it. Taking the last banner reported the collector as
# the failed command; skip it so the real command wins.
CURRENT_COMMAND=$(grep "Current Command" "$FAILED_STEP_LOG_PATH" 2>/dev/null \
  | grep -v "^Binary\|init --debug\|diagnostics logs" \
  | tail -1 | sed 's/.*Current Command[[:space:]]*:[[:space:]]*//' || true)

# ── Error box ─────────────────────────────────────────────────────────────────
# Solo prints the same error box to the console, so the failed step's own
# output is checked first; solo.log is only a fallback, and only when this run
# already confirmed a solo command executed within that step.
ERROR_BOX=$(awk '/╭─ ERROR/{found=1} found{print} /╰─/{if(found) exit}' "$FAILED_STEP_LOG_PATH" 2>/dev/null || true)
[[ -z "${ERROR_BOX:-}" && "$FAILED_STEP_RAN_SOLO" == true && -f "$SOLO_LOG" ]] && \
  ERROR_BOX=$(awk '/╭─ ERROR/{found=1} found{print} /╰─/{if(found) exit}' "$SOLO_LOG" 2>/dev/null || true)

# Error details: prefer pod-state evidence on a timeout kill (no exception was
# ever thrown, so any stack trace found is incidental), then stack trace → box
# → solo errors → job errors.
if [[ -n "${POD_FAILURES:-}" && "$TIMEOUT_KILLED" == true ]]; then
  ERROR_DETAILS=$(echo "$POD_FAILURES" | sed -E 's/ \[traceId=.*$//' | head -10)
elif [[ -n "${STACK_TRACE:-}" ]]; then
  ERROR_DETAILS="$STACK_TRACE"
elif [[ -n "${ERROR_BOX:-}" ]]; then
  ERROR_DETAILS="$ERROR_BOX"
elif [[ -n "${SOLO_ERRORS:-}" ]]; then
  ERROR_DETAILS=$(echo "$SOLO_ERRORS" | head -20)
else
  ERROR_DETAILS=$(echo "$JOB_ERRORS" | head -20)
fi

# ── Build issue body ──────────────────────────────────────────────────────────
SUMMARY_NOTE=""
[[ "$TIMEOUT_KILLED" == true ]] && SUMMARY_NOTE="
The step was killed by its timeout (\`exit status 124\`) rather than failing with a
thrown error, so the pod/container state below is the root-cause evidence — any
\`ERROR\`-level lines logged before the kill are downstream symptoms.
"

BODY="## Failure Summary

The **${JOB_NAME}** job failed on branch \`${HEAD_BRANCH}\`. Error: ${ERROR_DESC}
${SUMMARY_NOTE}
## Error Details

\`\`\`
${ERROR_DETAILS:-"(no error details extracted)"}
\`\`\`"

# Surfaced separately from Error Details: when several pods fail readiness the
# complete set is what identifies the failing component, and this section stays
# present even when an exception stack won the Error Details slot above. Skipped
# when Error Details already *is* the pod-failure list, to avoid duplication.
[[ -n "${POD_FAILURES:-}" && "${ERROR_DETAILS:-}" != *"$(echo "$POD_FAILURES" | head -1 | cut -c30-120)"* ]] && BODY+="

## Pod / Container State

\`\`\`
$(echo "$POD_FAILURES" | sed -E 's/ \[traceId=.*$//' | head -20)
\`\`\`"

[[ -n "${CURRENT_COMMAND:-}" ]] && BODY+="

## Failed Command

\`\`\`
Current Command: ${CURRENT_COMMAND}
\`\`\`"

[[ -n "${DIAG_TEXT:-}" ]] && BODY+="

## Deployment Diagnostics

\`\`\`
${DIAG_TEXT}
\`\`\`"

BODY+="

## Workflow Information

- **Run**: [#${RUN_NUMBER}](${RUN_URL}) (attempt ${RUN_ATTEMPT})
- **Job**: [${JOB_NAME}](${JOB_URL})
- **Branch**: \`${HEAD_BRANCH}\`"

# ── Stage gist files ──────────────────────────────────────────────────────────
STAGE_DIR="${SCRATCH}/gist-stage"
rm -rf "$STAGE_DIR" && mkdir -p "$STAGE_DIR"

[[ -f "$JOB_LOG_PATH" ]] && cp "$JOB_LOG_PATH" "${STAGE_DIR}/"

while IFS= read -r -d '' artifact_file; do
  REL="${artifact_file#${ARTIFACT_DIR}/}"
  FLAT="${REL//\//__}"
  SIZE=$(stat -f%z "$artifact_file" 2>/dev/null || stat -c%s "$artifact_file" 2>/dev/null || echo 0)
  (( SIZE < 10485760 )) && cp "$artifact_file" "${STAGE_DIR}/${FLAT}"
done < <(find "$ARTIFACT_DIR" -type f ! -name "*.zip" -print0 2>/dev/null)

mapfile -t GIST_FILES < <(find "$STAGE_DIR" -maxdepth 1 -type f | sort)

if [[ ${#GIST_FILES[@]} -eq 0 ]]; then
  printf "(no log files available)\n" > "${STAGE_DIR}/no-logs.txt"
  GIST_FILES=("${STAGE_DIR}/no-logs.txt")
fi
echo "  ${#GIST_FILES[@]} file(s) staged for gist"

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "════════════════════ DRY RUN — nothing created ════════════════════"
  echo "Title:  ${TITLE}"
  echo "Gist:   would upload ${#GIST_FILES[@]} file(s)"
  echo "───────────────────────────── body ────────────────────────────────"
  echo "$BODY"
  echo "═══════════════════════════════════════════════════════════════════"
  rm -rf "${SCRATCH}"
  exit 0
fi

# ── Create secret gist ────────────────────────────────────────────────────────
# GH_TOKEN often lacks the gist scope; unset it so gh falls back to the keyring token.
echo "Creating secret gist..."
GIST_URL=$(env -u GH_TOKEN gh gist create \
  --desc "Solo CI failure logs — run ${RUN_ID} job ${JOB_ID} [${JOB_NAME}]" \
  "${GIST_FILES[@]}")
echo "  ${GIST_URL}"

GIST_ID=$(echo "$GIST_URL" | rev | cut -d/ -f1 | rev)
GIST_USER=$(echo "$GIST_URL" | sed 's|https://gist.github.com/||' | cut -d/ -f1)
RAW_BASE="https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw"

FILE_LINKS=""
while IFS= read -r flat; do
  FILE_LINKS+="- [${flat//__//}](${RAW_BASE}/${flat})"$'\n'
done < <(ls "${STAGE_DIR}" | sort)
FILE_COUNT=$(ls "${STAGE_DIR}" | wc -l | tr -d ' ')

BODY+="

## Log Archives

- [CI Logs (secret gist)](${GIST_URL}) — ${FILE_COUNT} files (job log + complete \`${ARTIFACT_NAME:-artifact}\` artifact)

<details>
<summary>All files</summary>

${FILE_LINKS}
</details>"

# ── Create issue ──────────────────────────────────────────────────────────────
echo "Creating issue..."
RESPONSE=$(gh api graphql -f query="
mutation {
  createIssue(input: {
    repositoryId: \"R_kgDOLMTWdQ\"
    title: $(echo "$TITLE" | jq -Rs .)
    issueTypeId: \"IT_kwDOCq2Q984BY34w\"
    labelIds: [\"LA_kwDOLMTWdc8AAAABg4dJNg\", \"LA_kwDOLMTWdc8AAAABg4dJZQ\"]
    body: $(echo "$BODY" | jq -Rs .)
  }) {
    issue { number url id }
  }
}")
ISSUE_ID=$(echo "$RESPONSE"  | jq -r '.data.createIssue.issue.id')
ISSUE_URL=$(echo "$RESPONSE" | jq -r '.data.createIssue.issue.url')
echo "Issue: $ISSUE_URL"

# ── Solo CLI Program Board → Ready / P0 ──────────────────────────────────────
# Do not redirect stderr to /dev/null here: a missing `project` token scope
# also makes this lookup come back empty, and silencing it made every past
# run of this script print the misleading "already exists" message below
# instead of the real "token has not been granted ... scopes" error.
ITEM_BOARD=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    contentId: \"$ISSUE_ID\"
  }) { item { id } }
}" | jq -r '.data.addProjectV2ItemById.item.id // empty' || true)

if [[ -n "${ITEM_BOARD:-}" ]]; then
  gh api graphql -f query="
mutation {
  setStatus: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    itemId: \"$ITEM_BOARD\"
    fieldId: \"PVTSSF_lADOCq2Q984BQs6Izg-vs_E\"
    value: { singleSelectOptionId: \"61e4505c\" }
  }) { projectV2Item { id } }
  setPriority: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984BQs6I\"
    itemId: \"$ITEM_BOARD\"
    fieldId: \"PVTSSF_lADOCq2Q984BQs6Izg-vtZ0\"
    value: { singleSelectOptionId: \"79628723\" }
  }) { projectV2Item { id } }
}" > /dev/null && echo "Board: Ready/P0"
else
  echo "Board: not added — either already on the board, or the error above means the token needs the 'project' scope (gh auth refresh -h github.com -s project)"
fi

# ── Solo X Team → Ready / P0-🔥 ──────────────────────────────────────────────
ITEM_TEAM=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    contentId: \"$ISSUE_ID\"
  }) { item { id } }
}" | jq -r '.data.addProjectV2ItemById.item.id // empty' || true)

if [[ -n "${ITEM_TEAM:-}" ]]; then
  gh api graphql -f query="
mutation {
  setStatus: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    itemId: \"$ITEM_TEAM\"
    fieldId: \"PVTSSF_lADOCq2Q984A6EW6zguwhjU\"
    value: { singleSelectOptionId: \"36d4dfb8\" }
  }) { projectV2Item { id } }
  setPriority: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    itemId: \"$ITEM_TEAM\"
    fieldId: \"PVTSSF_lADOCq2Q984A6EW6zguwhkA\"
    value: { singleSelectOptionId: \"95df2dcd\" }
  }) { projectV2Item { id } }
}" > /dev/null && echo "X Team: Ready/P0-🔥"
else
  echo "X Team: not added — either already on the board, or the error above means the token needs the 'project' scope (gh auth refresh -h github.com -s project)"
fi

# ── Link to initiative ────────────────────────────────────────────────────────
gh api graphql -f query="
mutation {
  addSubIssue(input: {
    issueId: \"$PARENT_ISSUE_ID\"
    subIssueId: \"$ISSUE_ID\"
    replaceParent: false
  }) { issue { number } subIssue { number } }
}" > /dev/null && echo "Sub-issue of initiative set"

echo ""
echo "════════════════════════════════════════════════════════"
echo "Created:   $ISSUE_URL"
echo "Title:     $TITLE"
echo "Type:      Bug  |  Priority: P0-🔥  |  Status: Ready"
echo "Labels:    Bug, P0-🔥"
echo "Projects:  Solo CLI Program Board (Ready / P0), Solo X Team (Ready / P0-🔥)"
echo "Parent:    initiative ${PARENT_ISSUE_ID}"
echo "Logs:      $GIST_URL"
echo "════════════════════════════════════════════════════════"

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -rf "${SCRATCH}"
echo "Cleaned up: ${SCRATCH}"

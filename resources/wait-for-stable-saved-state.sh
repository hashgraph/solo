#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

# When called from `consensus state download`, `true` means the remote config
# says the node is frozen. Prefer a fully signed freeze round, but fall back to
# a fully signed non-freeze round when this CN version does not sign freeze
# states (it reports SIGNING_WEIGHT_SUM: 0 for them).
prefer_freeze_round="${1:-false}"
saved_dir="${2:-/opt/hgcapp/services-hedera/HapiApp2.0/data/saved}"

if command -v sha256sum >/dev/null 2>&1; then
  hash_cmd=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  hash_cmd=(shasum -a 256)
elif command -v openssl >/dev/null 2>&1; then
  hash_cmd=(openssl dgst -sha256 -r)
else
  echo "No SHA-256 implementation found in container" >&2
  exit 14
fi

if [[ ! -d "${saved_dir}" ]]; then
  exit 10
fi

round_root="$(find "${saved_dir}/com.hedera.services.ServicesMain" -mindepth 2 -maxdepth 2 -type d 2>/dev/null | head -n 1)"
if [[ -z "${round_root}" ]]; then
  exit 11
fi

# Prefer the newest fully signed freeze round because it is the cleanest
# recovery boundary. For stopped deployments, use the newest fully signed
# non-freeze round instead.
selected_round=""
fallback_round=""
selected_kind="none"
while IFS= read -r round_dir; do
  metadata_file="${round_dir}/stateMetadata.txt"
  [[ -f "${metadata_file}" ]] || continue

  freeze_state="$(awk -F: '/^FREEZE_STATE:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "${metadata_file}")"
  signing_weight="$(awk -F: '/^SIGNING_WEIGHT_SUM:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "${metadata_file}")"
  total_weight="$(awk -F: '/^TOTAL_WEIGHT:/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}' "${metadata_file}")"

  if [[ -n "${signing_weight}" && "${signing_weight}" == "${total_weight}" ]]; then
    if [[ "${freeze_state}" == "true" ]]; then
      selected_round="$(basename "${round_dir}")"
      selected_kind="freeze"
      continue
    fi

    fallback_round="$(basename "${round_dir}")"
  fi
done < <(
  find "${round_root}" -mindepth 1 -maxdepth 1 -type d -print \
    | while IFS= read -r candidate_dir; do
        printf '%s\t%s\n' "$(basename "${candidate_dir}")" "${candidate_dir}"
      done \
    | sort -n -k1,1 \
    | cut -f2-
)

if [[ -z "${selected_round}" ]]; then
  selected_round="${fallback_round}"
  selected_kind="non-freeze"
fi

if [[ -z "${selected_round}" ]]; then
  exit 12
fi

if [[ "${prefer_freeze_round}" == "true" && "${selected_kind}" != "freeze" ]]; then
  selected_kind="frozen-fallback"
fi

# Fingerprint the entire saved-state tree, not just the chosen round directory,
# so the caller can detect when background flushes have stopped changing disk
# contents across consecutive polls. Fingerprint size+mtime per file rather than
# hashing file contents: this poll runs up to 180 times, and re-reading every byte
# under data/saved on each pass adds real I/O load exactly while the node is trying
# to quiesce, for no benefit over the much cheaper metadata comparison.
find "${saved_dir}" -type f -printf '%s %T@ %p\n' \
  | sort \
  | "${hash_cmd[@]}" \
  | awk -v round="${selected_round}" -v kind="${selected_kind}" '{print $1, round, kind}'

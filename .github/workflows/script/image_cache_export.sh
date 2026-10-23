#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

# ------------------------------------------------------------------------------
# image_cache_export.sh
#
# Purpose:
#   Export every image a one-shot deploy ran into the archives the Solo image
#   cache serves from its CDN: one tar per image and platform, a `.sha256` file
#   holding the tar's SHA-256, and an index of all of them for the CDN upload
#   and manifest steps of the release workflow.
#
# Usage:
#   ./image_cache_export.sh <cluster-images.tsv> <output-directory>
#
#   <cluster-images.tsv> holds one `<image>\t<imageID>` line per container, as
#   the pod spec names the image and as the pod status reports what ran.
#
# Environment variables:
#   IMAGE_CACHE_PLATFORMS
#     Space-separated platforms to export (default: linux/amd64 linux/arm64).
#     An image not published for one of them gets no archive for it.
#   CRANE
#     crane executable (default: crane on PATH).
#   KIND_DOCKER_REGISTRY_MIRRORS
#     Optional comma-separated Docker Hub mirrors tried before docker.io.
#
# Output, in <output-directory>:
#   <tarFile>                 OCI image layout of one platform of the image,
#                             packed as a tar
#   <tarFile>.sha256          the tar's SHA-256, lowercase hex, nothing else
#   image-cache-images.json   one entry per image and platform, in the cache
#                             manifest's `images[]` shape: image, platform,
#                             tarFile, hashFile, sha256, size
#
# Behavior:
#   1) Normalize each image reference the way containerd does, because the
#      CLI looks images up in the manifest by the fully qualified reference.
#   2) Pull the exact digest the cluster ran, not the tag, so a tag moved
#      since the deploy cannot change what is published. The other platforms
#      come from the same image index, so they match the one that ran.
#   3) Name the image in the archive with `io.containerd.image.name`; without
#      it `kind load image-archive` imports an image the kubelet cannot find.
#   4) Pack the tar deterministically, so an image that is unchanged between
#      two releases produces the same bytes and the CDN upload can skip it.
# ------------------------------------------------------------------------------

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <cluster-images.tsv> <output-directory>" >&2
  exit 1
fi

cluster_images="$1"
output_directory="$2"
read -r -a platforms <<< "${IMAGE_CACHE_PLATFORMS:-linux/amd64 linux/arm64}"
crane="${CRANE:-crane}"
index_file_name="image-cache-images.json"
pull_attempts=3

if [[ ! -s "${cluster_images}" ]]; then
  echo "Cluster image list not found or empty: ${cluster_images}" >&2
  exit 1
fi

# Normalize an image reference to the fully qualified form containerd stores:
# - no registry          -> docker.io
# - Docker Hub, one path -> library/<name>
# - no tag or digest     -> :latest
# - tag and digest       -> digest only, as containerd resolves it
normalize_reference() {
  local reference="$1" name tag="" digest="" first

  name="${reference}"
  if [[ "${name}" == *@* ]]; then
    digest="${name#*@}"
    name="${name%%@*}"
  fi

  # A tag is a ':' after the last '/', so a registry port is not mistaken for one.
  if [[ "${name##*/}" == *:* ]]; then
    tag="${name##*:}"
    name="${name%:*}"
  fi

  first="${name%%/*}"
  if [[ "${name}" != */* || ( "${first}" != *.* && "${first}" != *:* && "${first}" != localhost ) ]]; then
    name="docker.io/${name}"
  fi
  if [[ "${name}" == index.docker.io/* ]]; then
    name="docker.io/${name#index.docker.io/}"
  fi
  if [[ "${name}" == docker.io/* && "${name#docker.io/}" != */* ]]; then
    name="docker.io/library/${name#docker.io/}"
  fi

  if [[ -n "${digest}" ]]; then
    printf '%s@%s\n' "${name}" "${digest}"
  else
    printf '%s:%s\n' "${name}" "${tag:-latest}"
  fi
}

# Repository part of a normalized reference.
repository_of() {
  local reference="$1"
  if [[ "${reference}" == *@* ]]; then
    printf '%s\n' "${reference%%@*}"
  else
    printf '%s\n' "${reference%:*}"
  fi
}

# Repositories to fetch <repository> from: Docker Hub mirrors first for
# docker.io images, then the repository itself. Everything is fetched by
# digest, which makes every source equivalent.
image_sources() {
  local repository="$1" mirror
  local -a mirrors=()

  if [[ "${repository}" == docker.io/* && -n "${KIND_DOCKER_REGISTRY_MIRRORS:-}" ]]; then
    IFS=',' read -r -a mirrors <<< "${KIND_DOCKER_REGISTRY_MIRRORS}"
    for mirror in "${mirrors[@]}"; do
      mirror="${mirror//[[:space:]]/}"
      mirror="${mirror#https://}"
      mirror="${mirror#http://}"
      mirror="${mirror%/}"
      if [[ -n "${mirror}" ]]; then
        printf '%s/%s\n' "${mirror}" "${repository#docker.io/}"
      fi
    done
  fi
  printf '%s\n' "${repository}"
}

# Run `<command...> <source>@<digest>` against each source of <repository>,
# retrying each, until one succeeds.
with_sources() {
  local repository="$1" digest="$2" attempt source
  local -a sources=()
  shift 2

  mapfile -t sources < <(image_sources "${repository}")
  for source in "${sources[@]}"; do
    for ((attempt = 1; attempt <= pull_attempts; attempt++)); do
      if "$@" "${source}@${digest}"; then
        return 0
      fi
      echo "::warning::$1 ${source}@${digest} failed (attempt ${attempt}/${pull_attempts})" >&2
    done
  done

  return 1
}

# Write the platforms an image is published for, one `<os>/<arch>` (and
# `<os>/<arch>/<variant>`) per line. An image index lists them; a single
# image manifest has exactly one, recorded in its config.
read_platforms() {
  local output="$1" reference="$2" manifest

  manifest="$("${crane}" manifest "${reference}")" || return 1
  if jq -e '.manifests' <<< "${manifest}" > /dev/null; then
    jq -r '
      .manifests[].platform | select(. != null)
      | "\(.os)/\(.architecture)", (select(.variant) | "\(.os)/\(.architecture)/\(.variant)")
    ' <<< "${manifest}" > "${output}"
  else
    "${crane}" config "${reference}" | jq -r '"\(.os)/\(.architecture)"' > "${output}"
  fi
}

# Pull one platform of an image as an OCI layout.
pull_layout() {
  local platform="$1" layout="$2" reference="$3"

  rm -rf "${layout}"
  "${crane}" pull --format oci --platform "${platform}" "${reference}" "${layout}"
}

# Point the layout's single manifest at the reference the cluster uses, and
# confirm the image is built for the requested platform.
label_layout() {
  local layout="$1" reference="$2" platform="$3" manifest_digest config_digest image_platform

  if [[ "$(jq '.manifests | length' "${layout}/index.json")" != "1" ]]; then
    echo "::error::${reference}: expected one manifest in the exported layout" >&2
    return 1
  fi

  jq -c --arg name "${reference}" '
    .manifests[0].annotations = ((.manifests[0].annotations // {})
      | del(.["org.opencontainers.image.ref.name"])
      + {"io.containerd.image.name": $name})
  ' "${layout}/index.json" > "${layout}/index.json.tmp"
  mv "${layout}/index.json.tmp" "${layout}/index.json"

  manifest_digest="$(jq -r '.manifests[0].digest' "${layout}/index.json")"
  config_digest="$(jq -r '.config.digest' "${layout}/blobs/${manifest_digest/://}")"
  image_platform="$(jq -r '"\(.os)/\(.architecture)"' "${layout}/blobs/${config_digest/://}")"
  # A variant is optional in an image config, so only <os>/<arch> is compared.
  if [[ "${image_platform}" != "$(cut -d / -f 1,2 <<< "${platform}")" ]]; then
    echo "::error::${reference}: image is ${image_platform}, expected ${platform}" >&2
    return 1
  fi
}

# Pack a layout into a tar whose bytes depend only on the layout's content.
pack_layout() {
  local layout="$1" archive="$2"

  find "${layout}" -type d -exec chmod 0755 {} +
  find "${layout}" -type f -exec chmod 0644 {} +
  tar --create --file "${archive}" --directory "${layout}" \
    --format=gnu --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner .
}

mkdir -p "${output_directory}"
work_directory="$(mktemp -d)"
trap 'rm -rf "${work_directory}"' EXIT

# Resolve each normalized reference to the one digest the cluster ran.
declare -A digests=()
while IFS=$'\t' read -r image image_id; do
  [[ -z "${image}" ]] && continue
  reference="$(normalize_reference "${image}")"

  # A repository digest is only reported for images pulled from a registry.
  if [[ "${image_id}" != *@sha256:* ]]; then
    echo "::error::${image}: no registry digest in the pod status (imageID '${image_id}')" >&2
    exit 1
  fi
  digest="${image_id##*@}"

  # containerd's repository must agree with the normalized one, or the CLI
  # would look the image up under a reference the cluster never uses.
  if [[ "${image_id%@*}" != "$(repository_of "${reference}")" ]]; then
    echo "::error::${image}: normalized to ${reference}, but the cluster ran ${image_id}" >&2
    exit 1
  fi
  if [[ "${reference}" == *@* && "${reference##*@}" != "${digest}" ]]; then
    echo "::error::${image}: pinned to ${reference##*@}, but the cluster ran ${digest}" >&2
    exit 1
  fi
  if [[ -n "${digests[${reference}]:-}" && "${digests[${reference}]}" != "${digest}" ]]; then
    echo "::error::${reference}: the cluster ran two digests, ${digests[${reference}]} and ${digest}" >&2
    exit 1
  fi
  digests["${reference}"]="${digest}"
done < "${cluster_images}"

entries="${work_directory}/entries.tsv"
: > "${entries}"
layout="${work_directory}/layout"
published_platforms="${work_directory}/platforms.txt"

while IFS= read -r reference; do
  digest="${digests[${reference}]}"
  repository="$(repository_of "${reference}")"
  exported=0

  echo "::group::${reference}"
  if ! with_sources "${repository}" "${digest}" read_platforms "${published_platforms}"; then
    echo "::error::${reference}: could not read the platforms of ${digest}" >&2
    exit 1
  fi

  for platform in "${platforms[@]}"; do
    # An image not built for a platform is left for the cluster to pull there.
    if ! grep -qxF "${platform}" "${published_platforms}"; then
      echo "::warning::${reference} is not published for ${platform}; no archive for that platform"
      continue
    fi

    tar_file="$(printf '%s__%s' "${reference}" "${platform}" | sed -e 's#/#__#g' -e 's#:#__#g').tar"
    hash_file="${tar_file}.sha256"

    if ! with_sources "${repository}" "${digest}" pull_layout "${platform}" "${layout}"; then
      echo "::error::${reference}: could not pull ${digest} for ${platform}" >&2
      exit 1
    fi
    label_layout "${layout}" "${reference}" "${platform}"
    pack_layout "${layout}" "${output_directory}/${tar_file}"
    rm -rf "${layout}"

    sha256="$(sha256sum "${output_directory}/${tar_file}" | cut -d ' ' -f 1)"
    size="$(wc -c < "${output_directory}/${tar_file}" | tr -d '[:space:]')"
    printf '%s\n' "${sha256}" > "${output_directory}/${hash_file}"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "${reference}" "${platform}" "${tar_file}" "${hash_file}" "${sha256}" "${size}" >> "${entries}"
    echo "${tar_file} ${sha256} ${size} bytes"
    exported=$((exported + 1))
  done
  echo "::endgroup::"

  if [[ "${exported}" -eq 0 ]]; then
    echo "::error::${reference} is not published for any of: ${platforms[*]}" >&2
    exit 1
  fi
done < <(printf '%s\n' "${!digests[@]}" | sort)

jq -R -s '
  split("\n")
  | map(select(length > 0) | split("\t")
    | {image: .[0], platform: .[1], tarFile: .[2], hashFile: .[3], sha256: .[4], size: (.[5] | tonumber)})
  | sort_by(.image, .platform)
' "${entries}" > "${output_directory}/${index_file_name}"

for platform in "${platforms[@]}"; do
  echo "${platform}: $(jq --arg platform "${platform}" 'map(select(.platform == $platform)) | length' \
    "${output_directory}/${index_file_name}") archives"
done
echo "Exported $(jq 'map(.image) | unique | length' "${output_directory}/${index_file_name}") images to ${output_directory}"

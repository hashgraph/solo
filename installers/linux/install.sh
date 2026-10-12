#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Installs the Solo CLI as a standalone binary on Linux, no Node.js required.
#
#   curl -fsSL https://github.com/hiero-ledger/solo/releases/latest/download/install.sh | sh
#   curl -fsSL https://github.com/hiero-ledger/solo/releases/latest/download/install.sh | sh -s -- --version v0.92.0
#
# Run with --help for all options.

set -eu

SOLO_REPOSITORY_URL='https://github.com/hiero-ledger/solo'
DEFAULT_INSTALL_DIRECTORY="${HOME}/.solo/bin"
CHECKSUMS_ASSET='SHA256SUMS'
PATH_BLOCK_START='# >>> solo installer >>>'
PATH_BLOCK_END='# <<< solo installer <<<'

version='latest'
install_directory="${SOLO_INSTALL_DIR:-${DEFAULT_INSTALL_DIRECTORY}}"
base_url="${SOLO_REPOSITORY_URL}/releases"
skip_image_cache='false'
work_directory=''
staged_binary=''

usage() {
  cat <<EOF
Install the Solo CLI on Linux.

Usage: install.sh [options]

Options:
  --version <tag>      Release to install, for example v0.92.0 (default: latest)
  --prefix <dir>       Directory for the solo binary (default: ~/.solo/bin, or SOLO_INSTALL_DIR)
  --skip-image-cache   Do not run 'solo cache image pull' after installing
  --base-url <url>     Release download base URL (default: ${SOLO_REPOSITORY_URL}/releases)
  -h, --help           Show this help
EOF
}

info() {
  printf 'solo-install: %s\n' "$*"
}

warn() {
  printf 'solo-install: warning: %s\n' "$*" >&2
}

fail() {
  printf 'solo-install: error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${work_directory}" ] && [ -d "${work_directory}" ]; then
    rm -rf "${work_directory}"
  fi
  if [ -n "${staged_binary}" ] && [ -f "${staged_binary}" ]; then
    rm -f "${staged_binary}"
  fi
}

parse_arguments() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --version)
        [ "$#" -ge 2 ] || fail '--version requires a value'
        case "$2" in
          [0-9]*) version="v$2" ;;
          *) version="$2" ;;
        esac
        shift 2
        ;;
      --prefix)
        [ "$#" -ge 2 ] || fail '--prefix requires a value'
        install_directory="${2%/}"
        shift 2
        ;;
      --base-url)
        [ "$#" -ge 2 ] || fail '--base-url requires a value'
        base_url="${2%/}"
        shift 2
        ;;
      --skip-image-cache)
        skip_image_cache='true'
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        fail "unknown option: $1"
        ;;
    esac
  done
}

# Prints the release asset name for this machine, for example solo-linux-x64 or solo-linux-x64-musl.
detect_asset_name() {
  operating_system="$(uname -s)"
  if [ "${operating_system}" != 'Linux' ]; then
    fail "this installer supports Linux only (found ${operating_system}); install with: npm install -g @hiero-ledger/solo"
  fi

  machine="$(uname -m)"
  case "${machine}" in
    x86_64 | amd64) architecture='x64' ;;
    aarch64 | arm64) architecture='arm64' ;;
    *) fail "unsupported CPU architecture: ${machine}; install with: npm install -g @hiero-ledger/solo" ;;
  esac

  libc_suffix=''
  # Trust ldd first: a glibc system with the musl package installed also has /lib/ld-musl-* on disk.
  if ldd --version 2>&1 | grep -qi musl; then
    libc_suffix='-musl'
  elif ! command -v ldd >/dev/null 2>&1 && ls /lib/ld-musl-* >/dev/null 2>&1; then
    libc_suffix='-musl'
  fi

  printf 'solo-linux-%s%s' "${architecture}" "${libc_suffix}"
}

download() {
  source_url="$1"
  destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --retry 3 --output "${destination}" "${source_url}"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=3 --output-document="${destination}" "${source_url}"
  else
    fail 'curl or wget is required'
  fi
}

release_url() {
  if [ "${version}" = 'latest' ]; then
    printf '%s/latest/download/%s' "${base_url}" "$1"
  else
    printf '%s/download/%s/%s' "${base_url}" "${version}" "$1"
  fi
}

compute_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail 'sha256sum or shasum is required to verify the download'
  fi
}

# Verifies the SHA256SUMS signature when cosign is installed; the checksum check itself always runs.
verify_checksums_signature() {
  if ! command -v cosign >/dev/null 2>&1; then
    info "cosign not found; skipping signature verification of ${CHECKSUMS_ASSET} (checksum is still verified)"
    return 0
  fi

  bundle="${work_directory}/${CHECKSUMS_ASSET}.sigstore.json"
  if ! download "$(release_url "${CHECKSUMS_ASSET}.sigstore.json")" "${bundle}" 2>/dev/null; then
    warn "no signature bundle published for ${CHECKSUMS_ASSET}; skipping signature verification"
    return 0
  fi

  if ! cosign_output="$(cosign verify-blob \
    --bundle "${bundle}" \
    --certificate-identity-regexp "^${SOLO_REPOSITORY_URL}/\\.github/workflows/" \
    --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
    "${work_directory}/${CHECKSUMS_ASSET}" 2>&1)"; then
    fail "signature verification of ${CHECKSUMS_ASSET} failed: ${cosign_output}"
  fi
  info "verified the signature of ${CHECKSUMS_ASSET}"
}

download_and_verify() {
  asset_name="$1"
  checksums_file="${work_directory}/${CHECKSUMS_ASSET}"

  info "downloading ${asset_name} (${version})"
  download "$(release_url "${CHECKSUMS_ASSET}")" "${checksums_file}" ||
    fail "could not download ${CHECKSUMS_ASSET} for release ${version}"
  verify_checksums_signature

  expected_sha256="$(awk -v name="${asset_name}" '$2 == name || $2 == "*" name {print $1; exit}' "${checksums_file}")"
  if [ -z "${expected_sha256}" ]; then
    fail "release ${version} has no Solo binary for this machine (${asset_name}); install with: npm install -g @hiero-ledger/solo"
  fi

  download "$(release_url "${asset_name}")" "${work_directory}/solo" ||
    fail "could not download ${asset_name} for release ${version}"

  actual_sha256="$(compute_sha256 "${work_directory}/solo")"
  if [ "${actual_sha256}" != "${expected_sha256}" ]; then
    fail "checksum mismatch for ${asset_name}: expected ${expected_sha256}, got ${actual_sha256}"
  fi
  info "verified the checksum of ${asset_name}"
}

install_binary() {
  target="${install_directory}/solo"
  mkdir -p "${install_directory}"
  staged_binary="${install_directory}/.solo.install.$$"
  cp "${work_directory}/solo" "${staged_binary}"
  chmod 755 "${staged_binary}"

  # Run the new binary before it replaces anything, so one that cannot run here leaves an existing install intact.
  if ! version_output="$("${staged_binary}" --version </dev/null 2>&1)"; then
    fail "the downloaded solo binary does not run on this system: ${version_output}"
  fi
  mv -f "${staged_binary}" "${target}"

  # solo --version prints a banner; keep only the value of its "Version :" line.
  installed_version="$(printf '%s\n' "${version_output}" | sed -n 's/^Version[[:space:]]*:[[:space:]]*//p' | head -n 1)"
  info "installed solo ${installed_version:-${version}} to ${target}"
}

# Prints the startup file for the user's shell, or nothing when the shell is not supported.
shell_startup_file() {
  case "$(basename "${SHELL:-}")" in
    bash) printf '%s/.bashrc' "${HOME}" ;;
    zsh) printf '%s/.zshrc' "${ZDOTDIR:-${HOME}}" ;;
    fish) printf '%s/.config/fish/conf.d/solo.fish' "${HOME}" ;;
    *) ;;
  esac
}

configure_path() {
  case ":${PATH}:" in
    *":${install_directory}:"*) return 0 ;;
    *) ;;
  esac

  path_line="export PATH=\"\$PATH:${install_directory}\""
  startup_file="$(shell_startup_file)"

  # Only the default directory is added to startup files; a --prefix directory is the caller's to manage.
  if [ "${install_directory}" != "${DEFAULT_INSTALL_DIRECTORY}" ] || [ -z "${startup_file}" ]; then
    info "${install_directory} is not on your PATH; add it with:"
    printf '\n  %s\n\n' "${path_line}"
    return 0
  fi

  case "${startup_file}" in
    *.fish)
      if [ ! -f "${startup_file}" ]; then
        mkdir -p "$(dirname "${startup_file}")"
        cat >"${startup_file}" <<'EOF'
# Added by the Solo installer.
contains -- $HOME/.solo/bin $PATH; or set -gx PATH $PATH $HOME/.solo/bin
EOF
        info "added ${install_directory} to PATH in ${startup_file}"
      fi
      ;;
    *)
      if ! grep -qF "${PATH_BLOCK_START}" "${startup_file}" 2>/dev/null; then
        cat >>"${startup_file}" <<EOF

${PATH_BLOCK_START}
export PATH="\$PATH:\$HOME/.solo/bin"
${PATH_BLOCK_END}
EOF
        info "added ${install_directory} to PATH in ${startup_file}"
      fi
      ;;
  esac

  info 'restart your shell, or run this to use solo now:'
  printf '\n  %s\n\n' "${path_line}"
}

# ~/.solo/bin is appended to PATH, so an earlier solo (for example from npm) keeps winning.
warn_if_shadowed() {
  resolved="$(command -v solo 2>/dev/null || true)"
  if [ -n "${resolved}" ] && [ "${resolved}" != "${install_directory}/solo" ]; then
    warn "${resolved} comes before ${install_directory}/solo on your PATH; remove it (npm: npm uninstall -g @hiero-ledger/solo) to use this install"
  fi
}

warm_image_cache() {
  if [ "${skip_image_cache}" = 'true' ]; then
    info "skipped the image cache; run 'solo cache image pull' before your first deployment to speed it up"
    return 0
  fi

  # Under sudo the pull would run as root and fill root's cache, or leave root-owned files in the user's ~/.solo.
  if [ -n "${SUDO_USER:-}" ]; then
    info "installed with sudo; run 'solo cache image pull' as ${SUDO_USER} to warm the cache"
    return 0
  fi

  info 'pre-pulling the container images Solo deploys (skip with --skip-image-cache)'
  # stdin is redirected so solo cannot read the rest of this script when it is piped into sh.
  if ! (unset SOLO_INSTALL_DIR && "${install_directory}/solo" cache image pull --quiet-mode </dev/null); then
    warn "the image cache was not fully populated; run 'solo cache image pull' to retry"
  fi
}

main() {
  parse_arguments "$@"
  asset_name="$(detect_asset_name)"

  work_directory="$(mktemp -d)"
  trap cleanup EXIT
  trap 'exit 1' INT TERM

  download_and_verify "${asset_name}"
  install_binary
  configure_path
  warn_if_shadowed
  warm_image_cache
  info 'done'
}

# Everything runs from main so a partially downloaded script executes nothing.
main "$@"

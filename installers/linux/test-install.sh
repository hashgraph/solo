#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Tests install.sh against a local fake release served over file://, using a stand-in solo binary.
# Runs on any Linux distribution with curl; each case gets its own HOME.
#
#   sh installers/linux/test-install.sh

set -eu

script_directory="$(cd "$(dirname "$0")" && pwd)"
installer="${script_directory}/install.sh"
test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

failures=0
current_case=''

check() {
  description="$1"
  shift
  if "$@"; then
    printf '  ok      %s\n' "${description}"
  else
    printf '  FAILED  %s\n' "${description}"
    failures=$((failures + 1))
  fi
}

begin_case() {
  current_case="$1"
  printf '%s\n' "${current_case}"
  HOME="${test_root}/home-$(printf '%s' "${current_case}" | tr -c 'a-z0-9' '-')"
  export HOME
  mkdir -p "${HOME}"
  export SHELL='/bin/bash'
  unset ZDOTDIR SOLO_INSTALL_DIR SUDO_USER 2>/dev/null || true
  export PATH="${original_path}"
  export FAKE_SOLO_CALLS="${HOME}/solo-calls.log"
  export FAKE_SOLO_STDIN="${HOME}/solo-stdin.log"
}

run_installer() {
  sh "${installer}" --base-url "file://${release_directory}" "$@" >"${HOME}/install.log" 2>&1
}

contains() {
  grep -qF -- "$2" "$1" 2>/dev/null
}

count_of() {
  grep -cF -- "$2" "$1" 2>/dev/null || true
}

is_equal() {
  [ "$1" = "$2" ]
}

# Writes one release directory holding the fake binary under every asset name install.sh may select.
write_release() {
  release_path="$1"
  checksums_mode="$2"
  mkdir -p "${release_path}"
  for asset in solo-linux-x64 solo-linux-arm64 solo-linux-x64-musl solo-linux-arm64-musl; do
    cp "${fake_binary}" "${release_path}/${asset}"
  done
  (
    cd "${release_path}"
    case "${checksums_mode}" in
      valid) sha256sum solo-linux-* >SHA256SUMS ;;
      corrupt) sha256sum solo-linux-* | sed 's/^./0/' >SHA256SUMS ;;
      missing-asset) printf '%064d  solo-linux-riscv64\n' 0 >SHA256SUMS ;;
      *) ;;
    esac
  )
}

original_path="${PATH}"
fake_binary="${test_root}/fake-solo"
cat >"${fake_binary}" <<'EOF'
#!/bin/sh
case "${1:-}" in
  --version) echo '0.0.0-test' ;;
  *)
    echo "$*" >>"${FAKE_SOLO_CALLS}"
    cat >>"${FAKE_SOLO_STDIN}"
    ;;
esac
EOF
chmod 755 "${fake_binary}"

release_directory="${test_root}/release"
write_release "${release_directory}/latest/download" valid
write_release "${release_directory}/download/v1.2.3" valid
write_release "${release_directory}/download/v9.9.9" corrupt
write_release "${release_directory}/download/v8.8.8" missing-asset

# A release whose binary exits non-zero, as one built for a newer glibc would.
broken_release="${release_directory}/download/v7.7.7"
mkdir -p "${broken_release}"
for asset in solo-linux-x64 solo-linux-arm64 solo-linux-x64-musl solo-linux-arm64-musl; do
  printf '#!/bin/sh\necho "cannot run" >&2\nexit 1\n' >"${broken_release}/${asset}"
done
(cd "${broken_release}" && sha256sum solo-linux-* >SHA256SUMS)

begin_case 'installs to ~/.solo/bin and edits .bashrc'
run_installer
check 'binary is executable' test -x "${HOME}/.solo/bin/solo"
check 'installed binary runs' is_equal "$("${HOME}/.solo/bin/solo" --version)" '0.0.0-test'
# shellcheck disable=SC2016 # the startup file holds this text literally
check '.bashrc appends ~/.solo/bin to PATH' contains "${HOME}/.bashrc" 'export PATH="$PATH:$HOME/.solo/bin"'
check 'image cache pull ran in quiet mode' contains "${FAKE_SOLO_CALLS}" 'cache image pull --quiet-mode'
check 'no staged file left behind' is_equal "$(find "${HOME}/.solo/bin" -name '.solo.install.*' | wc -l | tr -d ' ')" '0'

printf '%s\n' 're-running changes nothing'
run_installer
check '.bashrc still has one PATH block' is_equal "$(count_of "${HOME}/.bashrc" '# >>> solo installer >>>')" '1'

begin_case 'piped into sh, solo cannot read the script'
curl --fail --silent --show-error "file://${installer}" | sh -s -- --base-url "file://${release_directory}" >"${HOME}/install.log" 2>&1 || true
check 'solo read nothing from stdin' is_equal "$(wc -c <"${FAKE_SOLO_STDIN}" | tr -d ' ')" '0'
check 'install completed' contains "${HOME}/install.log" 'solo-install: done'

begin_case 'installs a pinned version'
run_installer --version 1.2.3 --skip-image-cache
check 'binary is installed' test -x "${HOME}/.solo/bin/solo"
check 'image cache pull was skipped' test ! -e "${FAKE_SOLO_CALLS}"

begin_case 'skips the image cache pull under sudo'
export SUDO_USER='alice'
run_installer
check 'image cache pull was skipped' test ! -e "${FAKE_SOLO_CALLS}"
check 'pull command is printed for the sudo user' contains "${HOME}/install.log" "run 'solo cache image pull' as alice"

begin_case 'rejects a checksum mismatch'
check 'installer fails' test "$(run_installer --version v9.9.9 && echo passed || echo failed)" = 'failed'
check 'error names the mismatch' contains "${HOME}/install.log" 'checksum mismatch'
check 'nothing is installed' test ! -e "${HOME}/.solo/bin/solo"

begin_case 'rejects a release without a binary for this machine'
check 'installer fails' test "$(run_installer --version v8.8.8 && echo passed || echo failed)" = 'failed'
check 'error points to npm' contains "${HOME}/install.log" 'npm install -g @hiero-ledger/solo'

begin_case 'keeps the existing install when the new binary cannot run'
run_installer --skip-image-cache
check 'installer fails' test "$(run_installer --version v7.7.7 && echo passed || echo failed)" = 'failed'
check 'error says the binary does not run' contains "${HOME}/install.log" 'does not run on this system'
check 'previous binary still runs' is_equal "$("${HOME}/.solo/bin/solo" --version)" '0.0.0-test'

begin_case 'installs to --prefix without editing startup files'
run_installer --prefix "${HOME}/tools"
check 'binary is in the prefix directory' test -x "${HOME}/tools/solo"
check '.bashrc is not created' test ! -e "${HOME}/.bashrc"
check 'PATH line is printed' contains "${HOME}/install.log" "export PATH=\"\$PATH:${HOME}/tools\""

begin_case 'installs to SOLO_INSTALL_DIR'
export SOLO_INSTALL_DIR="${HOME}/tools"
run_installer
check 'binary is in SOLO_INSTALL_DIR' test -x "${HOME}/tools/solo"

begin_case 'leaves startup files alone when ~/.solo/bin is already on PATH'
export PATH="${PATH}:${HOME}/.solo/bin"
run_installer
check '.bashrc is not created' test ! -e "${HOME}/.bashrc"

begin_case 'warns when another solo comes first on PATH'
mkdir -p "${HOME}/npm/bin"
cp "${fake_binary}" "${HOME}/npm/bin/solo"
export PATH="${HOME}/npm/bin:${PATH}:${HOME}/.solo/bin"
run_installer
check 'warning names the other solo' contains "${HOME}/install.log" "${HOME}/npm/bin/solo comes before"

begin_case 'edits .zshrc under ZDOTDIR'
export SHELL='/usr/bin/zsh'
export ZDOTDIR="${HOME}/zsh"
mkdir -p "${ZDOTDIR}"
run_installer
check '.zshrc has the PATH block' contains "${ZDOTDIR}/.zshrc" '# >>> solo installer >>>'

begin_case 'writes a fish conf.d file'
export SHELL='/usr/bin/fish'
run_installer
# shellcheck disable=SC2016 # the startup file holds this text literally
check 'solo.fish appends ~/.solo/bin' contains "${HOME}/.config/fish/conf.d/solo.fish" 'set -gx PATH $PATH $HOME/.solo/bin'

begin_case 'prints the PATH line for an unknown shell'
export SHELL='/bin/tcsh'
run_installer
check 'no startup file is created' test ! -e "${HOME}/.bashrc"
check 'PATH line is printed' contains "${HOME}/install.log" 'export PATH='

if [ "${failures}" -ne 0 ]; then
  printf '\n%s check(s) failed\n' "${failures}"
  exit 1
fi
printf '\nall checks passed\n'

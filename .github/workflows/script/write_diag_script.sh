#!/usr/bin/env bash
set -eo pipefail

SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

readonly DIAG_SCRIPT_PATH="${HOME}/diagnostics.sh"

cat <<EOF >"${DIAG_SCRIPT_PATH}"
#!/usr/bin/env bash
set -eo pipefail
export PATH="${PATH}"
export KUBECONFIG="${KUBECONFIG}"
export GITHUB_WORKSPACE="${GITHUB_WORKSPACE}"
export JAVA_HOME="${JAVA_HOME}"
cd "${HOME}"

# Install the necessary tools
wget https://github.com/derailed/k9s/releases/download/v0.32.7/k9s_linux_amd64.deb
apt update
apt install -y ./k9s_linux_amd64.deb
rm -f ./k9s_linux_amd64.deb

EOF

sudo chmod +x "${DIAG_SCRIPT_PATH}"
echo "Wrote diagnostics script: ${DIAG_SCRIPT_PATH}"

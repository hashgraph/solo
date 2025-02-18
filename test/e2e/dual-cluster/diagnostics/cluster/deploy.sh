#!/usr/bin/env bash
set -eo pipefail

SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH

kubectl apply -f "${SCRIPT_PATH}/manifest.yaml"

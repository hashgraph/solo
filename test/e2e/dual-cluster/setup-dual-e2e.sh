#!/usr/bin/env bash
set -eo pipefail

task build:compile
export PATH=~/.solo/bin:${PATH}

##### Setup Environment #####
SCRIPT_PATH=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
readonly SCRIPT_PATH
readonly KIND_CONFIG_RENDERER="${SCRIPT_PATH}/../../../.github/workflows/script/render_kind_config.sh"
readonly METALLB_CHART_VERSION="0.15.3"

readonly KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

echo "SOLO_CHARTS_DIR: ${SOLO_CHARTS_DIR}"

if [[ -n "${SOLO_TEST_CLUSTER}" ]]; then
  SOLO_CLUSTER_NAME="${SOLO_TEST_CLUSTER}"
elif [[ -z "${SOLO_CLUSTER_NAME}" ]]; then
  SOLO_CLUSTER_NAME="solo-e2e"
fi

if [[ -z "${SOLO_CLUSTER_DUALITY}" ]]; then
  SOLO_CLUSTER_DUALITY=2
elif [[ "${SOLO_CLUSTER_DUALITY}" -lt 1 ]]; then
  SOLO_CLUSTER_DUALITY=1
elif [[ "${SOLO_CLUSTER_DUALITY}" -gt 2 ]]; then
  SOLO_CLUSTER_DUALITY=2
fi

KIND_VERSION=$(kind --version | awk '{print $3}')
echo "Using Kind version: ${KIND_VERSION}, $(which kind)}"
DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
echo "Using Docker version: ${DOCKER_VERSION}, $(which docker)"
HELM_VERSION=$(helm version --short | sed 's/v//')
echo "Using Helm version: ${HELM_VERSION}, $(which helm)"
KUBECTL_VERSION=$(kubectl version --client=true | grep Client | awk '{print $3}' | sed 's/v//')
echo "Using Kubectl version: ${KUBECTL_VERSION}, $(which kubectl)"
TASK_VERSION=$(task --version | awk '{print $3}')
echo "Using Task version: ${TASK_VERSION}"
NODE_VERSION=$(node --version | sed 's/v//')
echo "Using Node version: ${NODE_VERSION}"
NPM_VERSION=$(npm --version)
echo "Using NPM version: ${NPM_VERSION}"

##### Docker / Kind Hang Diagnostics Helpers #####

# Collects system and Docker-daemon state using non-Docker tools so the function
# still works when the Docker daemon itself is unresponsive.  Call this whenever
# a Docker/Kind command times out (exit code 124) to aid post-mortem analysis.
# All output is written to stderr so it is not polluted by stdout pipes.
collect_docker_hang_diagnostics() {
  local hung_command="${1:-unknown command}"
  {
    echo ""
    echo "=== DOCKER HANG DIAGNOSTICS (timed out: '${hung_command}') ==="
    echo "--- Docker daemon service status ---"
    systemctl status docker --no-pager -l 2>/dev/null \
      || service docker status 2>/dev/null \
      || echo "Unable to retrieve docker service status"
    echo "--- Docker socket ---"
    ls -la /var/run/docker.sock 2>/dev/null || echo "Docker socket not found at /var/run/docker.sock"
    echo "--- Processes holding /var/run/docker.sock (lsof) ---"
    lsof /var/run/docker.sock 2>/dev/null || echo "lsof unavailable or no open handles found on docker socket"
    echo "--- Docker / containerd / kind processes (ps) ---"
    ps aux | grep -E '[d]ocker|[c]ontainerd|[k]ind' 2>/dev/null || true
    echo "--- System memory ---"
    free -h 2>/dev/null || true
    echo "--- Disk space ---"
    df -h 2>/dev/null || true
    echo "--- Recent Docker daemon logs (last 50 lines via journalctl) ---"
    journalctl -u docker --no-pager -n 50 2>/dev/null || echo "journalctl unavailable"
    echo "=== END DOCKER HANG DIAGNOSTICS ==="
    echo ""
  } >&2
}

# Run a command with a timeout; if it times out (exit code 124) collect hang
# diagnostics automatically before returning the non-zero exit code to the caller.
# Usage: run_with_timeout_diag <seconds> <label> <cmd> [args...]
run_with_timeout_diag() {
  local timeout_seconds=$1
  local label=$2
  shift 2
  timeout "${timeout_seconds}" "$@"
  local status=$?
  if [[ $status -eq 124 ]]; then
    echo "WARNING: '${label}' timed out after ${timeout_seconds}s" >&2
    collect_docker_hang_diagnostics "${label}"
  fi
  return $status
}

##### Pre-cleanup Diagnostics (proves stale state from prior runs on self-hosted runners) #####
echo "=== Existing kind clusters ==="
run_with_timeout_diag 30 "kind get clusters" kind get clusters || true
echo "=== Existing Docker networks ==="
run_with_timeout_diag 30 "docker network ls" docker network ls || true
echo "=== Docker containers (all) ==="
run_with_timeout_diag 30 "docker ps -a" docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}' || true

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  run_with_timeout_diag 60 "kind delete cluster ${SOLO_CLUSTER_NAME}-c${i}" kind delete cluster -n "${SOLO_CLUSTER_NAME}-c${i}" || true
done

# On Windows (Docker Desktop), the bridge network plugin is not available via the v1
# plugin registry. Kind manages its own Docker network automatically on Windows, so
# manual network creation is not needed and will fail. Skip it on Windows (msys/Git Bash).
if [[ "$OSTYPE" != msys* ]]; then
  run_with_timeout_diag 30 "docker network rm kind" docker network rm -f kind || true
  run_with_timeout_diag 60 "docker network create kind" docker network create kind --scope local --subnet 172.19.0.0/16 --driver bridge
fi
run_with_timeout_diag 30 "docker info" docker info | grep -i cgroup || true

# Setup Helm Repos
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ --force-update
helm repo add metallb https://metallb.github.io/metallb --force-update

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  cluster_kind_config="${SCRIPT_PATH}/kind-cluster-${i}.yaml"
  if [[ -x "${KIND_CONFIG_RENDERER}" && -n "${KIND_DOCKER_REGISTRY_MIRRORS:-}" ]]; then
    rendered_cluster_kind_config="$(mktemp -t kind-cluster-${i}-XXXX.yaml)"
    "${KIND_CONFIG_RENDERER}" "${cluster_kind_config}" "${rendered_cluster_kind_config}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}-c${i}" --image "${KIND_IMAGE}" --config "${rendered_cluster_kind_config}" || exit 1
    rm -f "${rendered_cluster_kind_config}"
  else
    kind create cluster -n "${SOLO_CLUSTER_NAME}-c${i}" --image "${KIND_IMAGE}" --config "${cluster_kind_config}" || exit 1
  fi

  helm upgrade --install metrics-server metrics-server/metrics-server \
    --namespace kube-system \
    --set "args[0]=--kubelet-insecure-tls" \
    --wait

  # Wait for metrics server to be ready
  kubectl wait --for=condition=available --timeout=300s deployment/metrics-server -n kube-system

  # Install metallb only for multi-cluster unless explicitly skipped
  if [[ "${SOLO_CLUSTER_DUALITY}" -gt 1 && "${SOLO_SKIP_METALLB}" != "1" ]]; then
    helm upgrade --install metallb metallb/metallb \
      --namespace metallb-system --create-namespace --atomic --wait \
      --version "${METALLB_CHART_VERSION}" \
      --set speaker.frr.enabled=true

    kubectl apply -f "${SCRIPT_PATH}/metallb-cluster-${i}.yaml"
  else
    echo "Skipping metallb install (single-cluster or explicitly disabled via SOLO_SKIP_METALLB)"
  fi
done

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# --chart-dir ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup

for i in $(seq 1 "${SOLO_CLUSTER_DUALITY}"); do
  kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c${i}"
  setup_args=(cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev)
  if [[ "${SOLO_TEST_SETUP_MINIO:-1}" != "1" ]]; then
    setup_args+=(--no-minio)
  fi
  npm run solo -- "${setup_args[@]}" || exit 1
  helm list --all-namespaces
done

kubectl config use-context "kind-${SOLO_CLUSTER_NAME}-c1"
sleep 10 # give time for solo-setup to finish deploying

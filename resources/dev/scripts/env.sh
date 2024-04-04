#!/usr/bin/env bash
start_time=$(date +%s)

function log_time() {
  local end_time duration execution_time

  local func_name=$1

  end_time=$(date +%s)
  duration=$((end_time - start_time))
  execution_time=$(printf "%.2f seconds" "${duration}")
  echo "-----------------------------------------------------------------------------------------------------"
  echo "<<< ${func_name} execution took: ${execution_time} >>>"
  echo "-----------------------------------------------------------------------------------------------------"
}

function show_env_vars() {
    echo "--------------------------Env Setup: fullstack-testing ------------------------------------------------"
    echo "CLUSTER_NAME: ${CLUSTER_NAME}"
    echo "RELEASE_NAME: ${RELEASE_NAME}"
    echo "USER: ${USER}"
    echo "NAMESPACE: ${NAMESPACE}"
    echo "SCRIPT_DIR: ${SCRIPT_DIR}"
    echo "-----------------------------------------------------------------------------------------------------"
    echo ""
}

# ----------------------------- Setup ENV Variables -------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
load_env_file

USER="${USER:-changeme}"
CLUSTER_NAME="${SOLO_CLUSTER_NAME:-solo-e2e}"
NAMESPACE="${SOLO_NAMESPACE:-solo}"

# telemetry related env variables
readonly TELEMETRY_DIR="${SCRIPT_DIR}/../telemetry"
readonly PROMETHEUS_DIR="${TELEMETRY_DIR}/prometheus"
readonly PROMETHEUS_VERSION=v0.67.1
readonly PROMETHEUS_OPERATOR_YAML="${PROMETHEUS_DIR}/prometheus-operator.yaml"
readonly PROMETHEUS_YAML="${PROMETHEUS_DIR}/prometheus.yaml"
readonly PROMETHEUS_RBAC_YAML="${PROMETHEUS_DIR}/prometheus-rbac.yaml"
readonly PROMETHEUS_EXAMPLE_APP_YAML="${PROMETHEUS_DIR}/example-app.yaml"

show_env_vars

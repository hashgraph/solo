#!/usr/bin/env bash

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
  SOLO_CLUSTER_SETUP_NAMESPACE=solo-e2e-cluster
kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
  kind create cluster -n "${SOLO_CLUSTER_NAME}" || return

# **********************************************************************************************************************
# Warm up the cluster
# **********************************************************************************************************************
# source test/data/warmup-cluster.sh; download_images; load_images

# **********************************************************************************************************************
# Init and deploy a network for e2e tests in (test/e2e/core)
# -d ${SOLO_CHARTS_DIR} is optional, if you want to use a local chart, it will be ignored if not set
# **********************************************************************************************************************
  solo init --namespace "${SOLO_NAMESPACE}" -i node0,node1,node2 -t v0.49.0-alpha.2 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || return
solo cluster setup  || exit 1

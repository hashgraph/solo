#!/usr/bin/env bash


SOLO_CLUSTER_NAME=solo-e2e
  SOLO_NAMESPACE=solo-e2e
  SOLO_CLUSTER_SETUP_NAMESPACE=solo-e2e-cluster

  kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
  kind create cluster -n "${SOLO_CLUSTER_NAME}" || return
  solo init --namespace "${SOLO_NAMESPACE}" -i node0,node1,node2 -t v0.49.0-alpha.2 -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" || return
  # solo node keys --gossip-keys --tls-keys  || return
  solo cluster setup  || return
  solo network deploy  || return
  solo node setup  --gossip-keys --tls-keys --key-format pem || return
  solo node start  || return
  solo account init || return



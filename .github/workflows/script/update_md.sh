#!/bin/bash
set -xeo pipefail
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster

echo "Perform the following kind and solo commands and save output to environment variables"

kind create cluster -n "${SOLO_CLUSTER_NAME}" 2>&1 | tee create-cluster.log
export KIND_CREATE_CLUSTER_OUTPUT=$( cat create-cluster.log | tee test.log )

solo init | tee init.log
export SOLO_INIT_OUTPUT=$( cat init.log | tee test.log )

solo node keys --gossip-keys --tls-keys -i node1,node2,node3 | tee keys.log
export SOLO_NODE_KEY_PEM_OUTPUT=$( cat keys.log | tee test.log )

solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" | tee cluster-setup.log
export SOLO_CLUSTER_SETUP_OUTPUT=$( cat cluster-setup.log | tee test.log )

solo network deploy -i node1,node2,node3 -n "${SOLO_NAMESPACE}" | tee network-deploy.log
export SOLO_NETWORK_DEPLOY_OUTPUT=$( cat network-deploy.log | tee test.log )

solo node setup -i node1,node2,node3 -n "${SOLO_NAMESPACE}" | tee node-setup.log
export SOLO_NODE_SETUP_OUTPUT=$( cat node-setup.log | tee test.log )

solo node start -i node1,node2,node3 -n "${SOLO_NAMESPACE}" | tee node-start.log
export SOLO_NODE_START_OUTPUT=$( cat node-start.log | tee test.log )

solo mirror-node deploy -n "${SOLO_NAMESPACE}" | tee mirror-node-deploy.log
export SOLO_MIRROR_NODE_DEPLOY_OUTPUT=$( cat mirror-node-deploy.log | tee test.log )

solo relay deploy -i node1 -n "${SOLO_NAMESPACE}" | tee relay-deploy.log
export SOLO_RELAY_DEPLOY_OUTPUT=$( cat relay-deploy.log | tee test.log )

echo "Generate README.md"

envsubst '$KIND_CREATE_CLUSTER_OUTPUT,$SOLO_INIT_OUTPUT,$SOLO_NODE_KEY_PEM_OUTPUT,$SOLO_CLUSTER_SETUP_OUTPUT, \
$SOLO_NETWORK_DEPLOY_OUTPUT,$SOLO_NODE_SETUP_OUTPUT,$SOLO_NODE_START_OUTPUT,$SOLO_MIRROR_NODE_DEPLOY_OUTPUT,\
$SOLO_RELAY_DEPLOY_OUTPUT'\
< README.md.template > README.md

echo "Remove color codes and lines showing intermediate progress"

sed -i 's/\[32m//g' README.md
sed -i 's/\[33m//g' README.md
sed -i 's/\[39m//g' README.md
egrep -v '↓|❯|•' README.md > README.md.tmp && mv README.md.tmp README.md
set +x

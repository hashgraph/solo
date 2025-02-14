#!/bin/bash

# This script is used to run some common solo commands, and use the output to update
# the docs/content/User/StepByStepGuide.md file. This is useful to keep the guide up to date

set -xeo pipefail

if [[ -z "${SOLO_TEST_CLUSTER}" && ${SOLO_CLUSTER_NAME} != "" ]]; then
  SOLO_CLUSTER_NAME=solo-e2e
else
  SOLO_CLUSTER_NAME=${SOLO_TEST_CLUSTER}
fi

export SOLO_NAMESPACE=solo
export SOLO_DEPLOYMENT=solo-deployment
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_EMAIL=john@doe.com

echo "Perform the following kind and solo commands and save output to environment variables"

kind create cluster -n "${SOLO_CLUSTER_NAME}" 2>&1 | tee create-cluster.log
export KIND_CREATE_CLUSTER_OUTPUT=$( cat create-cluster.log | tee test.log )

solo init | tee init.log
export SOLO_INIT_OUTPUT=$( cat init.log | tee test.log )

solo node keys --gossip-keys --tls-keys -i node1,node2,node3 | tee keys.log
export SOLO_NODE_KEY_PEM_OUTPUT=$( cat keys.log | tee test.log )

solo deployment create -i node1,node2,node3 -n "${SOLO_NAMESPACE}" --context kind-${SOLO_CLUSTER_NAME} --email "${SOLO_EMAIL}" --deployment-clusters kind-${SOLO_CLUSTER_NAME} --deployment "${SOLO_DEPLOYMENT}" | tee deployment-create.log
export SOLO_DEPLOYMENT_CREATE_OUTPUT=$( cat deployment-create.log | tee test.log )

solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" | tee cluster-setup.log
export SOLO_CLUSTER_SETUP_OUTPUT=$( cat cluster-setup.log | tee test.log )

solo network deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}" | tee network-deploy.log
export SOLO_NETWORK_DEPLOY_OUTPUT=$( cat network-deploy.log | tee test.log )

solo node setup -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}" | tee node-setup.log
export SOLO_NODE_SETUP_OUTPUT=$( cat node-setup.log | tee test.log )

solo node start -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}" | tee node-start.log
export SOLO_NODE_START_OUTPUT=$( cat node-start.log | tee test.log )

solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --force | tee mirror-node-deploy.log
export SOLO_MIRROR_NODE_DEPLOY_OUTPUT=$( cat mirror-node-deploy.log | tee test.log )

solo relay deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}" | tee relay-deploy.log
export SOLO_RELAY_DEPLOY_OUTPUT=$( cat relay-deploy.log | tee test.log )

echo "Generate README.md"

envsubst '$KIND_CREATE_CLUSTER_OUTPUT,$SOLO_INIT_OUTPUT,$SOLO_NODE_KEY_PEM_OUTPUT,$SOLO_CLUSTER_SETUP_OUTPUT, \
$SOLO_DEPLOYMENT_CREATE_OUTPUT,$SOLO_NETWORK_DEPLOY_OUTPUT,$SOLO_NODE_SETUP_OUTPUT,$SOLO_NODE_START_OUTPUT,\
$SOLO_MIRROR_NODE_DEPLOY_OUTPUT,$SOLO_RELAY_DEPLOY_OUTPUT'\
< docs/content/User/StepByStepGuide.md.template > docs/content/User/StepByStepGuide.md

echo "Remove color codes and lines showing intermediate progress"

sed -i 's/\[32m//g' docs/content/User/StepByStepGuide.md
sed -i 's/\[33m//g' docs/content/User/StepByStepGuide.md
sed -i 's/\[39m//g' docs/content/User/StepByStepGuide.md
egrep -v '↓|❯|•' docs/content/User/StepByStepGuide.md > docs/content/User/StepByStepGuide.md.tmp && mv docs/content/User/StepByStepGuide.md.tmp docs/content/User/StepByStepGuide.md
set +x

#!/bin/bash
set -eo pipefail

#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses solo account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#

source .github/workflows/script/helper.sh

function enable_port_forward ()
{
  local explorer_svc
  explorer_svc="$(kubectl get svc -l app.kubernetes.io/component=hedera-explorer -n solo-e2e --output json | jq -r '.items[].metadata.name')"
  kubectl port-forward -n solo-e2e svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e "${explorer_svc}" 8080:80 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/relay-node1-hedera-json-rpc-relay 7546:7546 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/mirror-grpc 5600:5600 > /dev/null 2>&1 &
}

function clone_smart_contract_repo ()
{
  echo "Clone hedera-smart-contracts"
  if [ -d "hedera-smart-contracts" ]; then
    echo "Directory hedera-smart-contracts exists."
  else
    echo "Directory hedera-smart-contracts does not exist."
    git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests
  fi
}

function setup_smart_contract_test ()
{
  echo "Setup smart contract test"
  cd hedera-smart-contracts

  echo "Remove previous .env file"
  rm -f .env

  npm install
  npx hardhat compile || return 1

  echo "Build .env file"

  echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
  echo "RETRY_DELAY=5000 # ms" >> .env
  echo "MAX_RETRY=5" >> .env
  cat .env
  cd -
}

function start_background_transactions ()
{
  echo "Start background transaction"
  # generate accounts as background traffic for two minutes
  # so record stream files can be kept pushing to mirror node
  cd solo
  npm run solo-test -- account create -n solo-e2e --create-amount 15 > /dev/null 2>&1 &
  cd -
}

function start_contract_test ()
{
  cd hedera-smart-contracts
  echo "Wait a few seconds for background transactions to start"
  sleep 5
  echo "Run smart contract test"
  npm run hh:test
  result=$?

  cd -
  return $result
}

function start_sdk_test ()
{
  cd solo
  node examples/create-topic.js
  result=$?

  cd -
  return $result
}

echo "Restart port-forward"
task clean:port-forward
enable_port_forward


echo "Change to parent directory"
cd ../
create_test_account
clone_smart_contract_repo
setup_smart_contract_test
start_background_transactions
start_contract_test
start_sdk_test
echo "Sleep a while to wait background transactions to finish"
sleep 30

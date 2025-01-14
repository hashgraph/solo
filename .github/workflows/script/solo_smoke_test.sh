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
  npx hardhat compile || return 1:

  echo "Build .env file"

  echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
  echo "RETRY_DELAY=5000 # ms" >> .env
  echo "MAX_RETRY=5" >> .env
  cat .env
  cd -
}

function check_port_forward ()
{
  # run background task for few minutes
  for i in {1..20}
  do
    echo "Check port forward"
    ps -ef |grep port-forward
    sleep 5
  done &
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

echo "Change to parent directory"
cd ../
create_test_account

cd solo
# if first parameter equals to ACCOUNT_INIT,
# then call solo account init before deploy mirror and relay node
if [ -n "$1" ] && [ "$1" == "ACCOUNT_INIT" ]; then
  echo "Call solo account init"
  solo account init -n solo-e2e

  task solo:mirror-node

  solo relay deploy -n solo-e2e -i node1 --operator-key $OPERATOR_KEY --operator-id $OPERATOR_ID
  kubectl port-forward -n solo-e2e svc/relay-node1-hedera-json-rpc-relay 7546:7546 > /dev/null 2>&1 &

else
  task solo:mirror-node
  task solo:relay
fi
cd -

clone_smart_contract_repo
setup_smart_contract_test
start_background_transactions
check_port_forward
start_contract_test
start_sdk_test
echo "Sleep a while to wait background transactions to finish"
sleep 30

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


# if first parameter equals to ACCOUNT_INIT,
# then call solo account init before deploy mirror and relay node
if [ "$1" == "ACCOUNT_INIT" ]; then
  echo "Call solo account init"
  npm run solo-test -- account init -n solo-e2e
fi

task solo:mirror-node
task solo:relay

echo "Change to parent directory"

cd ../
create_test_account
clone_smart_contract_repo
setup_smart_contract_test
start_background_transactions
check_port_forward
start_contract_test
start_sdk_test
echo "Sleep a while to wait background transactions to finish"
sleep 30

# get the logs of mirror-monitor
kubectl get pods -n solo-e2e | grep mirror-monitor | awk '{print $1}' | xargs kubectl logs -n solo-e2e > mirror-monitor.log

if grep -q "ERROR" mirror-monitor.log; then
  echo "mirror-monitor.log contains ERROR"
  exit 1
fi


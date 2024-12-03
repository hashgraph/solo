#!/bin/bash
set -eo pipefail

#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses solo account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#

function_name=""

function enable_port_forward ()
{
  kubectl port-forward -n solo-e2e svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/hedera-explorer 8080:80 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/relay-node1-hedera-json-rpc-relay 7546:7546 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/mirror-grpc 5600:5600 > /dev/null 2>&1 &
}

function clone_sdk_repo ()
{
  echo "Clone hedera-sdk-js"
  if [ -d "hedera-sdk-js" ]; then
    echo "Directory hedera-sdk-js exists."
  else
    echo "Directory hedera-sdk-js does not exist."
    git clone https://github.com/hashgraph/hedera-sdk-js --branch v2.53.0
    cd hedera-sdk-js
    npm install --save @hashgraph/sdk
    cd -
  fi
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

# retry the function saved in function_name for few times
function retry_function ()
{
  local num=$1
  for ((i=1; i<=$num; i++)); do
    return_code=$( ( $function_name > retry.log; echo $? ))
    # Use the return code
    if [[ $return_code -eq 0 ]]; then
      echo "Function $function_name is successful"
      return
    else
      echo "Function $function_name failed with return code $return_code"
    fi
    echo "Retry $function_name in 2 seconds"
    echo "-----------------------"
    cat retry.log
    echo "-----------------------"
    sleep 2
  done
  echo "Function $function_name failed after 5 retries"
  exit 1
}

function setup_smart_contract_test ()
{
  echo "Setup smart contract test"
  cd hedera-smart-contracts

  echo "Remove previous .env file"
  rm -f .env

  npm install
  npx hardhat compile

  echo "Build .env file"

  echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
  echo "RETRY_DELAY=5000 # ms" >> .env
  echo "MAX_RETRY=5" >> .env
  cat .env
  cd -
}

function background_keep_port_forward ()
{
  for i in {1..25}; do
    ps -ef |grep port-forward
    echo "Enable port forward round $i"
    enable_port_forward
    sleep 2
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

function retry_contract_test ()
{
  function_name="start_contract_test"
  retry_function 5
}

function create_test_account ()
{
  echo "Create test account with solo network"
  cd solo

  # create new account and extract account id
  npm run solo-test -- account create -n solo-e2e --hbar-amount 100 --generate-ecdsa-key --set-alias > test.log
  export OPERATOR_ID=$(grep "accountId" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "OPERATOR_ID=${OPERATOR_ID}"
  rm test.log

  # get private key of the account
  npm run solo-test -- account get -n solo-e2e --account-id ${OPERATOR_ID} --private-key > test.log
  export OPERATOR_KEY=$(grep "privateKey" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  export CONTRACT_TEST_KEY_ONE=0x$(grep "privateKeyRaw" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_ONE=${CONTRACT_TEST_KEY_ONE}"
  rm test.log

  npm run solo-test -- account create -n solo-e2e --hbar-amount 100 --generate-ecdsa-key --set-alias > test.log
  export SECOND_KEY=$(grep "accountId" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  npm run solo-test -- account get -n solo-e2e --account-id ${SECOND_KEY} --private-key > test.log
  export CONTRACT_TEST_KEY_TWO=0x$(grep "privateKeyRaw" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  echo "CONTRACT_TEST_KEY_TWO=${CONTRACT_TEST_KEY_TWO}"
  rm test.log

  export CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEY_ONE},$'\n'${CONTRACT_TEST_KEY_TWO}
  export HEDERA_NETWORK="local-node"

  echo "OPERATOR_KEY=${OPERATOR_KEY}"
  echo "HEDERA_NETWORK=${HEDERA_NETWORK}"
  echo "CONTRACT_TEST_KEYS=${CONTRACT_TEST_KEYS}"

  cd -
}

function start_sdk_test ()
{
  cd solo
  node examples/create-topic.js
  result=$?

  cd -
  return $result
}

function retry_sdk_test ()
{
  function_name="start_sdk_test"
  retry_function 5
}

echo "Change to parent directory"
cd ../
create_test_account
clone_sdk_repo
clone_smart_contract_repo
setup_smart_contract_test
background_keep_port_forward
start_background_transactions
retry_contract_test
retry_sdk_test
echo "Sleep a while to wait background transactions to finish"
sleep 30

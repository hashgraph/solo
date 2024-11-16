#!/bin/bash
#set -eo pipefail

trap handle_error ERR

handle_error() {
  echo "An error occurred"
  ps -ef |grep port-forward
  # exit to shell
  exit 1
}
#
# This script should be called after solo has been deployed with mirror node and relay node deployed,
# and should be called from the root of the solo repository
#
# This uses local node account creation function to repeatedly generate background transactions
# Then run smart contract test, and also javascript sdk sample test to interact with solo network
#

function enable_port_forward ()
{
  echo "Enable port forward"
  kubectl port-forward -n solo-e2e svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/hedera-explorer 8080:80 > /dev/null 2>&1 &
  kubectl port-forward -n solo-e2e svc/relay-node1-hedera-json-rpc-relay 7546:7546 > /dev/null 2>&1 &
}


function create_account_and_extract_key ()
{
  echo "Generate ECDSA keys, extract from output and save to key.txt"
  npm run generate-accounts 3 > key.log
  sed -n 's/.* - \(0x[0-9a-f]*\) - \(0x[0-9a-f]*\) - .*/\1 \2/p' key.log > key.txt

  echo "Only keep the private key, the second column of each line of file key.txt"
  awk '{print "\"" $2 "\","}' key.txt > private_key_with_quote.txt
  awk '{print "" $2 ","}' key.txt > private_key_without_quote.txt

  echo "Remove the comma of the last line before add to json file"
  sed '$ s/.$//' private_key_with_quote.txt > private_key_with_quote_final.txt
  sed '$ s/.$//' private_key_without_quote.txt > private_key_without_quote_final.txt

  LOCAL_NODE_KEYS=$(cat private_key_with_quote_final.txt)
  CONTRACT_TEST_KEYS=$(cat private_key_without_quote_final.txt)

  echo "Add new keys to hardhat.config.js"
  git checkout test/smoke/hardhat.config.js
  awk '/accounts: \[/ {print; getline; getline; next} 1' test/smoke/hardhat.config.js > test/smoke/hardhat.config.js.tmp

  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "$LOCAL_NODE_KEYS" > temp.txt
    sed '/accounts: \[/r temp.txt'  test/smoke/hardhat.config.js.tmp  > test/smoke/hardhat.config.js
    rm temp.txt
  else
    awk -v new_keys="$LOCAL_NODE_KEYS" '/accounts: \[/ {print; print new_keys; next} 1' test/smoke/hardhat.config.js.tmp > test/smoke/hardhat.config.js || true
  fi
  echo "Display the new hardhat.config.js"
  cat test/smoke/hardhat.config.js
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

function clone_local_node_repo ()
{
  echo "Clone hedera local node"
  if [ -d "hedera-local-node" ]; then
    echo "Directory hedera-local-node exists."
  else
    echo "Directory hedera-local-node does not exist."
    git clone https://github.com/hashgraph/hedera-local-node --branch v2.32.0
  fi
  ps -ef |grep port-forward
  cd hedera-local-node
  npm install
  ps -ef |grep port-forward
  # call create_account_and_extract_key 10 times
  for i in {1..10}; do
    create_account_and_extract_key
    ps -ef | grep port-forward
    # check if the key is generated
    if [ -s private_key_with_quote_final.txt ]; then
      echo "Key is generated"
      break
    fi
    echo "Wait retry in 5 seconds"
    sleep 5
  done
  cd -
}

function setup_smart_contract_test ()
{
  echo "Setup smart contract test"
  cd hedera-smart-contracts

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
  echo "Keep port forward"
  for i in {1..15}; do
    enable_port_forward
    sleep 2
  done &
}

function start_background_transactions ()
{
  echo "Start background transaction"
  # generate accounts every 3 seconds as background traffic for two minutes
  # so record stream files can be kept pushing to mirror node
  cd hedera-local-node
  for i in {1..15}; do
    echo "Running generate-accounts round $i"
    npm run generate-accounts 3 > background.log 2>&1
    sleep 3
  done &
  cd -
}

function start_contract_test ()
{
  cd hedera-smart-contracts
  echo "Wait a few seconds for background transactions to start"
  sleep 5
  echo "Run smart contract test"
  npm run hh:test
  cd -
}

function start_sdk_test ()
{
  echo "Create test account with solo network"
  cd solo
  npm run solo-test -- account create -n solo-e2e --hbar-amount 100 > test.log
  export HEDERA_NETWORK="local-node"

  # read test.log and extract the line contains "privateKey" and "accountId" to get the OPERATOR_KEY and OPERATOR_ID
  export OPERATOR_KEY=$(grep "privateKey" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  export OPERATOR_ID=$(grep "accountId" test.log | awk '{print $2}' | sed 's/"//g'| sed 's/,//g')
  rm test.log

  cd ../hedera-sdk-js
  node examples/create-topic.js
  cd -
}

echo "Change to parent directory"
cd ../
clone_sdk_repo
background_keep_port_forward
clone_local_node_repo
ps -ef |grep port-forward
clone_smart_contract_repo
setup_smart_contract_test
start_background_transactions
start_contract_test
start_sdk_test

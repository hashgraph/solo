#!/bin/bash
set -eo pipefail

echo "Starting test network with a single node"

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster-setup
kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
npm run solo-test -- init
npm run solo-test -- node keys --gossip-keys --tls-keys -i node1
npm run solo-test -- cluster setup --cluster-setup-namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- network deploy -n "${SOLO_NAMESPACE}" -i node1
npm run solo-test -- node setup     -n "${SOLO_NAMESPACE}" -i node1
npm run solo-test -- node start     -n "${SOLO_NAMESPACE}" -i node1
npm run solo-test -- mirror-node deploy -n "${SOLO_NAMESPACE}"
npm run solo-test -- relay deploy -n "${SOLO_NAMESPACE}" -i node1

kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 &
kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 &
kubectl port-forward svc/hedera-explorer -n "${SOLO_NAMESPACE}" 8080:80 &

echo "Clone hedera local node"

cd ..

if [ -d "hedera-local-node" ]; then
  echo "Directory hedera-local-node exists."
else
  echo "Directory hedera-local-node does not exist."
  git clone https://github.com/hashgraph/hedera-local-node --branch release-2.32.1
fi

cd hedera-local-node
npm install

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
# if os is macos, insert content of LOCAL_NODE_KEYS to test/smoke/hardhat.config.js.tmp after a line contains "accounts: ["

if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "$LOCAL_NODE_KEYS" > temp.txt
  sed '/accounts: \[/r temp.txt'  test/smoke/hardhat.config.js.tmp  > test/smoke/hardhat.config.js
  rm temp.txt
else
  awk -v new_keys="$LOCAL_NODE_KEYS" '/accounts: \[/ {print; print new_keys; next} 1' test/smoke/hardhat.config.js.tmp > test/smoke/hardhat.config.js || true
fi
echo "Display the new hardhat.config.js"
cat test/smoke/hardhat.config.js


#echo "Run smoke test"
#cd test/smoke
#npm install
#npx hardhat test

cd ..

if [ -d "hedera-smart-contracts" ]; then
  echo "Directory hedera-smart-contracts exists."
else
  echo "Directory hedera-smart-contracts does not exist."
  git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests
fi
cd hedera-smart-contracts

npm install
npx hardhat compile

echo "Build .env file"

echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
echo "RETRY_DELAY=5000 # ms" >> .env
echo "MAX_RETRY=5" >> .env
cat .env

echo "Start background transaction"


# generate accounts every 3 seconds as background traffic for two minutes
# so record stream files can be kept pushing to mirror node
cd ../hedera-local-node
for i in {1..40}; do
  npm run generate-accounts 3 > background.log 2>&1
  sleep 3
done &
cd -

npm list
echo "Run contract test"
npm run hh:test

#!/usr/bin/env bash

echo "Starting a test network with a single node"

./test/e2e/setup-e2e.sh
solo node keys --gossip-keys --tls-keys --key-format pfx -i node0
solo node setup -i node0
solo node start -i node0
solo mirror-node deploy
solo relay deploy -i node0
kubectl port-forward svc/relay-node0-hedera-json-rpc-relay -n solo-e2e 7546:7546 &
kubectl port-forward svc/haproxy-node0-svc -n solo-e2e 50211:50211 &
kubectl port-forward svc/fullstack-deployment-hedera-explorer -n solo-e2e 8080:80 &

echo "Clone hedera local node"

cd ..
git clone https://github.com/hashgraph/hedera-local-node --branch release-2.29.0
cd hedera-local-node
npm install

echo "Generate keys, extract from output and save to key.txt"
npm run generate-accounts 3 >> key.log
sed -n 's/.* - \(0x[0-9a-f]*\) - \(0x[0-9a-f]*\) - .*/\1 \2/p' key.log > key.txt

echo "Only keep the second column of each line of file key.txt"
awk '{print "\"" $2 "\","}' key.txt > key2.txt

echo "Remove the comma of the last line before add to json file"
cat key2.txt | sed '$ s/.$//' > key3.txt

NEW_KEYS=$(cat key3.txt)

echo "Add new keys to hardhat.config.js"
awk '/accounts: \[/ {print; getline; getline; next} 1' test/smoke/hardhat.config.js > test/smoke/hardhat.config.js.tmp
awk -v new_keys="$NEW_KEYS" '/\],/ {print new_keys; print; next} 1' test/smoke/hardhat.config.js.tmp > test/smoke/hardhat.config.js
cat test/smoke/hardhat.config.js

echo "Start background transaction"
watch npm run generate-accounts 3 >> background.log &

echo "Run smoke test"

#cd test/smoke
#npm install
#npx hardhat test

cd ..
git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests
cd hedera-smart-contracts
npm install
npx hardhat compile

echo "Build .env file"

echo "PRIVATE_KEYS=$NEW_KEYS" > .env
echo "RETRY_DELAY=5000 # ms" >> .env
echo "MAX_RETRY=5" >> .env


npm run hh:test

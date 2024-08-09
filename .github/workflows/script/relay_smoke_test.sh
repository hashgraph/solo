#!/bin/bash

echo "Starting test network with a single node"

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

echo "Generate ECDSA keys, extract from output and save to key.txt"
npm run generate-accounts 3 >> key.log
sed -n 's/.* - \(0x[0-9a-f]*\) - \(0x[0-9a-f]*\) - .*/\1 \2/p' key.log > key.txt

echo "Only keep the private key, the second column of each line of file key.txt"
awk '{print "\"" $2 "\","}' key.txt > private_key_with_quote.txt
awk '{print "" $2 ","}' key.txt > private_key_without_quote.txt

echo "Remove the comma of the last line before add to json file"
cat private_key_with_quote.txt | sed '$ s/.$//' > private_key_with_quote_final.txt
cat private_key_without_quote.txt | sed '$ s/.$//' > private_key_without_quote_final.txt

LOCAL_NODE_KEYS=$(cat private_key_with_quote_final.txt)
CONTRACT_TEST_KEYS=$(cat private_key_without_quote_final.txt)

echo "Add new keys to hardhat.config.js"
awk '/accounts: \[/ {print; getline; getline; next} 1' test/smoke/hardhat.config.js > test/smoke/hardhat.config.js.tmp
awk -v new_keys="$LOCAL_NODE_KEYS" '/\],/ {print new_keys; print; next} 1' test/smoke/hardhat.config.js.tmp > test/smoke/hardhat.config.js
cat test/smoke/hardhat.config.js

#echo "Run smoke test"
#cd test/smoke
#npm install
#npx hardhat test

cd ..
git clone https://github.com/hashgraph/hedera-smart-contracts --branch only-erc20-tests-2
cd hedera-smart-contracts
git branch
npm install
npx hardhat compile

echo "Build .env file"

echo "PRIVATE_KEYS=\"$CONTRACT_TEST_KEYS\"" > .env
echo "RETRY_DELAY=5000 # ms" >> .env
echo "MAX_RETRY=5" >> .env
cat .env

echo "Start background transaction"
# cd ../hedera-local-node;  watch npm run generate-accounts 3 >> background.log &  cd -

npm list
echo "Run contract test"
npm run hh:test

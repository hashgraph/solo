#!/usr/bin/env bash

./test/e2e/setup-e2e.sh

solo network deploy -i node1,node2,node3 --pvcs

solo node keys --gossip-keys --tls-keys

solo node setup -i node1,node2,node3 --local-build-path ../hedera-services/hedera-node/data

solo node start -i node1,node2,node3

solo node add --gossip-keys --tls-keys --node-id node4 --debug-nodeid node4 --local-build-path ../hedera-services/hedera-node/data


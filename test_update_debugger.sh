#!/usr/bin/env bash

./test/e2e/setup-e2e.sh

solo network deploy -i node1,node2,node3

solo node keys --gossip-keys --tls-keys

solo node setup -i node1,node2,node3 --local-build-path ../hedera-services/hedera-node/data


solo node start -i node1,node2,node3


solo node update --node-id node2  --debug-nodeid node2 --local-build-path ../hedera-services/hedera-node/data --new-account-number 0.0.7 --gossip-public-key ./s-public-node2.pem --gossip-private-key ./s-private-node2.pem --agreement-public-key ./a-public-node2.pem --agreement-private-key ./a-private-node2.pem


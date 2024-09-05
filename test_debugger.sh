#!/usr/bin/env bash

./test/e2e/setup-e2e.sh

solo network deploy -i node1,node2,node3 --debug-nodeid node2

solo node keys --gossip-keys --tls-keys --key-format pem

solo node setup -i node1,node2,node3 --local-build-path ../hedera-services/hedera-node/data

#kubectl port-forward network-node2-0 -n solo-e2e 5005:5005 &
#


solo node start -i node1,node2,node3

kubectl port-forward network-node2-0 -n solo-e2e 5005:5005 &

# now goto intellij and attach the debug


#--debug-nodeid node2

#kubectl port-forward network-node2-0 -n solo-e2e 5005:5005 &

#solo node add --gossip-keys --tls-keys --key-format pem --node-id node4 --debug-nodeid node4 --local-build-path ../hedera-services/hedera-node/data

# solo node update --node-id node2 --new-account-number 0.0.7 --debug-nodeid node2 --local-build-path ../hedera-services/hedera-node/data


# start, add, update delete
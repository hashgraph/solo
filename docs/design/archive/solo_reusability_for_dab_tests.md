# Solo Reusability for DAB Test Cases (DRAFT)

# Problem Statement

Multiple teams are limited in tools to leverage for testing new SDK and Platform functionality, in this case the functionality to test is the Dynamic Address Book NodeCreateTransaction, NodeUpdateTransaction, and NodeDeleteTransaction.  The tools they are limited to are Solo, Local Node, and NMT.  Solo has the better set of functionality and deploys faster, and supplies an entire network, which Local Node is not really designed for.

# Current State

We have the NodeCommand and it has three subcommands coded: add, update, and delete.

We have the following work almost complete for Node Add to be more reusable: <https://github.com/hashgraph/solo/pull/533>. It created the following subcommands:

## add-prepare

* Initialize
* Check that PVCs are enabled
* Identify existing network nodes
* Determine new node account number
* Generate Gossip key
* Generate gRPC TLS key
* Load signing key certificate
* Compute mTLS certificate hash
* Prepare gossip endpoints
* Prepare grpc service endpoints
* Prepare upgrade zip file for node upgrade process
* Check existing nodes staked amount

## add-submit-transactions

* Send node create transaction
* Send prepare upgrade transaction
* Send freeze upgrade transaction

## add-execute

* Download generated files from an existing node
* Prepare staging directory
  * Copy Gossip keys to staging
  * Copy gRPC TLS keys to staging
* Copy node keys to secrets
* Check network nodes are frozen
* Get node logs and configs
* Deploy new network node
* Kill nodes to pick up updated configMaps
* Check node pods are running
* Fetch platform software into all network nodes
* Download last state from an existing node
* Upload last saved state to new network node
* Setup new network node
* Start network nodes
* Check all nodes are ACTIVE
* Check all node proxies are ACTIVE
* Stake new node
* Trigger stake weight calculate

The intention was that the SDK team could use `solo node add-prepare` with some flags to do all of the K8s work as well as generate some output files that they can use when executing the NodeCreateTransaction.  They could then run `solo node add-execute` to apply all of the changes to K8s and then restart the network.

We created a Node Delete and Node Update issue similar to the one that is addressed in Node Add, but without a description.

## update

* Initialize
* Identify existing network nodes
* Prepare gossip endpoints
* Prepare grpc service endpoints
* Load node admin key
* Prepare upgrade zip file for node upgrade process
* Check existing nodes staked amount
* Send node update transaction
* Send prepare upgrade transaction
* Download generated files from an existing node
* Send freeze upgrade transaction
* Prepare staging directory
  * Copy Gossip keys to staging
  * Copy gRPC TLS keys to staging
* Copy node keys to secrets
* Check network nodes are frozen
* Get node logs and configs
* Update chart to use new configMap due to account number change
* Kill nodes to pick up updated configMaps
* Check node pods are ready
* Fetch platform software into network nodes
* Setup network nodes
* Start network nodes
* Check all nodes are ACTIVE
* Check all node proxies are ACTIVE
* Trigger stake weight calculate
* Finalize

## delete-prepare

* Initialize
* Identify existing network nodes
* Load node admin key
* Prepare upgrade zip file for node upgrade process
* Check existing nodes staked amount

## delete-submit-transactions

* Send node delete transaction
* Send prepare upgrade transaction
* Send freeze upgrade transaction

## delete-execute

* Download generated files from an existing node
* Prepare staging directory
  * Copy Gossip keys to staging
  * Copy gRPC TLS keys to staging
* Copy node keys to secrets
* Check network nodes are frozen
* Get node logs and configs
* Update chart to use new configMap
* Kill nodes to pick up updated configMaps
* Check node pods are running
* Fetch platform software into network nodes
* Setup network nodes
* Start network nodes
* Check all nodes are ACTIVE
* Check all node proxies are ACTIVE
* Trigger stake weight calculate
* Finalize

## Functionality Overlap Table

| Task                                              | add | add-prepare | add-submit-transactions | add-execute | update | delete |
|---------------------------------------------------|-----|-------------|-------------------------|-------------|--------|--------|
| Initialize                                        | X   | X           |                         |             | X      | X      |
| Check that PVCs are enabled                       | X   | X           |                         |             |        |        |
| Identify existing network nodes                   | X   | X           |                         |             | X      | X      |
| Determine new node account number                 | X   | X           |                         |             |        |        |
| Generate Gossip key                               | X   | X           |                         |             |        |        |
| Generate gRPC TLS key                             | X   | X           |                         |             |        |        |
| Load signing key certificate                      | X   | X           |                         |             |        |        |
| Compute mTLS certificate hash                     | X   | X           |                         |             |        |        |
| Prepare gossip endpoints                          | X   | X           |                         |             | X      |        |
| Prepare grpc service endpoints                    | X   | X           |                         |             | X      |        |
| Load node admin key                               |     |             |                         |             | X      | X      |
| Prepare upgrade zip file for node upgrade process | X   | X           |                         |             | X      | X      |
| Check existing nodes staked amount                | X   | X           |                         |             | X      | X      |
| Send node create transaction                      | X   |             | X                       |             |        |        |
| Send node update transaction                      |     |             |                         |             | X      |        |
| Send node delete transaction                      |     |             |                         |             |        | X      |
| Send prepare upgrade transaction                  | X   |             | X                       |             | X      | X      |
| Send freeze upgrade transaction                   | X   |             | X                       |             | X      | X      |
| Download generated files from an existing node    | X   |             |                         | X           | X      | X      |
| Prepare staging directory                         | X   |             |                         | X           | X      | X      |
| Copy node keys to secrets                         | X   |             |                         | X           | X      | X      |
| Check network nodes are frozen                    | X   |             |                         | X           | X      | X      |
| Get node logs and configs                         | X   |             |                         | X           | X      | X      |
| Deploy new network node                           | X   |             |                         | X           |        |        |
| Update chart to use new configMap                 |     |             |                         |             | X      | X      |
| Kill nodes to pick up updated configMaps          | X   |             |                         | X           | X      | X      |
| Check node pods are running                       | X   |             |                         | X           | X      | X      |
| Fetch platform software into all network nodes    | X   |             |                         | X           | X      | X      |
| Download last state from an existing node         | X   |             |                         | X           |        |        |
| Upload last saved state to new network node       | X   |             |                         | X           |        |        |
| Setup new network node                            | X   |             |                         | X           | X      | X      |
| Start network nodes                               | X   |             |                         | X           | X      | X      |
| Check all nodes are ACTIVE                        | X   |             |                         | X           | X      | X      |
| Check all node proxies are ACTIVE                 | X   |             |                         | X           | X      | X      |
| Stake new node                                    | X   |             |                         | X           |        |        |
| Trigger stake weight calculate                    | X   |             |                         | X           | X      | X      |
| Finalize                                          |     |             |                         |             | X      | X      |

The following is the Freeze table that the Solo team wants to Solo to be able to be leveraged to complete by other teams:

[Freeze](https://www.notion.so/291f2f5a4f244ca7b71f08f626b57fc7?pvs=21)

TODO:

* \[ ]  Need command to wait for freeze
* \[ ]  Need command finish upgrade (pull upgrade/current files and apply them, etc)
* \[ ]  need restart command
* \[ ]  update and/or remove the node update / node delete change GHIssues
* \[ ]  update node add to allow more than one node at a time

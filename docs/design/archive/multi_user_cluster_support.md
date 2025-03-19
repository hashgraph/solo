# Multi-user and Multi-cluster Support: Solo State and Lease Mechanism (DRAFT)

| Last Revision | May 15, 2024  |
|---------------|---------------|
| Solo Version  | TBD           |
| Contact       | @Lenin Mehedy |

**Table of Contents**

### 1. Problem Statement

Currently solo stores its configuration locally in a file e.g. ~/.solo/solo.config as a JSON file. This however works as long as there is a single engineer managing a local/remote deployment of a Hedera Network. However, for more advanced use cases and long running networks, multiple engineers need to be able to manage the network using `solo`. Therefore, `solo` must maintain its “state” or configuration in the kubernetes cluster at the namespace level (as configmap and secrets) instead of storing those locally. Such a `solo state` can be thought to be similar to Terraform state.

### 2. Requirements

* \[x]  R1. Support multiple users maintaining the network : ‣
* \[ ]  R2. Support multiple clusters for the same network
* \[ ]  R3. Solo state should be versioned and supports migrations
* \[ ]  R4. Solo state should be locked before the network can be managed
* \[x]  R5. Locks should be namespace level leases : ‣
* \[x]  R6. Two users should be able to operate against different network deployments simultaneously : ‣
* \[x]  R7. Use the native K8S lease construct : ‣
  * \[x]  Look at how the Java or Go Operator SDK implements expirable mutex locks for cluster leadership decisions
* \~~R8. Support multiple namespaces in the same cluster for the same network (Do we need this?)~~
  * Current aim is to deploy network components in the same namespace. First MVP should aim to use same namespace name across cluster to avoid complexity. Also multiple namespace in the same cluster would complicate the leasing mechanism. However, we should keep option open just in case we need this in the future.
* \[ ]  ~~R9: Support caching various flags similar to how currently solo is caching (Do we need this?), we got rid of caching of flags~~
* \[ ]  R10: P2: Support command history like bash\_history so that the network can be replicated if required and also for audit purposes (Do we need this?)
* \[ ]  R11: From a local Solo run all clusters must be mapped to a users k8s context in order for them to proceed with any Solo command
  * we can direct them to some setup prompts and query their existing kube contexts and allow them to map to the clusters referenced in the config
  * we can cache the kube context to cluster mapping on the local machine so that the user does not get prompted again
* \[ ]  R12: After pulling a cluster config, if there are multiple clusters the other configs need to be pulled and compared to ensure they are all in sync
  * If they are not in sync, inform the user and abort, the configs will need to be manually brought back into sync
  * In the future we might be able to handle certain out of sync scenarios for the user via automation
* \[ ]  R13: will need to use a service mesh to handle DNS resolution with network nodes in different clusters and building the config.txt / addressbook

**Q. Where should we store the solo state?**

A shared namespace (e.g. where fullstack-cluster-setup chart is installed) would be the most suitable instead of the namespace where the network is deployed

### **3. Current Data Model**

Existing solo configuration was designed such that the user does not need to enter the same flags or CLI switches repeatedly. For example, once `namespace` is specified, user doesn’t need to specify it again. All flags are currently stored with key `flags`. The latest command is also cached with key `lastCommand` with anticipation that user may want to see what command he/she ran last if the network has been running for a while and user may forget what was done last.

```bash
{
  "flags": {
    "cluster-name": "kind-solo-e2e",
    "dev": false,
    "cluster-setup-namespace": "fullstack-setup",
    "namespace": "solo",
    "release-tag": "v0.47.0",
    "cache-dir": "/Users/leninmehedy/.solo/cache",
    "node-ids": "node0,node1,node2",
    "key-format": "pem",
    "fst-chart-version": "v0.24.3",
    "profile-file": "/Users/leninmehedy/.solo/cache/profiles/custom-spec.yaml",
    "profile": "local",
    "prometheus-stack": true,
    "minio": true,
    "cert-manager": false,
    "cert-manager-crds": false
  },
  "version": "0.24.0",
  "updatedAt": "2024-04-25T03:46:58.181Z",
  "lastCommand": [
    "cluster",
    "setup"
  ]
}%
```

**Limitations:**

* Does not support multiple clusters
* Does not support multiple maintainers of the network
* All network is deployed to a single namespace

### 4. Inspirations

We don’t need to reinvent the wheel.

So below are some well established designs that we need to consult before deciding on our state model and leasing protocol:

* Terraform State: <https://developer.hashicorp.com/terraform/language/state>
* Kubernetes Lease: <https://kubernetes.io/docs/concepts/architecture/leases/>

### 5. Solo State

We would like to store the new data model in YAML format similar to Kubernetes manifest files.

Each solo state will be stored with team level access control in the cluster (probably as secrets????). So any team will be able to see all the states and networks, but cannot read/modify another team’s states. Each team is allowed to managed deployment or any number of solo networks.

Actual configuration of the deployed component can be found the the Kubernetes manifest. Therefore `solo` state is designed to store the details about where different components are deployed across different clusters and namespaces so that relevant leases can be acquired before updating the deployed network.

```yaml
version: 1.0.32 # solo state maintaines its own version increments, not same as solo version
metadata:
	name: my-network-1 # name of the network that this state represents. This is also the name of the lock. This shouldn't be changed once set.
	lastUpdatedAt: 2024-04-25T13:03:32Z
	lastUpdatedBy: lenin.mehedy@swirldslabs.com # user email address is more unique, for example, Jeromy's OS User is 'user'... weird, I know.
	migration: # to support R3
		migratedAt: 2024-04-15T13:03:32Z
		migratedBy: lenin.mehedy@swirldslabs.com
		fromVersion: 1.0.31 # usually it should be incremental
		~~configMap: my-network-1-migrate-1.0.31 # config map name. It should have the script and relevant data~~
clusters: # acquire leases accross all clusters and namespaces
	- name: cluster-1
		namespace: solo-1
	- name: cluster-2
		namespace: solo-1
	- name: cluster-N
		namespace: solo-1
components:
	consensus:
		- name: node0
			cluster: cluster-1
			namespace: solo-1
		- name: node1
			cluster: cluster-1
			namespace: solo-1
		- name: node2
			cluster: cluster-2
			namespace: solo-1
	haproxy: # should ideally be in the same cluster, namespace can be different if required
		- name: haproxy-node0 
			cluster: cluster-1 # same cluster as consensus node
			namespace: solo-1 # same namespace as consensus node
			consensusNode: node0
		- name: haproxy-node1
			cluster: cluster-1 # same cluster as consensus node
			namespace: solo-1
			consensusNode: node1
		- name: haproxy-node2
			cluster: cluster-2 # same cluster as consensus node
			namespace: solo-1 # different namespace as consensus node
			consensusNode: node2
	envoyProxy: # should ideally be in the same cluster, namepspace can be different if required
		- name: envoy-proxy-node0 
			cluster: cluster-1 # same cluster as consensus node
			namespace: solo-1 # same namespace as consensus node
			consensusNode: node0
	mirror:
		- name: mirror-1
			cluster: cluster-1
			namespace: solo-1
	mirror-node-explorer:
	  - name: mirror-explorer-1
      cluster: cluster-1
	    namespace: solo-1
	relay:
		- name: relay-node0-node1
			cluster: cluster-1
			namespace: solo-1
			consensusNode:
				- node0
				- node1
		- name: relay-node2
			cluster: cluster-2
			namespace: solo-1
			consensusNode:
				- node2
cli: # in order to support requirement R9
	~~flags: # cache the flag values same as now so that users can avoid entering the same value repeatedly
		platformReleaseTag: v0.49.0
		relayReleaseTag: v0.45.0
		prometheusStack: true
		...~~
	history: # let us make this a P2 enhancement
		- my-network-1-history-02 # a configmap of most recent ~99 commands
		- my-network-1-history-01
		
	==============================
	my-network-1-history-01: # an archive of command history 
	- command: [ solo init -t v0.49.0 ]
		~~flags: # a snapshot of the flags # skip this for now, even lower priority, we could just reparse the command
			platformReleaseTag: v0.49.0 
			namespace: solo-e2e
			...~~
		executedAt: 2024-04-22T11:03:32Z
		executedBy: lenin.mehedy@swirldslabs.com
	- command: [solo cluster setup]
		executedAt: 2024-04-22T11:23:32Z
		executedBy: lenin.mehedy@swirldslabs.com
		~~flags: # a snapshot of the flags
			platformReleaseTag: v0.49.0
			namespace: solo-e2e
			...~~
	- command: [solo network deploy -t v0.49.0 -i node0,node1,node3]
		executedAt: 2024-04-22T11:23:32Z
		executedBy: xxx@swirldslabs.com	
		~~flags: # a snapshot of the flags
			platformReleaseTag: v0.49.0
			namespace: solo-e2e
			...~~
```

### 6. Solo Lease

We are going to use “strict [two-phase locking](https://search.brave.com/search?q=two+phase+locking\&source=desktop\&summary=1\&summary_og=eyJ0aXRsZSI6IlR3byBwaGFzZSBsb2NraW5nIiwiZGVzY3JpcHRpb24iOiJUd28tcGhhc2UgbG9ja2luZyBpcyBhIGNvbmN1cnJlbmN5IGNvbnRyb2wgbWV0aG9kIHVzZWQgaW4gZGF0YWJhc2UgbWFuYWdlbWVudCBzeXN0ZW1zIHRvIGVuc3VyZSBzZXJpYWxpemFiaWxpdHksIHdoaWNoIG1lYW5zIHRoYXQgdGhlIG91dGNvbWUgb2YgYSBzZXQgb2YgdHJhbnNhY3Rpb25zIGlzIGVxdWl2YWxlbnQgdG8gdGhlIG91dGNvbWUgb2YgZeKApiIsImltYWdlIjp7InNyYyI6Imh0dHBzOi8vY2RuLnNlYXJjaC5icmF2ZS5jb20vc2VycC9vZy83MDlhODY5NjFmNDQ5MDljMDdmMWQ5LnBuZyIsIndpZHRoIjo0ODQsImhlaWdodCI6NTAxfX0%3D\&sig=08cd90ccc1babbe4d290cd56061c34ee5985cb6770179cef64ba83231efb72a9\&nonce=67bc94c076c3196de5e7397a70a3d72b)” where each user must acquire leases first before any “write” operation. For “read” operations, no lock is necessary.

When two simultaneous user starts locking, the contention is avoided using “earliest lock wins” strategy where when a user discovers another lock, it inspects all locks and if the earliest lock is not its own, it will will release all of its own locks and wait. User may however retry before the expiry to see if lock still exists or not.

Q. There seems to be a need of running a `solo-agent` locally on users computer that can retry automatically?

We can avoid it if `solo` can just let user know when to retry like a message `Currently "lenin.mehedy@swirldslabs.com" has lease until 2024-04-31T13:09:32. Please retry after 21 minutes`. However, if we want solo to auto retry, we need solo log message like above and to spawn a background process to keep retrying. `solo agent` probably is not necessary for phase-1

**TBD:** Leasing mechanism (draw diagram) using Kubernetes leases.

### 7. Solo State Migration

<aside>
💡 At this point I am not sure if we need this since user would lock the state and update it as required:

</aside>

There are few scenarios where state migration would be needed as below.

7a. solo state definition is changed

7b. new versions of the chart needs to be deployed

In both of these scenario, extra metadata about migration will be stored in a separate configmaps (see the `metadata.migration` in the data model)

### 8. Proof of Concept

TBD: Provide link to the PoC: …

## Appendix

### F.A.Q

### How does this design meet the requirements?

### **R1. Support multiple users maintaining the network**

The support for lease mechanism and state enables this.

### R2. Support multiple clusters for the same network

Each components defines the cluster and namespace it is deployed into. So it provides full flexibility where it can be deployed.

### R3. Solo state should be versioned and supports migrations

New data model contains `version` and `metadata.migration` fields. Section 7 explains how migration would be done.

### R4. Solo state should be locked before the network can be monitored

Section 6 explains how locks would be acquired / released by solo.

### R5. Locks should be namespace level leases

Same as R4

### R6. Two users should be able to operate against different network deployments aka namespaces simultaneously

Same as R4

### R7. Use the native K8S lease construct

Same as R4

### ~~R8. Support multiple namespaces for the same network~~

\~~Same as R2.~~

### R9: Support caching various flags similar to how currently solo is caching

There is a section for `cli` and `cli.flags` to cache cli flags

### R10: Support command history like bash\_history so that the network can be replicated if required and also for audit purposes

There is `cli.history` section for this.

# Multi-Cluster Component Image Example

Validates that locally built component images passed with `--component-image` are loaded into
**every** Kind cluster that hosts a consensus node of the deployment, not only the cluster the
component is deployed to (see [issue #5939](https://github.com/hiero-ledger/solo/issues/5939)).
It covers all four image-consuming components: block node, mirror node, explorer and relay.

## What It Does

* Pulls the published block node, relay, explorer and Mirror Node module images and rebuilds each as
  a single-platform image under `solo-local-test/...`, so they exist only in the local Docker daemon
* Creates two Kind clusters (with MetalLB) and a two-node network, one consensus node per cluster
* Adds one block node per cluster, and Mirror Node, Explorer and Relay on cluster 1, each with
  `--component-image` pointing at the local image
* Verifies every local image is present in **both** Kind clusters (`crictl images`) and that the pods
  of every component are Ready, including the cluster 2 block node, which can only start from the
  image preloaded into cluster 2

## Prerequisites

* [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [kubectl](https://kubernetes.io/docs/tasks/tools/),
  [kind](https://kind.sigs.k8s.io/), [Helm](https://helm.sh/), Docker with BuildKit (`docker build --provenance`)

## How to Use

```sh
task            # deploy and verify
task destroy    # clean up
```

## Files

* `Taskfile.yml` — prepare-image, deploy, verify and destroy tasks
* `kind-cluster-*.yaml`, `metallb-cluster-*.yaml` — the same two-cluster Kind and MetalLB setup used by
  `multicluster-backup-restore`
* `mirror-memory-values.yaml`, `relay-memory-values.yaml` — memory limits above Solo's defaults for this
  deployment only (cold starts were OOMKilled at the defaults)

## Notes

* Solo preloads a component image into the component's own cluster plus every cluster hosting a
  consensus node, so cluster 2 needs a consensus node to be covered by this check.
* Each cluster has its own block node: a block node on only one cluster is unreachable from the
  other cluster's consensus node, which stalls its block stream and, with two nodes, consensus.
* The local image names deliberately do not look like registry hosts: Solo classifies images by their
  first path segment, and a host-like name is treated as published and never loaded into Kind.
* Images are rebuilt rather than re-tagged, with provenance/SBOM attestations disabled, because
  `kind load` fails to import multi-platform indexes and BuildKit attestation manifests.
* Mirror Node needs `--enable-ingress` here because the relay reaches it through the mirror ingress
  controller service.

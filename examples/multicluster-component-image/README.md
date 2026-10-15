# Multi-Cluster Component Image Example

Validates that a locally available component image passed with `--component-image` is loaded into
**every** Kind cluster attached to the deployment, not only the cluster the component is deployed
to (see [issue #5939](https://github.com/hiero-ledger/solo/issues/5939)).

## What It Does

* Pulls the published block node image and rebuilds it (as a single-platform image, which `kind load` requires) as `solo-local-test/block-node-server:<version>`
  so it exists only in the local Docker daemon
* Creates two Kind clusters (with MetalLB) and a two-node network, one consensus node per cluster
* Adds a block node to cluster 1 only, with `--component-image`
* Verifies the image is present in both Kind clusters (`crictl images`) and the block node pod is Ready

## Prerequisites

* [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [kubectl](https://kubernetes.io/docs/tasks/tools/),
  [kind](https://kind.sigs.k8s.io/), Docker

## How to Use

```sh
task            # deploy and verify
task destroy    # clean up
```

## Notes

* Solo preloads a component image into the component's own cluster plus every cluster hosting a
  consensus node, so cluster 2 needs a consensus node to be covered by this check. The Kind and
  MetalLB files are the same ones used by `multicluster-backup-restore`.
* The local image name deliberately does not look like a registry host: Solo classifies images by
  their first path segment, and a host-like name is treated as published and never loaded into Kind.

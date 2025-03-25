# The usage of examples in Solo

## Prerequisites

* install taskfile: `npm install -g @go-task/cli`

## Running the examples with Taskfile

* `cd` into the directory under `examples` that has the `Taskfile.yml`, e.g. (from solo repo root directory) `cd examples/solo-gke-test/`
* make sure that your current kubeconfig context is pointing to the cluster that you want to deploy to
* run `task` which will do the rest and deploy the network and take care of many of the pre-requisites

NOTES:

* Some of these examples are for running against large clusters with a lot of resources available.
* the `env` environment variables if set in your shell will take precedence over what is in the Taskfile.yml. e.g. `export HEDERA_SERVICES_ROOT=<path-to-hiero-consensus-node-root>`

## Customizing the examples

* take a look at the Taskfile.yml sitting in the subdirectory for the deployment you want to run
* make sure your cluster can handle the number in SOLO\_NETWORK\_SIZE, if not, then you will have to update that and make it match the number of nodes in the `init-containers-values.yaml`: `hedera.nodes[]`
* take a look at the `init-containers-values.yaml` file and make sure the values are correct for your deployment with special attention to:
  * resources
  * nodeSelector
  * tolerations
* the `env` environment variables can be changed in the `Taskfile.yml` file as needed
* some are commented out just for awareness, but would need missing files or extra steps if you tried to run them as-is

## Provided examples for Consensus nodes

* examples/performance-tuning/solo-perf-test/init-containers-values.yaml (Solo on Google Cloud, for 4-core/32Gb 7-node )
* examples/performance-tuning/Latitude/init-containers-values.yaml (Latitude, 128Gb, 10-node)
* examples/solo-gke-test (Solo on Google Cloud, for 4-core/32Gb 5-node )

## Add corresponding NetworkLoadGenerator templates

* examples/performance-tuning/solo-perf-test/nlg-values.yaml
* examples/performance-tuning/Latitude/nlg-values.yaml

Start as the following, while in the directory of the nlg-values.yaml and updating the namespace to match your Taskfile.yml:

> helm upgrade --install nlg oci://swirldslabs.jfrog.io/load-generator-helm-release-local/network-load-generator --version 0.2.1 --values nlg-values.yaml -n solo-perf-test

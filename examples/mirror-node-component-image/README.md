# Mirror Node Component Image Example

This example deploys a minimal Hiero network and adds Mirror Node using six **locally built**
module Docker images via `--component-image`, instead of a published registry release. It exists to
exercise and demonstrate the fix for
[issue #5938](https://github.com/hiero-ledger/solo/issues/5938): Mirror Node's build publishes six
distinct images (`hedera-mirror-importer`, `-grpc`, `-rest`, `-rest-java`, `-web3`, `-monitor`), and
`--component-image` must expand a single repository prefix into all six instead of pointing every
module at the same (non-existent) image.

## What It Does

* **Checks out `hiero-mirror-node`** at the version defined in `version.ts` (source for the module
  images only — Solo's own bundled `hedera-mirror` chart is used for the deployment, there is no
  `--mirror-node-chart-dir`)
* **Builds the six Mirror Node module images locally** with the same Gradle invocation
  `hiero-mirror-node`'s own CI uses (`./gradlew ":${module}:dockerBuild" -PimageTag=...`)
* **Deploys a single-node consensus-only network** with the standard step-by-step Solo commands
* **Adds Mirror Node with `--component-image solo-local-test/hedera-mirror:<tag>`** — a repository
  prefix, not a real image — and lets Solo derive, locally-load, and wire up all six module images.
  The prefix is deliberately not a real registry hostname: Solo's local-vs-remote image
  classification looks at the first path segment, and anything that looks like a registry host
  (e.g. the Gradle default `gcr.io/mirrornode`) is treated as a published image and never loaded
  into Kind, even when it happens to already exist in the local Docker daemon
* **Verifies** every Mirror Node pod becomes Ready and is running the expected locally built image
  with `pullPolicy: Never`

If the six-image expansion were broken (the bug fixed by #5938), five of six modules would be
pointed at an image that was never built, and this example's `deploy` task would fail with
`ErrImageNeverPull` instead of reaching Ready.

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the
[Solo releases page](https://github.com/hiero-ledger/solo/releases). Replace `<release_version>`
with the desired release tag (e.g., `v0.92.0`):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-mirror-node-component-image.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the
[GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/mirror-node-component-image).

## Prerequisites

* [Task](https://taskfile.dev/) - Task runner
* [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/)
* [kubectl](https://kubernetes.io/docs/tasks/tools/)
* [kind](https://kind.sigs.k8s.io/) — Kubernetes in Docker
* [Java 25](https://adoptium.net/) — required to build the Mirror Node module images
* Git — to clone `hiero-mirror-node`
* Docker — to build and hold the six local images before they're loaded into Kind

## How to Use

### Quick Start (Automated)

Run everything in one command from this directory:

```sh
task
```

This will:

1. Clone `hiero-mirror-node` next to the `solo` directory (e.g., `../hiero-mirror-node`)
2. Build the six module images with Gradle, all tagged
   `solo-local-test/hedera-mirror-<module>:solo-component-image-test`
3. Create a local Kind cluster
4. Deploy a single consensus node
5. Add Mirror Node with `--component-image solo-local-test/hedera-mirror:solo-component-image-test`
6. Verify every Mirror Node pod is Ready and using the expected local image with `pullPolicy: Never`

### Step-by-Step Workflow

```sh
# 1. Checkout hiero-mirror-node at the correct version
task checkout-repo

# 2. Build the six module images
task build-module-images

# 3. Deploy consensus + Mirror Node and verify (runs 1-2 again if needed)
task deploy

# Re-run just the verification against an already-deployed network
task verify
```

### Using Your Own Pre-Cloned Repository

If you already have `hiero-mirror-node` checked out locally at `../hiero-mirror-node`, the Taskfile
will skip the clone step. Override the location by editing `MIRROR_NODE_REPO_DIR` in the `vars:`
section of `Taskfile.yml`.

### Destroying the Network

```sh
task destroy
```

This will:

1. Destroy the Mirror Node deployment
2. Destroy the consensus network
3. Delete the Kind cluster

## Files

* `Taskfile.yml` — Automation tasks for checkout, build, deploy, verify, and destroy
* `mirror-memory-values.yaml` — Raises module memory limits above Solo's defaults for this
  deployment only; a cold start of several modules was observed to OOMKill at the defaults

## Customization

* **Change the image tag**: edit `IMAGE_TAG` in the `vars:` section
* **Use a different Mirror Node version**: set the `MIRROR_NODE_VERSION` environment variable, or
  edit `version.ts`
* **Use a custom cluster name**: edit `SOLO_CLUSTER_NAME` in `Taskfile.yml`

## Notes

* The Mirror Node modules built here are `grpc`, `importer`, `monitor`, `rest`, `web3`, and
  `rest-java` — the same set `hiero-mirror-node`'s own `acceptance.yaml` workflow builds, and the
  same six Solo expands `--component-image` into (see
  `src/commands/mirror-node-module-images.ts`)
* The repository clone is shallow (`--depth 1`) for faster checkout
* If the repository directory already exists, the clone step is skipped
* This example intentionally deploys only a single consensus node and skips the relay/explorer —
  it is focused on the Mirror Node image-loading path, not a full network smoke test
* For more advanced customization, see the main [Solo documentation](https://github.com/hiero-ledger/solo)

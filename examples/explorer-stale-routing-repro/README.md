# Explorer Stale Routing Repro (Issue #6118)

This example reproduces [hiero-ledger/solo#6118](https://github.com/hiero-ledger/solo/issues/6118):
`solo explorer node upgrade` rewrites the explorer's Helm-managed `ConfigMap` with a freshly
resolved mirror node backend URL, but the already-running explorer pod never picks up the change.

## Root Cause

- The explorer chart's Deployment mounts `nginx.conf` with `subPath`. Kubernetes/kubelet never
  live-refreshes a `subPath`-mounted `ConfigMap` file inside a running pod.
- The Deployment's pod template carries no checksum/restart annotation tied to the `ConfigMap`
  content, so `helm upgrade` only changes the `ConfigMap` object — the pod template is
  byte-identical before and after, so nothing tells Kubernetes to recreate the pod.

Net effect: after `explorer node upgrade`, the `ConfigMap` is correct but the running pod keeps
proxying to whatever backend it started with — which may no longer exist.

## What It Does

- Deploys a kind cluster, a minimal (1-node) consensus network, a mirror node with
  `--enable-ingress`, and the explorer.
- Captures the explorer's live routing state as a `baseline` (ConfigMap `/api` proxy target vs.
  the same value read from inside the running pod's `/etc/nginx/nginx.conf`, plus a real `curl`
  through the explorer's proxy).
- Destroys and redeploys the mirror node _without_ `--enable-ingress`, so the previously-resolved
  backend disappears.
- Runs `solo explorer node upgrade` to force Solo to re-resolve the mirror node service URLs.
- Captures the routing state again as `post-upgrade` and reports whether the ConfigMap and the
  live pod agree.

## Expected Result (bug present)

```
==================== baseline ====================
configmap_vs_pod: MATCH (pod is in sync with ConfigMap)
curl_result: SUCCESS (HTTP 200)

==================== post-upgrade ====================
configmap_vs_pod: MISMATCH (pod is STALE relative to ConfigMap)
curl_result: FAILED (curl exit code 28, likely timeout -> hung proxy to a dead backend)
```

`post-upgrade` showing `MISMATCH` and a failed/timed-out `curl` confirms the bug: `explorer node
upgrade` updated the `ConfigMap`, but the already-running pod kept serving its stale `nginx.conf`.

Verified to reproduce against `main` (commit `1da764e49`) and against
[PR #6100](https://github.com/hiero-ledger/solo/pull/6100)'s routing fix applied on top — #6100
changes which mirror service URLs get resolved into the `ConfigMap`, but does not add any
pod-restart/rollout mechanism, so the live pod still never picks up the change either way.

## Prerequisites

- `kind`, `kubectl`, `curl`
- `task` installed

## Run

```bash
cd examples/explorer-stale-routing-repro
task
```

This runs the full sequence (`deploy` → `verify-baseline` → `break-mirror-routing` →
`upgrade-explorer` → `verify-post-upgrade` → `report`) and prints the baseline/post-upgrade
comparison at the end. Results are written to `results/*.txt`.

Run `task destroy` to delete the kind cluster and clean up captured results.

## Customize

- `CLUSTER_NAME`, `NAMESPACE`, `DEPLOYMENT` — override the default kind cluster/namespace/solo
  deployment names.
- `MIRROR_PROBE_PATH` — the API path probed through the explorer's proxy (defaults to
  `/api/v1/accounts?limit=1`).
- `CURL_MAX_TIME` — seconds before the verification `curl` gives up (default `10`).

# Prometheus Stack With Pre-existing CRDs

Reproduces [issue #6201](https://github.com/hiero-ledger/solo/issues/6201): `cluster-ref config setup --prometheus-stack true` fails with `conflict occurred while applying object ... CustomResourceDefinition`
when the `monitoring.coreos.com` CRDs are already owned by another field manager (e.g. ArgoCD).

## What It Does

* Creates a kind cluster.
* Server-side applies the kube-prometheus-stack CRDs as field manager `argocd-controller`.
* Runs `solo cluster-ref config setup --prometheus-stack true`. Solo now detects the existing CRDs and installs
  the chart with `--skip-crds`.
* Verifies the release is deployed and the pre-existing CRDs were left untouched.

## Run

```bash
task -d examples/prometheus-existing-crds
```

Before the fix, the `setup` step fails with the Helm CRD conflict.

## Access Hedera Network Services

> **⚠️ Warning**
> This document is out of date for the current release.  See [Step-by-step Guide](./StepByStepGuide.md) for the updated base commands to run that can be augmented with the extra flags and values provided in this guide. Hedera services and Platform SDK have moved to hiero-consensus-node repo <https://github.com/hiero-ledger/hiero-consensus-node>

Once the nodes are up, you may now expose various services (using `k9s` (shift-f) or `kubectl port-forward`) and access. Below are most used services that you may expose.

* Node services: `network-<node ID>-svc`
* HAProxy: `haproxy-<node ID>-svc`
  ```bash
  # enable portforwarding for haproxy
  # node1 grpc port accessed by localhost:50211
  kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 &
  # node2 grpc port accessed by localhost:51211
  kubectl port-forward svc/haproxy-node2-svc -n "${SOLO_NAMESPACE}" 51211:50211 &
  # node3 grpc port accessed by localhost:52211
  kubectl port-forward svc/haproxy-node3-svc -n "${SOLO_NAMESPACE}" 52211:50211 &
  ```
* Envoy Proxy: `envoy-proxy-<node ID>-svc`
  ```bash
  # enable portforwarding for envoy proxy
  kubectl port-forward svc/envoy-proxy-node1-svc -n "${SOLO_NAMESPACE}" 8181:8080 &
  kubectl port-forward svc/envoy-proxy-node2-svc -n "${SOLO_NAMESPACE}" 8281:8080 &
  kubectl port-forward svc/envoy-proxy-node3-svc -n "${SOLO_NAMESPACE}" 8381:8080 &
  ```
* Hedera explorer: `solo-deployment-hedera-explorer`
  ```bash
  #enable portforwarding for hedera explorer, can be access at http://localhost:8080/
  kubectl port-forward svc/hedera-explorer -n "${SOLO_NAMESPACE}" 8080:80 &
  ```
* JSON Rpc Relays

You can deploy JSON RPC relays for one or more nodes as below:

```bash
# deploy relay node first
solo relay deploy -i node1

# enable relay for node1
kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 &
```

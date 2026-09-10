// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the `solo-remote-config` ConfigMap that backs a deployment cannot be
 * found and the deployment targets a local kind cluster. solo keeps the authoritative deployment
 * state in that ConfigMap, so its absence means the deployment recorded in the local config no
 * longer has anything backing it in the cluster; the usual causes are a kind cluster that was
 * deleted and recreated, a namespace that was removed with kubectl, or a ConfigMap that was
 * deleted by hand. A local kind cluster holds nothing worth preserving, so the recorded deployment
 * cannot be resumed and the fix is to tear the leftover state down with
 * `solo one-shot single destroy` and deploy again from a clean slate. `solo one-shot single deploy`
 * detects this state up front and offers that teardown itself; every other command reports this
 * error and stops. Deployments on non-kind clusters fail with the generic resource-not-found error
 * instead, since their state may still be recoverable.
 */
export class RemoteConfigMissingOnKindClusterError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(
    public readonly deploymentName: string,
    public readonly namespace: string,
    public readonly context: string,
    cause?: Error,
  ) {
    super(
      {
        message:
          `Remote config not found for deployment '${deploymentName}' in namespace '${namespace}' ` +
          `on kind cluster context '${context}'`,
        code: ErrorCodeRegistry.REMOTE_CONFIG_MISSING_ON_KIND_CLUSTER,
        troubleshootingSteps:
          'Confirm the kind cluster and namespace still exist: kind get clusters && kubectl get namespaces\n' +
          `Inspect the remote config ConfigMap: kubectl get configmap solo-remote-config -n ${namespace}\n` +
          `Tear the leftover state down before deploying again: solo one-shot single destroy --deployment ${deploymentName}`,
      },
      cause,
    );
  }
}

// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown by `network deploy` when the `solo-remote-config` ConfigMap that backs a deployment
 * cannot be found. `network destroy` leaves the namespace and the recorded deployment in place unless it is
 * asked to remove PVCs and secrets as well, so the deployment itself is not gone — only the ConfigMap
 * tracking it. `deployment cluster attach` only (re)creates that ConfigMap when the deployment has no
 * clusters recorded yet; once a cluster-ref is already attached it instead expects the ConfigMap to exist and
 * fails the same way. The only way back to a working state is therefore to delete and recreate the
 * deployment's local config so the cluster-ref attach is treated as new, which recreates the ConfigMap fresh.
 * The consensus keys have to be regenerated alongside it, since a successful `network deploy` removes the
 * cached copies from disk once they are uploaded to cluster secrets.
 */
export class RemoteConfigMissingForDeployError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(
    deploymentName: string,
    namespace: string,
    context: string,
    clusterReferences: string[],
    cause?: Error,
  ) {
    const clusterReferenceArgument: string =
      clusterReferences.length > 0 ? clusterReferences.join(',') : '<cluster-ref>';

    super(
      {
        message: `Remote config not found for deployment '${deploymentName}' in namespace '${namespace}' on cluster context '${context}'`,
        code: ErrorCodeRegistry.REMOTE_CONFIG_MISSING_FOR_DEPLOY,
        troubleshootingSteps:
          `Inspect the remote config ConfigMap: kubectl get configmap solo-remote-config -n ${namespace}\n` +
          'The deployment record still exists locally, but the remote config backing it is gone and cannot be ' +
          'recreated in place. Recreate the local deployment config so cluster attach treats it as new, then ' +
          'reattach the cluster and regenerate the consensus keys:\n' +
          `  solo deployment config delete --deployment ${deploymentName}\n` +
          `  solo deployment config create -d ${deploymentName} -n ${namespace} -q\n` +
          `  solo deployment cluster attach -d ${deploymentName} -c ${clusterReferenceArgument} -q --num-consensus-nodes <N>\n` +
          `  solo keys consensus generate -d ${deploymentName} -q --gossip-keys --tls-keys\n` +
          'Set --num-consensus-nodes to the node count this deployment had before, then re-run network deploy',
      },
      cause,
    );
  }
}

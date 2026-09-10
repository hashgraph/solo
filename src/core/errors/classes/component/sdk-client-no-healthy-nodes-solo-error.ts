// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the Hedera SDK client reports "failed to find a healthy working node", meaning the
 * SDK client's gRPC connections to the consensus network are all marked unhealthy. This refers to the SDK
 * client's network connectivity, not the consensus node's platform status — the consensus node itself is often
 * still ACTIVE. The usual culprits are a broken local port-forward tunnel, an HAProxy issue, or a failure in
 * another component whose deployment performs SDK transactions. It is retryable because re-establishing the
 * connection (for example by recreating the port-forward) often resolves it.
 */
export class SdkClientNoHealthyNodesSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message:
          'The SDK client could not connect to any consensus node gRPC endpoint. ' +
          'This indicates a network connectivity problem between solo and the consensus nodes ' +
          '(for example a broken port-forward tunnel or proxy), not necessarily an unhealthy consensus node — ' +
          'the consensus node itself may still be ACTIVE.',
        code: ErrorCodeRegistry.SDK_CLIENT_NO_HEALTHY_NODES,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the consensus node platform status: solo consensus node states --deployment <deployment> --node-aliases <alias>\n' +
          'Recreate the port-forwards: solo deployment refresh port-forwards\n' +
          'Check the HAProxy pods are running: kubectl get pods -n <namespace> -l app.kubernetes.io/name=haproxy\n' +
          'If the consensus node is ACTIVE, inspect the other components that were being deployed (for example the JSON-RPC relay or mirror node database): kubectl get pods -n <namespace>',
      },
      cause,
    );
  }
}

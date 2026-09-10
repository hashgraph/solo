// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo SDK ping to a network node does not succeed within the allowed retries; the message
 * names the node alias and the number of retries tried. solo pings nodes to confirm they are reachable and
 * responsive before relying on them, and raises this once retries are exhausted. It is retryable because a
 * node that is merely slow to start often responds on a later attempt; a persistent failure points to a
 * node that is down or unreachable.
 */
export class SdkPingFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, maxRetries: number, cause?: Error, lastPlatformStatus?: string) {
    super(
      {
        message:
          `SDK ping to network node ${nodeAlias} failed after ${maxRetries} retries` +
          (lastPlatformStatus ? `; last consensus node platform status: ${lastPlatformStatus}` : ''),
        code: ErrorCodeRegistry.SDK_PING_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Verify the node pod is running: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=${nodeAlias}\n` +
          'Inspect node logs: kubectl logs <node-pod> -n <namespace>\n' +
          'Check port-forward status: solo deployment port-forwards refresh\n' +
          'Restart the node: solo consensus node restart',
      },
      cause,
    );
  }
}

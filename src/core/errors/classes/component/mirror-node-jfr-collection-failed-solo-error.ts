// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/** Thrown when `mirror node collect-jfr` cannot collect the Java Flight Recorder recording from the importer (cause wrapped). */
export class MirrorNodeJfrCollectionFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error collecting Java Flight Recorder recording from mirror node: ${cause.message}`,
        code: ErrorCodeRegistry.MIRROR_NODE_JFR_COLLECTION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect mirror node importer pods: kubectl get pods -A -l app.kubernetes.io/component=importer\n' +
          'Verify the mirror node importer was deployed with Java Flight Recorder enabled\n' +
          'Verify the cluster is reachable: kubectl cluster-info --context <context>',
      },
      cause,
    );
  }
}

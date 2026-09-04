// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the MinIO Operator's cluster-scoped CRDs exist but no Helm release owns them.
 *
 * The CRDs outlive the namespace the operator was installed into, so deleting that namespace leaves them
 * behind. Helm will not adopt resources another release created, so installing over them fails; and
 * treating their presence as "already installed" would be worse — the operator would never run, and the
 * `Tenant` resource created later would sit unreconciled with nothing pointing at the cause.
 */
export class MinioOperatorCrdsOrphanedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(crdNames: string[], context: string) {
    super({
      message: `MinIO Operator CRDs exist in context '${context}' with no Helm release owning them: ${crdNames.join(', ')}`,
      code: ErrorCodeRegistry.MINIO_OPERATOR_CRDS_ORPHANED,
      troubleshootingSteps:
        `Delete the leftover CRDs, then run the setup again: kubectl delete crd ${crdNames.join(' ')}\n` +
        'Deleting these CRDs also deletes any MinIO Tenant resources defined by them\n' +
        'They are usually left behind when the operator namespace was deleted directly rather than through solo cluster-ref config reset',
    });
  }
}

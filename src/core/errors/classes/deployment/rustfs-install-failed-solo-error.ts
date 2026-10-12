// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during `consensus network deploy` with `--storage-type rustfs_only` when the
 * RustFS Helm chart fails to install or its bucket-init Job does not complete; the underlying
 * failure is wrapped in `cause`. RustFS is the in-cluster S3 server the stream uploaders write to
 * and the mirror node importer reads from.
 */
export class RustfsInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `RustFS installation failed: ${cause.message}`,
        code: ErrorCodeRegistry.RUSTFS_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect RustFS pods: kubectl get pods -n <namespace> -l app.kubernetes.io/instance=rustfs\n' +
          'Inspect the bucket-init Job: kubectl logs -n <namespace> -l solo.hedera.com/type=rustfs-bucket-init\n' +
          'Check Helm release status: helm list -n <namespace>',
      },
      cause,
    );
  }
}

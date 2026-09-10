// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot load a consensus node key or certificate from its PEM file; the underlying
 * failure is wrapped in `cause` and the message names the offending file. solo reads the gossip and gRPC
 * TLS PEM files back from disk before using them, so this means the file is missing, truncated, or not
 * valid PEM content — regenerating the keys replaces the corrupt files.
 */
export class NodeKeyLoadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(keyName: string, nodeAlias: string, filePath: string, cause: Error) {
    super(
      {
        message: `Failed to load ${keyName} key for node ${nodeAlias} from '${filePath}': ${cause.message}`,
        code: ErrorCodeRegistry.NODE_KEY_LOAD_FAILED,
        troubleshootingSteps:
          `Verify the file exists and contains valid PEM content: ${filePath}\n` +
          'Regenerate the node keys: solo keys consensus generate --deployment <name> --generate-gossip-keys --generate-tls-keys\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}

// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the remote configuration contains a component whose type solo does
 * not recognise; the message reports the offending `componentType`, the solo version recorded
 * in the remote config alongside the running solo version, and the recorded config schema
 * version alongside the highest schema version the running solo supports. solo dispatches on
 * the component type when reading the remote config's component inventory, and raises this for
 * any value outside the known set. The usual cause is a remote config written by a newer solo
 * than the one running, so it is treated as a cross-version issue the user resolves by aligning
 * solo versions; a hand-edited config can produce the same failure.
 */
export class RemoteConfigUnsupportedComponentError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(
    componentType: string,
    recordedSoloVersion: string,
    runningSoloVersion: string,
    recordedSchemaVersion: number,
    supportedSchemaVersion: number,
  ) {
    super(
      {
        message:
          `Unknown component type '${componentType}' in the remote config. ` +
          `The config was written by Solo ${recordedSoloVersion} (config schema v${recordedSchemaVersion}); ` +
          `the running Solo is ${runningSoloVersion} (supports config schema up to v${supportedSchemaVersion})`,
        code: ErrorCodeRegistry.REMOTE_CONFIG_UNSUPPORTED_COMPONENT,
        troubleshootingSteps:
          `Upgrade this Solo to ${recordedSoloVersion} or newer (npm install -g @hiero-ledger/solo), or rerun the command with the Solo version that wrote the config\n` +
          'If both Solo versions already match, the remote config was likely edited by hand; restore it to its unedited state',
      },
      undefined,
      {componentType, recordedSoloVersion, runningSoloVersion, recordedSchemaVersion, supportedSchemaVersion},
    );
  }
}

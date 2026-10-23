// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a configuration value set in an environment variable or a Solo config file cannot be
 * read as the type its field declares, such as `abc` for a number or `maybe` for a boolean flag.
 */
export class ConfigValueTypeMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  /**
   * @param origin - how the value reached the config system, phrased to open a sentence, for example
   *   {@code "Environment variable SOLO_FF_SKIP_NODE_PING"} or {@code "Config file 'solo-config.yaml'"}.
   * @param configKey - the dotted config key the value was read into.
   * @param value - the rejected value, as written.
   * @param expected - the type the schema declares for the field.
   */
  public constructor(origin: string, configKey: string, value: string, expected: string) {
    super({
      message: `${origin} sets config key '${configKey}' to '${value}', which is not a valid ${expected}`,
      code: ErrorCodeRegistry.CONFIG_VALUE_TYPE_MISMATCH,
      troubleshootingSteps:
        'A boolean accepts true, false, 1 or 0, in any case; a number accepts an integer or decimal literal\n' +
        'Correct or remove that value to fall back to the configured default',
    });
  }
}

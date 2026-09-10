// SPDX-License-Identifier: Apache-2.0

import {type SemanticVersion} from '../business/utils/semantic-version.js';
import {type ConfigManager} from './config-manager.js';
import {type CommandFlag} from '../types/flag-types.js';

export class UpgradeVersionResolver {
  /**
   * @param userSuppliedVersion - the flag value when the user explicitly supplied it, otherwise undefined
   * @param remoteConfigVersion - the component version recorded in remote config (0.0.0 when unknown)
   * @param fallbackDefault - the version.ts default to use when neither of the above is available
   */
  public static resolve(
    userSuppliedVersion: string | undefined,
    remoteConfigVersion: SemanticVersion<string> | undefined | null,
    fallbackDefault: string,
  ): string {
    if (userSuppliedVersion) {
      return userSuppliedVersion;
    }

    if (remoteConfigVersion && !remoteConfigVersion.equals('0.0.0')) {
      return remoteConfigVersion.toString();
    }

    return fallbackDefault;
  }

  /**
   * Convenience wrapper around {@link resolve} that determines whether the version was
   * user-supplied or resolved from as a default flag value
   *
   * @param configManager - used to check whether the user explicitly supplied any of `versionFlags`
   * @param versionFlags - all flags that can carry the version (e.g. relay's version and release-tag aliases)
   * @param flagValue - the resolved flag value, used only when the user supplied one of `versionFlags`
   * @param remoteConfigVersion - the component version recorded in remote config (0.0.0 when unknown)
   * @param fallbackDefault - the version.ts default to use when neither of the above is available
   */
  public static resolveFromFlags(
    configManager: ConfigManager,
    versionFlags: CommandFlag[],
    flagValue: string | undefined,
    remoteConfigVersion: SemanticVersion<string> | undefined | null,
    fallbackDefault: string,
  ): string {
    const wasSuppliedByUser: boolean = versionFlags.some((flag: CommandFlag): boolean =>
      configManager.wasFlagProvidedByUser(flag),
    );

    return this.resolve(wasSuppliedByUser ? flagValue : undefined, remoteConfigVersion, fallbackDefault);
  }
}

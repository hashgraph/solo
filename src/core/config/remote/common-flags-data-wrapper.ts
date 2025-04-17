// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../../../commands/flags.js';
import {type ToObject} from '../../../types/index.js';
import {type ConfigManager} from '../../config-manager.js';
import {type CommandFlag} from '../../../types/flag-types.js';
import {type AnyObject} from '../../../types/aliases.js';
import {select as selectPrompt} from '@inquirer/prompts';
import {type RemoteConfigCommonFlagsStruct} from './interfaces/remote-config-common-flags-struct.js';

export class CommonFlagsDataWrapper implements ToObject<RemoteConfigCommonFlagsStruct> {
  private static readonly COMMON_FLAGS: CommandFlag[] = [
    flags.releaseTag,
    flags.chartDirectory,
    flags.relayReleaseTag,
    flags.soloChartVersion,
    flags.mirrorNodeVersion,
    flags.nodeAliasesUnparsed,
    flags.hederaExplorerVersion,
  ];

  private constructor(
    private readonly configManager: ConfigManager,
    private readonly flags: RemoteConfigCommonFlagsStruct,
  ) {}

  /**
   * Updates the flags or populates them inside the remote config
   */
  public async handleFlags(argv: AnyObject): Promise<void> {
    for (const flag of CommonFlagsDataWrapper.COMMON_FLAGS) {
      await this.handleFlag(flag, argv);
    }
  }

  private async handleFlag(flag: CommandFlag, argv: AnyObject): Promise<void> {
    const detectFlagMismatch = async () => {
      const oldValue = this.flags[flag.constName] as string;
      const newValue = this.configManager.getFlag<string>(flag);

      // if the old value is not present, override it with the new one
      if (!oldValue && newValue) {
        this.flags[flag.constName] = newValue;
        return;
      }

      // if its present but there is a mismatch warn user
      else if (oldValue && oldValue !== newValue) {
        const isQuiet = this.configManager.getFlag<boolean>(flags.quiet);
        const isForced = this.configManager.getFlag<boolean>(flags.force);

        // if the quiet or forced flag is passed don't prompt the user
        if (isQuiet === true || isForced === true) {
          return;
        }

        const answer = await selectPrompt<string>({
          message: 'Value in remote config differs with the one you are passing, choose which you want to use',
          choices: [
            {
              name: `[old value] ${oldValue}`,
              value: oldValue,
            },
            {
              name: `[new value] ${newValue}`,
              value: newValue,
            },
          ],
        });

        // Override if user chooses new the new value, else override and keep the old one
        if (answer === newValue) {
          this.flags[flag.constName] = newValue;
        } else {
          this.configManager.setFlag(flag, oldValue);
          argv[flag.constName] = oldValue;
        }
      }
    };

    // if the flag is set, inspect the value
    if (this.configManager.hasFlag(flag)) {
      await detectFlagMismatch();
    }

    // use remote config value if no user supplied value
    else if (this.flags[flag.constName]) {
      argv[flag.constName] = this.flags[flag.constName];
      this.configManager.setFlag(flag, this.flags[flag.constName]);
    }
  }

  public static async initialize(configManager: ConfigManager, argv: AnyObject): Promise<CommonFlagsDataWrapper> {
    const commonFlagsDataWrapper = new CommonFlagsDataWrapper(configManager, {});
    await commonFlagsDataWrapper.handleFlags(argv);
    return commonFlagsDataWrapper;
  }

  public static fromObject(configManager: ConfigManager, data: RemoteConfigCommonFlagsStruct): CommonFlagsDataWrapper {
    return new CommonFlagsDataWrapper(configManager, data);
  }

  public toObject(): RemoteConfigCommonFlagsStruct {
    return {
      nodeAliasesUnparsed: this.flags.nodeAliasesUnparsed,
      releaseTag: this.flags.releaseTag,
      relayReleaseTag: this.flags.relayReleaseTag,
      hederaExplorerVersion: this.flags.hederaExplorerVersion,
      mirrorNodeVersion: this.flags.mirrorNodeVersion,
    };
  }
}

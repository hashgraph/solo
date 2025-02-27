/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type BaseCommand} from '../../../commands/base.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyObject} from '../../../types/aliases.js';

/**
 * Static class that handles all tasks related to remote config used by other commands.
 */
export class ListrRemoteConfig {
  /**
   * Loads the remote config from the config class and performs component validation.
   *
   * @param command - the BaseCommand object on which an action will be performed
   * @param argv - used to update the last executed command and command history
   */
  public static loadRemoteConfig(command: BaseCommand, argv: {_: string[]} & AnyObject): SoloListrTask<any> {
    return {
      title: 'Load remote config',
      task: async (): Promise<void> => {
        await command.getRemoteConfigManager().loadAndValidate(argv);
      },
    };
  }
}

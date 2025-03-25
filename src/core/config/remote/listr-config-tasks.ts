// SPDX-License-Identifier: Apache-2.0

import {type SoloListrTask} from '../../../types/index.js';
import {type AnyObject} from '../../../types/aliases.js';
import {type RemoteConfigManager} from './remote-config-manager.js';

/**
 * Static class that handles all tasks related to remote config used by other commands.
 */
export class ListrRemoteConfig {
  /**
   * Loads the remote config from the config class and performs component validation.
   *
   * @param remoteConfigManager
   * @param argv - used to update the last executed command and command history
   */
  public static loadRemoteConfig(
    remoteConfigManager: RemoteConfigManager,
    argv: {_: string[]} & AnyObject,
  ): SoloListrTask<any> {
    return {
      title: 'Load remote config',
      task: async (): Promise<void> => {
        await remoteConfigManager.loadAndValidate(argv);
      },
    };
  }
}

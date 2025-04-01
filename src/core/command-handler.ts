// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from './logging/solo-logger.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {Listr} from 'listr2';
import {SoloError} from './errors/solo-error.js';
import {type Lock} from './lock/lock.js';
import * as constants from './constants.js';
import fs from 'node:fs';
import {type ConfigManager} from './config-manager.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type AccountManager} from './account-manager.js';

@injectable()
export class CommandHandler {
  protected readonly _configMaps = new Map<string, any>();

  public constructor(
    @inject(InjectTokens.SoloLogger) public readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  public async commandAction(
    argv: any,
    actionTasks: any,
    options: any,
    errorString: string,
    lease: Lock | null,
  ): Promise<void> {
    const tasks = new Listr([...actionTasks], options);
    try {
      await tasks.run();
    } catch (error: Error | any) {
      throw new SoloError(`${errorString}: ${error.message}`, error);
    } finally {
      const promises = [];
      if (lease) promises.push(lease.release());
      await this.accountManager.close();
      await Promise.all(promises);
    }
  }

  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  public setupHomeDirectory(
    directories: string[] = [
      constants.SOLO_HOME_DIR,
      constants.SOLO_LOGS_DIR,
      constants.SOLO_CACHE_DIR,
      constants.SOLO_VALUES_DIR,
    ],
  ): string[] {
    const self = this;

    try {
      directories.forEach(directoryPath => {
        if (!fs.existsSync(directoryPath)) {
          fs.mkdirSync(directoryPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${directoryPath}`);
      });
    } catch (error: Error | any) {
      throw new SoloError(`failed to create directory: ${error.message}`, error);
    }

    return directories;
  }

  public setupHomeDirectoryTask() {
    return {
      title: 'Setup home directory',
      task: async () => {
        this.setupHomeDirectory();
      },
    };
  }

  public getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }
}

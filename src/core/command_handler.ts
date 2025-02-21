/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {inject, injectable} from 'tsyringe-neo';
import {SoloLogger} from './logging.js';
import {patchInject} from './dependency_injection/container_helper.js';
import {Listr} from 'listr2';
import {SoloError} from './errors.js';
import {type Lease} from './lease/lease.js';
import * as constants from './constants.js';
import fs from 'fs';
import {Task} from './task.js';
import {type CommandFlag} from '../types/flag_types.js';
import {ConfigManager} from './config_manager.js';
import {getConfig} from './config_builder.js';
import {type BaseCommand} from '../commands/base.js';

@injectable()
export class CommandHandler {
  protected readonly _configMaps = new Map<string, any>();

  constructor(
    @inject(SoloLogger) public readonly logger?: SoloLogger,
    @inject(ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
  }

  public commandActionBuilder(
    actionTasks: any,
    options: any,
    errorString: string,
    lease: Lease | null,
  ): (argv: any, handlerObj: CommandHandler) => Promise<void> {
    return async function (argv: any, handlerObj: CommandHandler): Promise<void> {
      const tasks = new Listr([...actionTasks], options);

      try {
        await tasks.run();
      } catch (e: Error | any) {
        handlerObj.logger.error(`${errorString}: ${e.message}`, e);
        throw new SoloError(`${errorString}: ${e.message}`, e);
      } finally {
        const promises = [];

        if (lease) promises.push(lease.release());
        await Promise.all(promises);
      }
    };
  }

  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  public setupHomeDirectory(
    dirs: string[] = [
      constants.SOLO_HOME_DIR,
      constants.SOLO_LOGS_DIR,
      constants.SOLO_CACHE_DIR,
      constants.SOLO_VALUES_DIR,
    ],
  ): string[] {
    const self = this;

    try {
      dirs.forEach(dirPath => {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${dirPath}`);
      });
    } catch (e: Error | any) {
      self.logger.error(e);
      throw new SoloError(`failed to create directory: ${e.message}`, e);
    }

    return dirs;
  }

  public setupHomeDirectoryTask(): Task {
    return new Task('Setup home directory', async () => {
      this.setupHomeDirectory();
    });
  }

  // Config related methods:
  public getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    return getConfig(this.configManager, this._configMaps, configName, flags, extraProperties);
  }

  public getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }
}

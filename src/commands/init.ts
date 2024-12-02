/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {Listr} from 'listr2';
import path from 'path';
import {BaseCommand} from './base.js';
import * as core from '../core/index.js';
import {constants} from '../core/index.js';
import * as fs from 'fs';
import {SoloError} from '../core/errors.js';
import * as flags from './flags.js';
import chalk from 'chalk';

/**
 * Defines the core functionalities of 'init' command
 */
export class InitCommand extends BaseCommand {
  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  setupHomeDirectory(
    dirs: string[] = [
      constants.SOLO_HOME_DIR,
      constants.SOLO_LOGS_DIR,
      constants.SOLO_CACHE_DIR,
      constants.SOLO_VALUES_DIR,
    ],
  ) {
    const self = this;

    try {
      dirs.forEach(dirPath => {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${dirPath}`);
      });
    } catch (e: Error | any) {
      this.logger.error(e);
      throw new SoloError(`failed to create directory: ${e.message}`, e);
    }

    return dirs;
  }

  /** Executes the init CLI command */
  async init(argv: any) {
    const self = this;
    let cacheDir: string = this.configManager.getFlag<string>(flags.cacheDir) as string;
    if (!cacheDir) {
      cacheDir = constants.SOLO_CACHE_DIR as string;
    }

    interface Context {
      repoURLs: string[];
      dirs: string[];
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Setup home directory and cache',
          task: ctx => {
            self.configManager.update(argv);
            ctx.dirs = this.setupHomeDirectory();
          },
        },
        {
          title: 'Check dependencies',
          task: (_, task) => {
            const deps = [core.constants.HELM];

            const subTasks = self.depManager.taskCheckDependencies<Context>(deps);

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Setup chart manager',
          task: async ctx => {
            ctx.repoURLs = await this.chartManager.setup();
          },
        },
        {
          title: `Copy templates in '${cacheDir}'`,
          task: ctx => {
            const resources = ['templates', 'profiles'];
            for (const dirName of resources) {
              const srcDir = path.resolve(path.join(constants.RESOURCES_DIR, dirName));
              if (!fs.existsSync(srcDir)) continue;

              const destDir = path.resolve(path.join(cacheDir, dirName));
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, {recursive: true});
              }

              fs.cpSync(srcDir, destDir, {recursive: true});
            }

            if (argv.dev) {
              self.logger.showList('Home Directories', ctx.dirs);
              self.logger.showList('Chart Repository', ctx.repoURLs);
            }

            self.logger.showUser(
              chalk.grey('\n***************************************************************************************'),
            );
            self.logger.showUser(
              chalk.grey(
                `Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR}\n` +
                  "If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.",
              ),
            );
            self.logger.showUser(
              chalk.grey('***************************************************************************************'),
            );
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e: Error | any) {
      throw new SoloError('Error running init', e);
    }

    return true;
  }

  /**
   * Return Yargs command definition for 'init' command
   * @returns A object representing the Yargs command definition
   */
  getCommandDefinition() {
    const self = this;
    return {
      command: 'init',
      desc: 'Initialize local environment',
      builder: (y: any) => {
        flags.setCommandFlags(y, flags.cacheDir);
      },
      handler: (argv: any) => {
        self
          .init(argv)
          .then(r => {
            if (!r) process.exit(1);
          })
          .catch(err => {
            self.logger.showUserError(err);
            process.exit(1);
          });
      },
    };
  }
}

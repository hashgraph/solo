// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import path from 'path';
import {BaseCommand} from './base.js';
import fs from 'fs';
import * as constants from '../core/constants.js';
import {SoloError} from '../core/errors.js';
import {Flags as flags} from './flags.js';
import chalk from 'chalk';

/**
 * Defines the core functionalities of 'init' command
 */
export class InitCommand extends BaseCommand {
  public static readonly COMMAND_NAME = 'init';

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
            const deps = [constants.HELM];

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
      command: InitCommand.COMMAND_NAME,
      desc: 'Initialize local environment',
      builder: (y: any) => {
        flags.setCommandFlags(y, flags.cacheDir);
      },
      handler: async (argv: any) => {
        await self
          .init(argv)
          .then(r => {
            if (!r) throw new SoloError('Error running init, expected return value to be true');
          })
          .catch(err => {
            self.logger.showUserError(err);
            throw new SoloError('Error running init', err);
          });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}

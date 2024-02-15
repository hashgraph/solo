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
import { Listr } from 'listr2'
import path from 'path'
import { BaseCommand } from './base.mjs'
import * as core from '../core/index.mjs'
import { constants } from '../core/index.mjs'
import * as fs from 'fs'
import { FullstackTestingError } from '../core/errors.mjs'
import * as flags from './flags.mjs'
import chalk from 'chalk'

/**
 * Defines the core functionalities of 'init' command
 */
export class InitCommand extends BaseCommand {
  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  setupHomeDirectory (dirs = [
    constants.SOLO_HOME_DIR,
    constants.SOLO_LOGS_DIR,
    constants.SOLO_CACHE_DIR
  ]) {
    const self = this

    try {
      dirs.forEach(dirPath => {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath)
        }
        self.logger.debug(`OK: setup directory: ${dirPath}`)
      })
    } catch (e) {
      this.logger.error(e)
      throw new FullstackTestingError(e.message, e)
    }

    return dirs
  }

  /**
   * Executes the init CLI command
   * @returns {Promise<boolean>}
   */
  async init (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Setup home directory and cache',
        task: async (ctx, _) => {
          ctx.dirs = this.setupHomeDirectory()
        }
      },
      {
        title: 'Check dependencies',
        task: async (_, task) => {
          const deps = [
            core.constants.HELM
          ]

          const subTasks = self.depManager.taskCheckDependencies(deps)

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false
            }
          })
        }
      },
      {
        title: 'Setup chart manager',
        task: async (ctx, _) => {
          ctx.repoURLs = await this.chartManager.setup()
        }
      },
      {
        title: 'Copy configuration file templates',
        task: (ctx, _) => {
          let cacheDir = this.configManager.getFlag(flags.cacheDir)
          if (!cacheDir) {
            cacheDir = constants.SOLO_CACHE_DIR
          }

          const templatesDir = `${cacheDir}/templates`
          if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir)
          }

          const configFiles = [
            `${constants.RESOURCES_DIR}/templates/application.properties`,
            `${constants.RESOURCES_DIR}/templates/api-permission.properties`,
            `${constants.RESOURCES_DIR}/templates/bootstrap.properties`,
            `${constants.RESOURCES_DIR}/templates/settings.txt`,
            `${constants.RESOURCES_DIR}/templates/log4j2.xml`
          ]

          for (const filePath of configFiles) {
            const fileName = path.basename(filePath)
            fs.cpSync(`${filePath}`, `${templatesDir}/${fileName}`, { recursive: true })
          }

          if (argv.dev) {
            self.logger.showList('Home Directories', ctx.dirs)
            self.logger.showList('Chart Repository', ctx.repoURLs)
          }

          self.logger.showUser(chalk.grey('\n***************************************************************************************'))
          self.logger.showUser(chalk.grey(`Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR}\n` +
            'If a full reset is needed, delete the directory or relevant sub-directories before running \'solo init\'.'))
          self.logger.showUser(chalk.grey('***************************************************************************************'))
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError('Error running init', e)
    }

    return true
  }

  /**
   * Return Yargs command definition for 'init' command
   * @param initCmd an instance of InitCommand
   */
  static getCommandDefinition (initCmd) {
    return {
      command: 'init',
      desc: 'Initialize local environment and default flags',
      builder: y => {
        flags.setCommandFlags(y,
          flags.releaseTag,
          flags.nodeIDs,
          flags.namespace,
          flags.clusterSetupNamespace,
          flags.cacheDir,
          flags.chartDirectory,
          flags.keyFormat,
          )
      },
      handler: (argv) => {
        initCmd.init(argv).then(r => {
          if (!r) process.exit(1)
        }).catch(err => {
          initCmd.logger.showUserError(err)
          process.exit(1)
        })
      }
    }
  }
}

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
'use strict'
import { BaseCommand } from './base.mjs'
import { FullstackTestingError, IllegalArgumentError } from '../core/errors.mjs'
import { flags } from './index.mjs'
import { Listr } from 'listr2'
import * as prompts from './prompts.mjs'
import { constants } from '../core/index.mjs'
import { USER_ROLE } from '../core/constants.mjs'

export class RolesCommand extends BaseCommand {
  /**
   * @returns {string}
   */
  static get DEPLOY_CONFIGS_NAME () {
    return 'deployConfigs'
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get DEPLOY_FLAGS_LIST () {
    return [
      flags.namespace,
      flags.clusterRoleUsername,
      flags.clusterRolePassword
    ]
  }

  async register (argv) {
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          await prompts.execute(task, this.configManager, [
            flags.namespace,
            flags.clusterRoleUsername,
            flags.clusterRolePassword
          ])

          const config = {
            namespace: this.configManager.getFlag(flags.namespace),
            clusterRoleUsername: this.configManager.getFlag(flags.clusterRoleUsername),
            clusterRolePassword: this.configManager.getFlag(flags.clusterRolePassword)
          }

          ctx.config = /** @type {MirrorNodeDeployConfigClass} **/ this.getConfig(
            RolesCommand.DEPLOY_CONFIGS_NAME, RolesCommand.DEPLOY_FLAGS_LIST)

          if (!(await this.k8.hasNamespace(ctx.config.namespace))) {
            throw new FullstackTestingError(`Namespace ${config.namespace} does not exist`)
          }
        }
      },
      {
        title: 'Ensure cluster role exists',
        task: async () => {
          const clusterRoleExists = await this.k8.getClusterRole(USER_ROLE)
          if (clusterRoleExists) {
            return this.logger.info(`ClusterRole ${USER_ROLE} already exists.`)
          }

          await this.k8.createClusterRole(USER_ROLE)
        }
      },
      {
        title: 'Create User',
        task: async (ctx) => {
          const data = {
            username: Buffer.from(ctx.config.clusterRoleUsername).toString('base64'),
            password: Buffer.from(ctx.config.clusterRolePassword).toString('base64')
          }

          const labels = {
            [`${ctx.config.clusterRoleUsername}-credentials`]: `${ctx.config.clusterRoleUsername}-credentials`
          }

          await this.k8.createSecret(`${ctx.config.clusterRoleUsername}-credentials`, ctx.config.namespace,
            'Opaque', data, labels, true)
        }
      },
      {
        title: 'Bind Role to User',
        task: async (ctx) => {
          await this.k8.createClusterRoleBinding(USER_ROLE, ctx.config.clusterRoleUsername)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error in adding role: ${e.message}`, e)
    }

    return true
  }

  async login (argv) {
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          await prompts.execute(task, this.configManager, [
            flags.namespace,
            flags.clusterRoleUsername,
            flags.clusterRolePassword
          ])

          const config = {
            namespace: this.configManager.getFlag(flags.namespace),
            clusterRoleUsername: this.configManager.getFlag(flags.clusterRoleUsername),
            clusterRolePassword: this.configManager.getFlag(flags.clusterRolePassword)
          }

          ctx.config = /** @type {MirrorNodeDeployConfigClass} **/ this.getConfig(
            RolesCommand.DEPLOY_CONFIGS_NAME, RolesCommand.DEPLOY_FLAGS_LIST)

          if (!(await this.k8.hasNamespace(ctx.config.namespace))) {
            throw new FullstackTestingError(`Namespace ${config.namespace} does not exist`)
          }
        }
      },
      {
        title: 'Retrieve User Credentials',
        task: async (ctx) => {
          console.log(`${ctx.config.clusterRoleUsername}-credentials`)

          const secret = await this.k8.getSecret(ctx.config.namespace, `${ctx.config.clusterRoleUsername}-credentials`)

          if (!secret || !secret.data) {
            throw new FullstackTestingError(`No credentials found for user ${ctx.config.clusterRoleUsername}.`)
          }

          ctx.credentials = {
            username: Buffer.from(secret.data.username, 'base64').toString('utf8'),
            password: Buffer.from(secret.data.password, 'base64').toString('utf8')
          }
        }
      },
      {
        title: 'Validate Login',
        task: async (ctx) => {
          if (ctx.credentials.username !== ctx.config.clusterRoleUsername || ctx.credentials.password !== ctx.config.clusterRolePassword) {
            throw new FullstackTestingError('Invalid username or password.')
          }
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error during login: ${e.message}`, e)
    }

    return true
  }

  async delete (argv) {
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          await prompts.execute(task, this.configManager, [
            flags.namespace,
            flags.clusterRoleUsername
          ])

          const config = {
            namespace: this.configManager.getFlag(flags.namespace),
            clusterRoleUsername: this.configManager.getFlag(flags.clusterRoleUsername)
          }

          ctx.config = /** @type {MirrorNodeDeployConfigClass} **/ this.getConfig(
            RolesCommand.DEPLOY_CONFIGS_NAME, RolesCommand.DEPLOY_FLAGS_LIST)

          if (!(await this.k8.hasNamespace(ctx.config.namespace))) {
            throw new FullstackTestingError(`Namespace ${config.namespace} does not exist`)
          }
        }
      },
      {
        title: 'Delete User Secret',
        task: async (ctx) => {
          try {
            await this.k8.deleteSecret(`${ctx.config.clusterRoleUsername}-credentials`, ctx.config.namespace)
          } catch (e) {
            throw new FullstackTestingError(`Failed to delete secret ${e.message}`, e)
          }
        }
      },
      {
        title: 'Remove Cluster Role Binding',
        task: async (ctx) => {
          await this.k8.deleteClusterRoleBinding(`${ctx.config.clusterRoleUsername}-rolebinding`)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error during deletion: ${e.message}`, e)
    }

    return true
  }

  /**
   * @param {RolesCommand} accountCmd
   * @returns {{command: string, desc: string, builder: Function}}
   */
  static getCommandDefinition (accountCmd) {
    if (!accountCmd || !(accountCmd instanceof RolesCommand)) {
      throw new IllegalArgumentError('An instance of AccountCommand is required', accountCmd)
    }
    return {
      command: 'role',
      desc: 'Manage cluster roles in solo',
      builder: yargs => {
        return yargs
          .command({
            command: 'register',
            desc: 'Register new user',
            builder: y => flags.setCommandFlags(y,
              flags.namespace
            ),
            handler: argv => {
              accountCmd.logger.debug('==== Running \'role register\' ===')
              accountCmd.logger.debug(argv)

              accountCmd.register(argv)
                .then(r => {
                  accountCmd.logger.debug('==== Finished running \'role register\' ===')
                  if (!r) process.exit(1)
                })
                .catch(err => {
                  accountCmd.logger.showUserError(err)
                  process.exit(1)
                })
            }
          })
          .command({
            command: 'login',
            desc: 'Login existing user',
            builder: y => flags.setCommandFlags(y,
              flags.namespace
            ),
            handler: argv => {
              accountCmd.logger.debug('==== Running \'role login\' ===')
              accountCmd.logger.debug(argv)

              accountCmd.login(argv)
                .then(r => {
                  accountCmd.logger.debug('==== Finished running \'role login\' ===')
                  if (!r) process.exit(1)
                })
                .catch(err => {
                  accountCmd.logger.showUserError(err)
                  process.exit(1)
                })
            }
          })
          .command({
            command: 'delete',
            desc: 'Login existing user',
            builder: y => flags.setCommandFlags(y,
              flags.namespace
            ),
            handler: argv => {
              accountCmd.logger.debug('==== Running \'role delete\' ===')
              accountCmd.logger.debug(argv)

              accountCmd.delete(argv)
                .then(r => {
                  accountCmd.logger.debug('==== Finished running \'role delete\' ===')
                  if (!r) process.exit(1)
                })
                .catch(err => {
                  accountCmd.logger.showUserError(err)
                  process.exit(1)
                })
            }
          })
      }
    }
  }
}

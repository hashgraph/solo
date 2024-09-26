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
import * as k8s from '@kubernetes/client-node'

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

  /**
   * Check if ClusterRole exists, and if not, create it
   * @param {string} roleName - The name of the ClusterRole to create
   * @returns {Promise<void>}
   */
  async ensureClusterRole (roleName) {
    try {
      const clusterRoleExists = await this.k8.getClusterRole(roleName)

      if (clusterRoleExists) {
        return this.logger.info(`ClusterRole ${roleName} already exists.`)
      }

      const clusterRoleBody = new k8s.V1ClusterRole()
      clusterRoleBody.apiVersion = 'rbac.authorization.k8s.io/v1'
      clusterRoleBody.kind = 'ClusterRole'
      clusterRoleBody.metadata = { name: roleName }
      clusterRoleBody.rules = [{
        apiGroups: [''],
        resources: ['pods'],
        verbs: ['get', 'list', 'watch', 'create', 'delete']
      }]

      await this.k8.createClusterRole(clusterRoleBody)

      this.logger.info(`ClusterRole ${roleName} created.`)
    } catch (e) {
      throw new FullstackTestingError(`Error ensuring ClusterRole: ${e.message}`, e)
    }
  }

  /**
   * Create a user by adding a secret with username and password
   * @param {string} username
   * @param {string} password
   * @param {string} namespace - The namespace to create the secret in
   * @returns {Promise<void>}
   */
  async createUserSecret (username, password, namespace) {
    const data = {
      username: Buffer.from(username).toString('base64'),
      password: Buffer.from(password).toString('base64')
    }

    try {
      await this.k8.createSecret(`${username}-credentials`, namespace, 'Opaque', data, {}, true)
      this.logger.info(`User ${username} created in namespace ${namespace}`)
    } catch (e) {
      throw new FullstackTestingError(`Error creating user: ${e.message}`, e)
    }
  }

  /**
   * Bind a ClusterRole to the user (using RoleBinding)
   * @param {string} roleName - The ClusterRole name
   * @param {string} username - The username
   * @returns {Promise<void>}
   */
  async bindRoleToUser (roleName, username) {
    const clusterRoleBinding = new k8s.V1ClusterRoleBinding()
    clusterRoleBinding.apiVersion = 'rbac.authorization.k8s.io/v1'
    clusterRoleBinding.kind = 'ClusterRoleBinding'
    clusterRoleBinding.metadata = new k8s.V1ObjectMeta()
    clusterRoleBinding.metadata.name = `${username}-rolebinding`

    clusterRoleBinding.subjects = [{
      kind: 'User',
      name: username,
      apiGroup: 'rbac.authorization.k8s.io'
    }]

    clusterRoleBinding.roleRef = {
      kind: 'ClusterRole',
      name: roleName,
      apiGroup: 'rbac.authorization.k8s.io'
    }

    try {
      await this.k8.createClusterRoleBinding(clusterRoleBinding)
      this.logger.info(`Bound ClusterRole ${roleName} to user ${username}`)
    } catch (e) {
      throw new FullstackTestingError(`Error binding role to user: ${e.message}`, e)
    }
  }

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async add (argv) {
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
            namespace: this.configManager.getFlag(flags.namespace)
          }

          ctx.config = /** @type {MirrorNodeDeployConfigClass} **/ this.getConfig(
            RolesCommand.DEPLOY_CONFIGS_NAME, RolesCommand.DEPLOY_FLAGS_LIST)

          if (!(await this.k8.hasNamespace(ctx.config.namespace))) {
            throw new FullstackTestingError(`Namespace ${config.namespace} does not exist`)
          }

          this.logger.debug('Initialized config', { config })
        }
      },
      {
        title: 'Ensure ClusterRole',
        task: async () => {
          await this.ensureClusterRole('solo-user-role')
        }
      },
      {
        title: 'Create User',
        task: async (ctx) => {
          await this.createUserSecret('new-user', 'new-password', ctx.config.namespace)
        }
      },
      {
        title: 'Bind Role to User',
        task: async () => {
          await this.bindRoleToUser('solo-user-role', 'new-user')
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
            command: 'add',
            desc: 'Add new user',
            builder: y => flags.setCommandFlags(y,
              flags.namespace
            ),
            handler: argv => {
              accountCmd.logger.debug('==== Running \'role add\' ===')
              accountCmd.logger.debug(argv)

              accountCmd.add(argv)
                .then(r => {
                  accountCmd.logger.debug('==== Finished running \'role add\' ===')
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

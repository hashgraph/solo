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
import { FullstackTestingError, MissingArgumentError } from './errors.mjs'
import { flags } from '../commands/index.mjs'

/**
 * Handles interacting with the kubernetes lease
 */
export class LeaseManager {
  /**
   * @param {Logger} logger
   * @param {K8} k8
   * @param {ConfigManager} configManager
   */
  constructor (logger, k8, configManager) {
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')
    if (!logger) throw new MissingArgumentError('an instance of core/Logger is required')
    if (!configManager) throw new MissingArgumentError('an instance of core/ConfigManager is required')

    this.k8 = k8
    this.logger = logger
    this.configManager = configManager
  }

  /**
   * @returns {Promise<{releaseLease: (function: Promise<void>)}>}
   */
  async acquireLease () {
    const namespace = this._getNamespace()
    const username = this._getUsername()
    const leaseName = `${username}-lease`

    try {
      await this.k8.readNamespacedLease(leaseName, namespace)
    } catch (error) {
      if (!(error.message.includes('404'))) {
        throw new FullstackTestingError(`Failed to acquire lease: ${error.message}`)
      }

      await this.k8.createNamespacedLease(namespace, leaseName, username)
    }

    /** @returns {Promise<void>} */
    const renewLease = async () => {
      try {
        const lease = await this.k8.readNamespacedLease(leaseName, namespace)
        await this.k8.renewNamespaceLease(leaseName, namespace, lease)
      } catch (error) {
        throw new FullstackTestingError(`Failed to renew lease: ${error.message}`, error)
      }
    }

    const intervalId = setInterval(renewLease, 10_000)

    /** @returns {Promise<void>} */
    const releaseLease = async () => {
      clearInterval(intervalId)
      this.k8.deleteNamespacedLease(leaseName, namespace)
        .then(() => this.logger.info(`Lease released by ${username}`))
        .catch(e => this.logger.error(`Failed to release lease: ${e.message}`))
    }

    return { releaseLease }
  }

  /**
   * @returns {string}
   * @private
   */
  _getNamespace () {
    const ns = this.configManager.getFlag(flags.namespace)
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }

  /**
   * @returns {string}
   * @private
   */
  _getUsername () {
    const username = this.configManager.getFlag(flags.clusterRoleUsername)
    if (!username) throw new MissingArgumentError('clusterRoleUsername is not set')
    return username
  }
}

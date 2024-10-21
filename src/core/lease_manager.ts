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
import { MissingArgumentError, SoloError } from './errors.ts'
import { flags } from '../commands/index.ts'
import type { ConfigManager } from './config_manager.ts'
import type { K8 } from './k8.ts'
import type { SoloLogger } from './logging.ts'
import { LEASE_RENEW_TIMEOUT, LEASE_TAKEN_TIMEOUT, MAX_LEASE_ACQUIRE_RETRIES, OS_USERNAME } from './constants.ts'

export class LeaseManager {
  constructor (
    private readonly k8: K8,
    private readonly logger: SoloLogger,
    private readonly configManager: ConfigManager
  ) {
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')
    if (!logger) throw new MissingArgumentError('an instance of core/SoloLogger is required')
    if (!configManager) throw new MissingArgumentError('an instance of core/ConfigManager is required')
  }

  /**
   * Acquires lease if is not already taken, automatically handles renews.
   *
   * @returns a callback function that releases the lease
   */
  async acquireLease (): Promise<{ releaseLease: () => Promise<void> }> {
    const namespace = await this.getNamespace()

    //? In case namespace isn't yet created return an empty callback function
    if (!namespace) {
      return { releaseLease: async () => {} }
    }

    const username = OS_USERNAME
    const leaseName = `${username}-lease`

    await this.acquireLeaseOrRetry(username, leaseName, namespace)

    //? Renew lease with the callback
    const intervalId = setInterval(this.renewLeaseCallback, LEASE_RENEW_TIMEOUT, leaseName, namespace)

    const releaseLeaseCallback = async () => {
      //? Stop renewing the lease once release callback is called
      clearInterval(intervalId)

      try {
        await this.k8.deleteNamespacedLease(leaseName, namespace)

        this.logger.info(`Lease released by ${username}`)
      } catch (e: Error | any) {
        this.logger.error(`Failed to release lease: ${e.message}`)
      }
    }

    return { releaseLease: releaseLeaseCallback }
  }

  private async renewLeaseCallback (leaseName: string, namespace: string) {
    try {
      //? Get the latest most up-to-date lease to renew it
      const lease = await this.k8.readNamespacedLease(leaseName, namespace)

      await this.k8.renewNamespaceLease(leaseName, namespace, lease)
    } catch (error) {
      throw new SoloError(`Failed to renew lease: ${error.message}`, error)
    }
  }

  private async acquireLeaseOrRetry (username: string, leaseName: string, namespace: string, retries = 0): Promise<void> {
    try {
      await this.k8.readNamespacedLease(leaseName, namespace)
    } catch (error) {
      //? In case the lease is already acquired retry after cooldown
      if (error.meta.statusCode === 403) {
        this.logger.info(`Lease is already taken retrying in ${LEASE_TAKEN_TIMEOUT}`)
        retries++

        if (retries === MAX_LEASE_ACQUIRE_RETRIES) {
          throw new SoloError(`Failed to acquire lease, max retries reached ${retries}`)
        }

        return this.acquireLeaseOrRetry(username, leaseName, namespace, retries)
      }

      if (error.meta.statusCode !== 404) {
        throw new SoloError(`Failed to acquire lease: ${error.message}`)
      }

      await this.k8.createNamespacedLease(namespace, leaseName, username)
    }
  }

  private async getNamespace () {
    const namespace = this.configManager.getFlag<string>(flags.namespace)
    if (!namespace) return null

    if (!await this.k8.hasNamespace(namespace)) return null
    return namespace
  }
}

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
import { LEASE_RENEW_TIMEOUT, LEASE_ACQUIRE_RETRY_TIMEOUT, MAX_LEASE_ACQUIRE_ATTEMPTS, OS_USERNAME } from './constants.ts'
import type { ListrTaskWrapper } from 'listr2'
import chalk from 'chalk'
import { sleep } from './helpers.ts'
import { LeaseWrapper } from './lease_wrapper.ts'
import type { V1Lease } from '@kubernetes/client-node'

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

  instantiateLease () {
    return new LeaseWrapper(this)
  }

  /**
   * Acquires lease if is not already taken, automatically handles renews.
   *
   * @returns a callback function that releases the lease
   */
  async acquireLease (
      task: ListrTaskWrapper<any, any, any>,
      title: string,
      attempt: number | null = null
  ): Promise<{ releaseLease: () => Promise<void> }> {
    const namespace = await this.getNamespace()

    //? In case namespace isn't yet created return an empty callback function
    if (!namespace) {
      task.title = `${title} - ${chalk.gray('namespace not created, skipping lease acquire')}`

      return { releaseLease: async () => {} }
    }

    const username = OS_USERNAME
    const leaseName = `${username}-lease`

    await this.acquireLeaseOrRetry(username, leaseName, namespace, task, title, attempt)

    const renewLeaseCallback = async () => {
      try {
        //? Get the latest most up-to-date lease to renew it
        const lease = await this.k8.readNamespacedLease(leaseName, namespace)

        await this.k8.renewNamespaceLease(leaseName, namespace, lease)
      } catch (error) {
        throw new SoloError(`Failed to renew lease: ${error.message}`, error)
      }
    }

    //? Renew lease with the callback
    const intervalId = setInterval(renewLeaseCallback, LEASE_RENEW_TIMEOUT)

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

  private async tryAcquireLease (username: string,
                                 leaseName: string,
                                  namespace: string,
                                 task: ListrTaskWrapper<any, any, any>,
                                 title: string): Promise<V1Lease> {
    try {
       return await this.k8.readNamespacedLease(leaseName, namespace)
    } catch (error) {
      if (error.meta.statusCode !== 404) {
        task.title = `${title} - ${chalk.red(`failed to acquire lease, unexpected server response ${error.meta.statusCode}!`)}`
      }
      return Promise.resolve(null)
    }
  }

  private async acquireLeaseOrRetry (
    username: string,
    leaseName: string,
    namespace: string,
    task: ListrTaskWrapper<any, any, any>,
    title: string,
    attempt = 1,
    maxAttempts = MAX_LEASE_ACQUIRE_ATTEMPTS,
  ): Promise<void> {
    if (!attempt) attempt = 1

    const lease = await this.tryAcquireLease(username, leaseName, namespace, task, title)

    //? In case the lease is already acquired retry after cooldown
    while (!!lease && !this.isLeaseExpired(lease)) {
      attempt++

      if (attempt === maxAttempts) {
        task.title = `${title} - ${chalk.red('failed to acquire lease, max attempts reached!')}` +
          `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`

        throw new SoloError(`Failed to acquire lease, max attempt reached ${attempt}`)
      }

      this.logger.info(`Lease is already taken retrying in ${LEASE_ACQUIRE_RETRY_TIMEOUT}`)

      task.title = `${title} - ${chalk.gray(`lease exists, attempting again in ${LEASE_ACQUIRE_RETRY_TIMEOUT} seconds`)}` +
        `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`

      await sleep(LEASE_ACQUIRE_RETRY_TIMEOUT)
    }

    if (lease) {
      await this.k8.deleteNamespacedLease(leaseName, namespace)
    }

    await this.k8.createNamespacedLease(namespace, leaseName, username)

    task.title = `${title} - ${chalk.green('lease acquired successfully')}` +
      `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`
  }

  private async getNamespace () {
    const namespace = this.configManager.getFlag<string>(flags.namespace)
    if (!namespace) return null

    if (!await this.k8.hasNamespace(namespace)) return null
    return namespace
  }

  private isLeaseExpired (lease: V1Lease) : boolean {
    const now = Date.now()
    const duration = lease.spec?.leaseDurationSeconds ? lease.spec?.leaseDurationSeconds : 20
    let acquired = lease.spec?.acquireTime

    if (lease.spec.renewTime) {
      acquired = lease.spec?.renewTime
    }

    const deltaSec = (now - new Date(acquired).valueOf()) / 1000

    return deltaSec > duration
  }
}

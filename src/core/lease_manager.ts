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
import * as constants from './constants.ts'
import { SECONDS } from './constants.ts'

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
  async acquireLease () {
    const self = this

    const namespace = self._getNamespace()
    if (!namespace) return {}

    const username = constants.OS_USERNAME
    const leaseName = `${username}-lease`

    try {
      await self.k8.readNamespacedLease(leaseName, namespace)
    } catch (error) {
      if (!(error.message.includes('404'))) {
        throw new SoloError(`Failed to acquire lease: ${error.message}`)
      }

      await self.k8.createNamespacedLease(namespace, leaseName, username)
    }

    const renewLease = async () => {
      try {
        const lease = await self.k8.readNamespacedLease(leaseName, namespace)
        await self.k8.renewNamespaceLease(leaseName, namespace, lease)
      } catch (error) {
        throw new SoloError(`Failed to renew lease: ${error.message}`, error)
      }
    }

    const intervalId = setInterval(renewLease, 10 * SECONDS)

    return {
      releaseLease: async () => {
        clearInterval(intervalId)
        self.k8.deleteNamespacedLease(leaseName, namespace)
          .then(() => self.logger.info(`Lease released by ${username}`))
          .catch(e => self.logger.error(`Failed to release lease: ${e.message}`))
      }
    }
  }

  private _getNamespace () {
    return this.configManager.getFlag<string>(flags.namespace)
  }
}

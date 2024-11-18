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
import { MissingArgumentError } from '../errors.ts'
import { flags } from '../../commands/index.ts'
import type { ConfigManager } from '../config_manager.ts'
import type { K8 } from '../k8.ts'
import type { SoloLogger } from '../logging.ts'
import { type LeaseRenewalService } from './lease_renewal.ts'
import { Lease } from './lease.ts'
import { LeaseHolder } from './lease_holder.ts'
import { LeaseAcquisitionError } from './lease_errors.ts'

export class LeaseManager {

  private readonly _logger: SoloLogger
  private readonly _renewalService: LeaseRenewalService

  constructor (
    private readonly k8: K8,
    private readonly configManager: ConfigManager,
    logger: SoloLogger,
    renewalService: LeaseRenewalService
  ) {
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')
    if (!logger) throw new MissingArgumentError('an instance of core/SoloLogger is required')
    if (!configManager) throw new MissingArgumentError('an instance of core/ConfigManager is required')
    if (!renewalService) throw new MissingArgumentError('an instance of core/LeaseRenewalService is required')

    this._logger = logger
    this._renewalService = renewalService
  }

  public async create (): Promise<Lease> {
    return new Lease(this.k8, this._renewalService, LeaseHolder.default(), await this.currentNamespace())
  }

  public get renewalService (): LeaseRenewalService {
    return this._renewalService
  }

  public get logger (): SoloLogger {
    return this._logger
  }

  private async currentNamespace (): Promise<string> {
    const deploymentNamespace = this.configManager.getFlag<string>(flags.namespace)
    const clusterSetupNamespace = this.configManager.getFlag<string>(flags.clusterSetupNamespace)

    if (!deploymentNamespace && !clusterSetupNamespace) {
      return null
    }
    const namespace = deploymentNamespace ? deploymentNamespace : clusterSetupNamespace

    if (!await this.k8.hasNamespace(namespace)) {
      await this.k8.createNamespace(namespace)

      if (!await this.k8.hasNamespace(namespace)) {
        throw new LeaseAcquisitionError(`failed to create the '${namespace}' namespace`)
      }
    }

    return namespace
  }
}

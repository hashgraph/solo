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
import * as constants from '../../constants.ts'

import { LocalConfigRepository, LocalConfigStructure } from '../LocalConfigRepository.ts'
import type { Opts } from '../../../types/index.ts'
import type { K8 } from '../../k8.ts'
import type * as k8s from '@kubernetes/client-node'
import { SoloError } from '../../errors.ts'

class RemoteConfigManager {
  k8: K8

  constructor (opts: Opts) {
    this.k8 = opts.k8
  }

  public async create (remoteConfig: RemoteCommand) {
    await this.k8.createNamespacedConfigMap(
      constants.SOLO_REMOTE_CONFIGMAP_NAME,
      constants.SOLO_REMOTE_CONFIGMAP_LABELS,
      remoteConfig.toObject() as any
    )
  }

  public async write (remoteConfig: RemoteCommand) {
    await this.k8.replaceNamespacedConfigMap(
      constants.SOLO_REMOTE_CONFIGMAP_NAME,
      constants.SOLO_REMOTE_CONFIGMAP_LABELS,
      remoteConfig.toObject() as any
    )
  }

  public async read (localConfigRepository: LocalConfigRepository) {
    const data = await this.getFromCluster()
    const localConfig = await localConfigRepository.getConfig()


    new RemoteCommand(localConfig)
  }

  async getFromCluster () {
    let data: k8s.V1ConfigMap

    try {
      data = await this.k8.getNamespacedConfigMap(constants.SOLO_REMOTE_CONFIGMAP_NAME)

      return data.data
    } catch (error: any) {
      if (error.meta.statusCode !== 404) {
        throw new SoloError('Failed to get remote config configmap from cluster', error)
      }

      return null
    }
  }
}
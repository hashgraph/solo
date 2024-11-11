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
import { MissingArgumentError, SoloError } from '../../errors.ts'
import { RemoteConfigDataWrapper } from './remote_config_data_wrapper.ts'
import chalk from 'chalk'
import { RemoteConfigMetadata } from './metadata.ts'
import { flags } from '../../../commands/index.ts'
import yaml from 'js-yaml'
import type { LocalConfigRepository } from '../LocalConfigRepository.ts'
import type { K8 } from '../../k8.ts'
import type { Cluster, Namespace, RemoteConfigData } from './types.ts'
import type { SoloLogger } from '../../logging.ts'
import type { ListrTaskWrapper } from 'listr2'
import type { ConfigManager } from '../../config_manager.ts'
import type { Deployment } from '../LocalConfig.ts'

export class RemoteConfigManager {
  private remoteConfig?: RemoteConfigDataWrapper

  constructor (
    private readonly k8: K8,
    private readonly logger: SoloLogger,
    private readonly configManager: ConfigManager,
    private readonly localConfigRepository: LocalConfigRepository,
  ) {}

  async modifyComponent (callback: (remoteConfig: RemoteConfigDataWrapper) => Promise<void> ) {
    if (!this.remoteConfig) {
      throw new SoloError('Attempting to modify remote config without loading it first')
    }

    await callback(this.remoteConfig)

    await this.write()
  }

  private async initializeDefault () {
    const localConfigExists = this.localConfigRepository.configFileExists()
    if (!localConfigExists) {
      const errorMessage = 'Local config doesn\'t exist'
      this.logger.error(errorMessage)
      throw new SoloError(errorMessage)
    }

    const namespace = this._getNamespace()

    const localConfig = await this.localConfigRepository.getConfig()

    const metadata = new RemoteConfigMetadata(
      namespace,
      new Date(),
      localConfig.userEmailAddress
    )

    const clusters: Record<Cluster, Namespace> = {}

    Object.entries(localConfig.deployments).forEach(([ns, deployment]: [Namespace, Deployment]) => {
      deployment.clusters.forEach(cluster => clusters[cluster] = ns)
    })

    const data: RemoteConfigData = {
      metadata,
      clusters: clusters,
      components: {} as any,
    }

    this.remoteConfig = new RemoteConfigDataWrapper(data)
  }

  async create () {
    await this.initializeDefault()

    if (!this.remoteConfig) {
      const errorMessage = 'Attempted to create remote config without data'
      this.logger.error(errorMessage, this.remoteConfig)
      throw new SoloError(errorMessage, undefined, this.remoteConfig)
    }

    await this.k8.createNamespacedConfigMap(
      constants.SOLO_REMOTE_CONFIGMAP_NAME,
      constants.SOLO_REMOTE_CONFIGMAP_LABELS,
      { 'remote-config-data': yaml.dump(this.remoteConfig.toObject() as any) }
    )
  }

  private async write () {
    if (!this.remoteConfig) {
      const errorMessage = 'Attempted to write remote config without data'
      this.logger.error(errorMessage, this.remoteConfig)
      throw new SoloError(errorMessage, undefined, this.remoteConfig)
    }

    await this.k8.replaceNamespacedConfigMap(
      constants.SOLO_REMOTE_CONFIGMAP_NAME,
      constants.SOLO_REMOTE_CONFIGMAP_LABELS,
      { 'remote-config-data': yaml.dump(this.remoteConfig.toObject() as any) }
    )
  }

  async load () {
    const configMap = await this.getFromCluster()
    if (!configMap) {
      return null
    }

    this.remoteConfig = RemoteConfigDataWrapper.fromConfigmap(configMap)
    return this.remoteConfig
  }

  async getFromCluster () {
    try {
      return await this.k8.getNamespacedConfigMap(constants.SOLO_REMOTE_CONFIGMAP_NAME)
    } catch (error: any) {
      if (error.meta.statusCode !== 404) {
        const errorMessage = 'Failed to read remote config from cluster'
        this.logger.error(errorMessage, error)
        throw new SoloError(errorMessage, error)
      }

      return null
    }
  }

  buildLoadRemoteConfigCommand (createIfItDoesntExist = false) {
    const self = this

    return {
      title: 'Load remote config',
      task: async (_: any, task: ListrTaskWrapper<any, any, any>) => {
        const baseTitle = task.title
        const config = await self.load()

        if (!config && !createIfItDoesntExist) {
          task.title = `${baseTitle} - ${chalk.red('remote config not found')}`

          throw new SoloError('Failed to load remote config')
        }

        if (!config) {
          task.title = `${baseTitle} - ${chalk.yellow('remote config not found, attempting to create it')}`

          await self.create()

          task.title = `${baseTitle} - ${chalk.green('remote config created successfully')}`
        }
      }
    }
  }

  private _getNamespace (): string {
    const ns = this.configManager.getFlag<string>(flags.namespace) as string
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }
}
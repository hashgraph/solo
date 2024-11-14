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
import { ComponentsDataWrapper } from './components_data_wrapper.ts'
import type { K8 } from '../../k8.ts'
import type { Cluster, Namespace, RemoteConfigData } from './types.ts'
import type { SoloLogger } from '../../logging.ts'
import type { ListrTaskWrapper } from 'listr2'
import type { ConfigManager } from '../../config_manager.ts'
import type { LocalConfig } from '../LocalConfig.ts'
import type { DeploymentStructure } from '../LocalConfigData.ts'
import type { ContextClusterStructure } from '../../../types/index.ts'

interface ListrContext { config: { contextCluster: ContextClusterStructure } }

export class RemoteConfigManager {
  private remoteConfig?: RemoteConfigDataWrapper

  constructor (
    private readonly k8: K8,
    private readonly logger: SoloLogger,
    private readonly localConfig: LocalConfig,
    private readonly configManager: ConfigManager,
  ) {}

  async modify (callback: (remoteConfig: RemoteConfigDataWrapper) => Promise<void> ) {
    if (!this.remoteConfig) {
      throw new SoloError('Attempting to modify remote config without loading it first')
    }

    await callback(this.remoteConfig)

    await this.write()
  }

  async create () {
    const namespace = this.getNamespace()

    const metadata = new RemoteConfigMetadata(
      namespace,
      new Date(),
      this.localConfig.userEmailAddress
    )

    const clusters: Record<Cluster, Namespace> = {}

    Object.entries(this.localConfig.deployments)
      .forEach(([namespace, deployment]: [Namespace, DeploymentStructure]) => {
        deployment.clusters.forEach(cluster => clusters[cluster] = namespace)
      })

    this.remoteConfig = new RemoteConfigDataWrapper({
      metadata,
      clusters,
      components: new ComponentsDataWrapper(),
      lastExecutedCommand: 'deployment create',
      commandHistory: [ 'deployment create' ]
    })

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
      return false
    }

    this.remoteConfig = RemoteConfigDataWrapper.fromConfigmap(configMap)
    return true
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

  buildLoadRemoteConfigTask (argv: { _: string[]}) {
    const self = this

    return {
      title: 'Load remote config',
      task: async (_: any, task: ListrTaskWrapper<any, any, any>) => {
        const baseTitle = task.title

        const isConfigLoaded = await self.load()
        if (!isConfigLoaded) {
          task.title = `${baseTitle} - ${chalk.red('remote config not found')}`

          throw new SoloError('Failed to load remote config')
        }

        const currentCommand = argv._.join(' ')

        self.remoteConfig!.addCommandToHistory(currentCommand)

        await self.write()
      }
    }
  }

  buildCreateRemoteConfigTask () {
    const remoteConfigManager = this

    return {
        title: 'Create remote config',
        task: async (ctx: ListrContext, task: ListrTaskWrapper<ListrContext, any, any>) => {
          const baseTitle = task.title

          const localConfigExists = this.localConfig.configFileExists()
          if (!localConfigExists) {
            const errorMessage = 'Local config doesn\'t exist'
            this.logger.error(errorMessage)
            throw new SoloError(errorMessage)
          }

          const { context, clusters } = ctx.config.contextCluster

          clusters.forEach((cluster: Cluster) => {
            remoteConfigManager.localConfig.clusterMappings[context] = cluster
          })

          const isConfigLoaded = await remoteConfigManager.load()
          if (isConfigLoaded) {
            task.title = `${baseTitle} - ${chalk.red('Remote config already exists')}}`

            throw new SoloError('Remote config already exists')
          }

          await remoteConfigManager.create()
        }
      }
  }

  private getNamespace (): string {
    const ns = this.configManager.getFlag<string>(flags.namespace) as string
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }
}
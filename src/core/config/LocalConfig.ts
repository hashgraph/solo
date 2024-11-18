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
import fs from 'fs'
import * as yaml from 'yaml'
import { MissingArgumentError, SoloError } from '../errors.ts'
import { promptDeploymentClusters, promptDeploymentName, promptUserEmailAddress } from '../../commands/prompts.ts'
import { flags } from '../../commands/index.ts'
import type { SoloLogger } from '../logging.ts'
import type { ListrTask, ListrTaskWrapper } from 'listr2'
import type {
  ClusterMapping, Deployments, DeploymentName, LocalConfigData, DeploymentStructure,
} from './LocalConfigData.ts'
import type { EmailAddress } from './remote/types.ts'
import type { K8 } from '../k8.ts'
import type { ConfigManager } from '../config_manager.ts'

export class LocalConfig implements LocalConfigData {
  public userEmailAddress: EmailAddress
  public deployments: Deployments
  public currentDeploymentName : DeploymentName
  public clusterMappings: ClusterMapping

  private readonly allowedKeys = ['userEmailAddress', 'deployments', 'currentDeploymentName', 'clusterMappings']
  private readonly skipPromptTask: boolean

  public constructor (
    private readonly filePath: string,
    private readonly logger: SoloLogger,
    private readonly k8: K8,
    private readonly configManager: ConfigManager,
  ) {
    if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required')
    if (!logger) throw new Error('An instance of core/SoloLogger is required')

    if (!this.configFileExists()) {
      this.skipPromptTask = false
    } else {
      this.skipPromptTask = true

      const fileContent = fs.readFileSync(filePath, 'utf8')
      const parsedConfig = yaml.parse(fileContent)

      for(const key in parsedConfig) {
        if (!this.allowedKeys.includes(key)) {
          throw new SoloError('Validation of local config failed')
        }
        this[key] = parsedConfig[key]
      }

      this.validate()
    }
  }

  private validate () {
    const genericMessage = 'Validation of local config failed'

    // Validate deployments
    for (const [_, deployment] of Object.entries(this.deployments)) {
      if (
        !deployment || typeof deployment !== 'object' ||
        !Array.isArray(deployment.clusters) ||
        !deployment.clusters.every(alias => typeof alias === 'string')
      ) {
        throw new SoloError(genericMessage + 'this.deployments error')
      }
    }

    // Validate cluster mappings
    for (const [clusterName, contextName] of Object.entries(this.clusterMappings)) {
      if (typeof clusterName !== 'string' || typeof contextName !== 'string') {
        throw new SoloError(genericMessage + 'this.clusterMappings error')
      }
    }

    // Validate current deployment exists
    if (!this.deployments[this.currentDeploymentName]) {
      throw new SoloError(genericMessage + 'invalid current deployment name')
    }
  }

  public setUserEmailAddress (emailAddress: EmailAddress): this {
    this.userEmailAddress = emailAddress
    this.validate()
    return this
  }

  public setDeployments (deployments: Deployments): this {
    this.deployments = deployments
    this.validate()
    return this
  }

  public setClusterMappings (clusterMappings: ClusterMapping): this {
    this.clusterMappings = clusterMappings
    this.validate()
    return this
  }

  public setCurrentDeployment (deploymentName: DeploymentName): this {
    this.currentDeploymentName = deploymentName
    this.validate()
    return this
  }

  public getCurrentDeployment (): DeploymentStructure {
    return this.deployments[this.currentDeploymentName]
  }

  public configFileExists (): boolean { return fs.existsSync(this.filePath) }

  public async write (): Promise<void> {
    console.dir({
      userEmailAddress: this.userEmailAddress,
      deployments: this.deployments,
      currentDeploymentName: this.currentDeploymentName,
      clusterMappings: this.clusterMappings
    }, { depth: null })

    const yamlContent = yaml.stringify({
      userEmailAddress: this.userEmailAddress,
      deployments: this.deployments,
      currentDeploymentName: this.currentDeploymentName,
      clusterMappings: this.clusterMappings
    })
    await fs.promises.writeFile(this.filePath, yamlContent)
    this.logger.info(`Wrote local config to ${this.filePath}`)
  }

  public promptLocalConfigTask (): ListrTask<any, any, any>  {
    const localConfig = this

    return {
      title: 'Prompt local configuration',
      skip: localConfig.skipPromptTask,
      task: async (_: any, task: ListrTaskWrapper<any, any, any>) => {
        const kubeConfig = localConfig.k8.getKubeConfig()

        const clusterMappings = {}
        kubeConfig.contexts.forEach(c => clusterMappings[c.cluster] = c.name)

        let userEmailAddress = localConfig.configManager.getFlag<EmailAddress>(flags.userEmailAddress)
        if (!userEmailAddress) userEmailAddress = await promptUserEmailAddress(task, userEmailAddress)

        let deploymentName = localConfig.configManager.getFlag<DeploymentName>(flags.deploymentName)
        if (!deploymentName) deploymentName = await promptDeploymentName(task, deploymentName)

        let deploymentClusters = localConfig.configManager.getFlag<string>(flags.deploymentClusters)
        if (!deploymentClusters) deploymentClusters = await promptDeploymentClusters(task, deploymentClusters)

        const deployments = { [deploymentName]: { clusters: deploymentClusters.split(',') } }

        localConfig.userEmailAddress = userEmailAddress
        localConfig.deployments = deployments
        localConfig.currentDeploymentName = deploymentName
        localConfig.clusterMappings = clusterMappings
        localConfig.validate()

        await localConfig.write()
      }
    }
  }
}

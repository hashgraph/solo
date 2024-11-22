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
import { IsEmail, IsNotEmpty, IsObject, IsString, validateSync } from 'class-validator'
import fs from 'fs'
import * as yaml from 'yaml'
import { flags } from '../../commands/index.js'
import { MissingArgumentError, SoloError } from '../errors.js'
import { promptDeploymentClusters, promptDeploymentName, promptUserEmailAddress } from '../../commands/prompts.js'
import type { ListrTask, ListrTaskWrapper } from 'listr2'
import type { ClusterMapping, DeploymentStructure, Deployments, LocalConfigData } from './local_config_data.js'
import type { SoloLogger } from '../logging.js'
import type { EmailAddress, Namespace } from './remote/types.js'
import type { K8 } from '../k8.js'
import type { ConfigManager } from '../config_manager.js'

export class LocalConfig implements LocalConfigData {
    @IsNotEmpty()
    @IsEmail()
    public userEmailAddress: EmailAddress

    // The string is the name of the deployment, will be used as the namespace,
    // so it needs to be available in all targeted clusters
    @IsNotEmpty()
    @IsObject()
    public deployments: Deployments

    @IsNotEmpty()
    @IsString()
    public currentDeploymentName : Namespace

    // contextName refers to the "CURRENT NAME", and clusterName refers to the CLUSTER leveraged in kubeConfig.currentContext
    // { clusterName : string, contextName : string }
    @IsNotEmpty()
    @IsObject()
    public clusterMappings: ClusterMapping

    private readonly skipPromptTask: boolean = false

    public constructor (
      private readonly filePath: string,
      private readonly logger: SoloLogger,
      private readonly k8: K8,
      private readonly configManager: ConfigManager,
    ) {
        if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required')
        if (!logger) throw new Error('An instance of core/SoloLogger is required')

        const allowedKeys = ['userEmailAddress', 'deployments', 'currentDeploymentName', 'clusterMappings']
        if (this.configFileExists()) {
            const fileContent = fs.readFileSync(filePath, 'utf8')
            const parsedConfig = yaml.parse(fileContent)

            for(const key in parsedConfig) {
                if (!allowedKeys.includes(key)) {
                    throw new SoloError('Validation of local config failed')
                }
                this[key] = parsedConfig[key]
            }

            this.validate()
            this.skipPromptTask = true
        }
    }

    private validate (): void {
        const genericMessage = 'Validation of local config failed'
        const errors = validateSync(this, {})

        if (errors.length) {
            throw new SoloError(genericMessage)
        }

        try {
            // Custom validations:
            for (const deploymentName in this.deployments) {
                const deployment = this.deployments[deploymentName]
                const deploymentIsObject = deployment && typeof deployment === 'object'
                const deploymentHasClusterAliases = deployment.clusters && Array.isArray(deployment.clusters)
                let clusterAliasesAreStrings = true
                for (const clusterAlias of deployment.clusters) {
                    if (typeof clusterAlias !== 'string') {
                        clusterAliasesAreStrings = false
                    }
                }

                if (!deploymentIsObject || !deploymentHasClusterAliases || !clusterAliasesAreStrings) {
                    throw new SoloError(genericMessage)
                }
            }

            for (const clusterName in this.clusterMappings) {
                const contextName = this.clusterMappings[clusterName]
                if (typeof clusterName !== 'string' || typeof contextName !== 'string') {
                    throw new SoloError(genericMessage)
                }
            }

            if (!this.deployments[this.currentDeploymentName]) {
                throw new SoloError(genericMessage)
            }
        }
        catch(e: any) { throw new SoloError(genericMessage) }
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

    public setCurrentDeployment (deploymentName: string): this {
        this.currentDeploymentName = deploymentName
        this.validate()
        return this
    }

    public getCurrentDeployment (): DeploymentStructure {
        return this.deployments[this.currentDeploymentName]
    }

    public configFileExists (): boolean {
        return fs.existsSync(this.filePath)
    }

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
        const self = this

        return {
            title: 'Prompt local configuration',
            skip: this.skipPromptTask,
            task: async (_: any, task: ListrTaskWrapper<any, any, any>): Promise<void> => {
                const kubeConfig = self.k8.getKubeConfig()

                const clusterMappings = {}
                kubeConfig.contexts.forEach(c => {
                    clusterMappings[c.cluster] = c.name
                })

                let userEmailAddress = self.configManager.getFlag<EmailAddress>(flags.userEmailAddress)
                if (!userEmailAddress) userEmailAddress = await promptUserEmailAddress(task, userEmailAddress)

                let deploymentName = self.configManager.getFlag<Namespace>(flags.deploymentName)
                if (!deploymentName) deploymentName = await promptDeploymentName(task, deploymentName)

                let deploymentClusters = self.configManager.getFlag<string>(flags.deploymentClusters)
                if (!deploymentClusters) deploymentClusters = await promptDeploymentClusters(task, deploymentClusters)

                const deployments: Deployments = {
                    [deploymentName]: { clusters: deploymentClusters.split(',') }
                }

                this.userEmailAddress = userEmailAddress
                this.deployments = deployments
                this.currentDeploymentName = deploymentName
                this.clusterMappings = clusterMappings

                this.validate()
                await this.write()
            }
        }
    }
}

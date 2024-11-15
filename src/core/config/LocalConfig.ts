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
import { type ListrTask } from 'listr2'
import fs from 'fs'
import * as yaml from 'yaml'
import { type ClusterMapping, type Deployment, type Deployments, type LocalConfigData } from './LocalConfigData.ts'
import { MissingArgumentError, SoloError } from '../errors.ts'
import {
    promptDeploymentClusters,
    promptNamespace,
    promptUserEmailAddress
} from '../../commands/prompts.ts'
import { flags } from '../../commands/index.ts'
import { type SoloLogger } from '../logging.ts'
import { Task } from '../task.ts'

export class LocalConfig implements LocalConfigData {
    @IsNotEmpty()
    @IsEmail()
    userEmailAddress: string

    // The string is the name of the deployment, will be used as the namespace,
    // so it needs to be available in all targeted clusters
    @IsNotEmpty()
    @IsObject()
    deployments: Deployments

    @IsNotEmpty()
    @IsString()
    currentDeploymentName : string

    // contextName refers to the "CURRENT NAME", and clusterName refers to the CLUSTER leveraged in kubeConfig.currentContext
    // { clusterName : string, contextName : string }
    @IsNotEmpty()
    @IsObject()
    clusterMappings: ClusterMapping

    private readonly skipPromptTask: boolean = false
    private readonly filePath: string
    private readonly logger: SoloLogger

    constructor (filePath: string, logger: SoloLogger) {
        if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required')
        if (!logger) throw new Error('An instance of core/SoloLogger is required')

        this.filePath = filePath
        this.logger = logger

        const allowedKeys = ['userEmailAddress', 'deployments', 'currentDeploymentName', 'clusterMappings']
        if (this.configFileEXists()) {
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

    private validate () {
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
                const deploymentHasClusterAliases = deployment.clusterAliases && Array.isArray(deployment.clusterAliases)
                let clusterAliasesAreStrings = true
                for (const clusterAlias of deployment.clusterAliases) {
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

    public setUserEmailAddress (emailAddress: string): this {
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

    public getCurrentDeployment (): Deployment {
        return this.deployments[this.currentDeploymentName]
    }

    private configFileEXists (): boolean {
        return fs.existsSync(this.filePath)
    }

    public async write (): Promise<void> {
        const yamlContent = yaml.stringify({
            userEmailAddress: this.userEmailAddress,
            deployments: this.deployments,
            currentDeploymentName: this.currentDeploymentName,
            clusterMappings: this.clusterMappings
        })
        await fs.promises.writeFile(this.filePath, yamlContent)
        this.logger.info(`Wrote local config to ${this.filePath}`)
    }

    public promptLocalConfigTask (k8, argv): Task  {
        return new Task('Prompt local configuration', async (ctx, task) => {
            const kubeConfig = k8.getKubeConfig()

            const clusterMappings = {}
            kubeConfig.contexts.forEach(c => {
                clusterMappings[c.cluster] = c.name
            })

            let userEmailAddress = argv[flags.userEmailAddress.name]
            if (!userEmailAddress) userEmailAddress = await promptUserEmailAddress(task, userEmailAddress)

            let deploymentName = argv[flags.namespace.name]
            if (!deploymentName) deploymentName = await promptNamespace(task, deploymentName)

            let deploymentClusters = argv[flags.deploymentClusters.name]
            if (!deploymentClusters) deploymentClusters = await promptDeploymentClusters(task, deploymentClusters)

            const deployments = {}
            deployments[deploymentName] = {
                clusterAliases: deploymentClusters.split(',')
            }

            this.userEmailAddress = userEmailAddress
            this.deployments = deployments
            this.currentDeploymentName = deploymentName
            this.clusterMappings = clusterMappings
            this.validate()
            await this.write()

            return this
        }, this.skipPromptTask) as Task
    }
}

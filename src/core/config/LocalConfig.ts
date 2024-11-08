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
import { SoloError } from '../errors.ts'
import type { Cluster, Context, EmailAddress, Namespace } from './remote/types.ts'
import type { LocalConfigStructure } from './LocalConfigRepository.ts'

type DeploymentName = string

export interface Deployment {
    clusters : Cluster[]
}

// an alias for the cluster, provided during the configuration
// of the deployment, must be unique
export type Deployments = Record<DeploymentName, Deployment>;

export type ClusterMapping = Record<Cluster, Context>;

export class LocalConfig {
    @IsNotEmpty()
    @IsEmail()
    userEmailAddress: EmailAddress

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

    constructor (config: LocalConfigStructure) {
        this.userEmailAddress = config.userEmailAddress
        this.deployments = config.deployments
        this.currentDeploymentName = config.currentDeploymentName
        this.clusterMappings = config.clusterMappings

        this.validate()
    }

    validate () {
        const genericMessage = 'Validation of local config failed'

        const errors = validateSync(this, { whitelist: true, enableDebugMessages: true, forbidNonWhitelisted: true })

        if (errors.length) {
            throw new SoloError(genericMessage)
        }

        try {
            // Custom validations:
            for (const deploymentName in this.deployments) {
                const deployment = this.deployments[deploymentName]
                const deploymentIsObject = deployment && typeof deployment === 'object'
                const deploymentHasClusters = deployment.clusters && Array.isArray(deployment.clusters)
                let clustersAreStrings = true
                for (const clusterAlias of deployment.clusters) {
                    if (typeof clusterAlias !== 'string') {
                        clustersAreStrings = false
                    }
                }

                if (!deploymentIsObject || !deploymentHasClusters || !clustersAreStrings) {
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
    
    public getCurrentDeployment (): Deployment {
        return this.deployments[this.currentDeploymentName]
    }
}
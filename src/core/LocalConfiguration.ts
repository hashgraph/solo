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
import { injectable } from 'inversify';
import {ClusterMapping, Deployment, Deployments, EmailAddress, LocalConfig} from "../types/index.js";
import fs from "fs";
import * as yaml from 'yaml'
import {MissingArgumentError, SoloError} from "./errors.js";

@injectable()
export class LocalConfiguration {
    private config: LocalConfig;

    constructor(private filePath: string) {
        if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required')
    }

    public async loadConfig(): Promise<LocalConfig> {
        if (!fs.existsSync(this.filePath)) {
            throw new SoloError(`Local config file not found: ${this.filePath}`);
        }

        if (!this.config) {
            this.config = await LocalConfiguration.parseFromYamlFile(this.filePath)
        }
        return this.config;
    }

    public async saveConfig(): Promise<void> {
        const yamlContent = yaml.stringify(this.config);
        await fs.promises.writeFile(this.filePath, yamlContent);
    }

    public getFilePath(): string {
        return this.filePath;
    }

    public setFilePath(filePath: string): void {
        this.filePath = filePath;
    }


    public async getUserEmailAddress(): Promise<string> {
        const config = await this.loadConfig();
        return config.userEmailAddress;
    }

    public async getCurrentDeployment(): Promise<Deployment> {
        const config = await this.loadConfig();
        return config.deployments[this.config.currentDeploymentName];
    }

    public async getCurrentDeploymentName(): Promise<string> {
        const config = await this.loadConfig();
        return config.currentDeploymentName
    }

    public async getDeployments(): Promise<Deployments> {
        const config = await this.loadConfig();
        return config.deployments;
    }

    public async getClusterMappings(): Promise<ClusterMapping> {
        const config = await this.loadConfig();
        return config.clusterMappings;
    }

    public async setUserEmailAddress(emailAddress: EmailAddress): Promise<this> {
        const config = await this.loadConfig();
        config.userEmailAddress = emailAddress;
        return this;
    }

    public async setDeployments(deployments: Deployments): Promise<this> {
        const config = await this.loadConfig();
        config.deployments = deployments;
        return this;
    }

    public async setClusterMappings(clusterMappings: ClusterMapping): Promise<this> {
        const config = await this.loadConfig();
        config.clusterMappings = clusterMappings;
        return this;
    }

    public async setCurrentDeployment(deploymentName: string): Promise<this> {
        const config = await this.loadConfig();
        config.currentDeploymentName = deploymentName;
        return this;
    }

    public setConfig(config: LocalConfig): this {
        this.config = config;
        return this;
    }

    static async parseFromYamlFile(filePath: string): Promise<LocalConfig> {
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        let config = yaml.parse(fileContent) as LocalConfig;
        return config

        // const deployments = new Map();
        // for (const key in config.deployments) {
        //     deployments.set(key, config.deployments[key]);
        // }
        // const clusterMappings = new Map(Object.entries(config.clusterMappings));
        //
        // return {
        //     ...config,
        //     deployments,
        //     clusterMappings
        // };
    }
}

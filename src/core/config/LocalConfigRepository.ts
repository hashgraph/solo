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
import {LocalConfig} from "./LocalConfig.ts";
import fs from "fs";
import * as yaml from 'yaml'
import {MissingArgumentError, SoloError} from "../errors.ts";
import {promptDeploymentClusters, promptDeploymentName, promptUserEmailAddress} from "../../commands/prompts.ts";
import {flags} from "../../commands/index.ts";
import {SoloLogger} from "../logging.js";

@injectable()
export class LocalConfigRepository {
    private config: LocalConfig;

    constructor(private readonly filePath: string, private readonly logger: SoloLogger) {
        if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required')
        if (!logger) throw new Error('An instance of core/SoloLogger is required')
    }

    public async getConfig(): Promise<LocalConfig> {
        if (!this.configFileEXists()) {
            // TODO add a warning or something
            throw new SoloError(`Local config file not found: ${this.filePath}`);
        }

        if (!this.config) {
            this.config = await LocalConfigRepository.parseFromFile(this.filePath)
        }
        return this.config;
    }

    public configFileEXists(): boolean {
        return fs.existsSync(this.filePath)
    }

    public async saveConfig(): Promise<void> {
        const config = await this.getConfig()
        await this.writeConfig(config)
    }

    public async writeConfig(config: LocalConfig): Promise<void> {
        const yamlContent = yaml.stringify(config);
        await fs.promises.writeFile(this.filePath, yamlContent);
        this.logger.info(`Wrote local config to ${this.filePath}`)
    }

    public setConfig(config: LocalConfig): this {
        this.config = config;
        return this;
    }

    static async parseFromFile(filePath: string): Promise<LocalConfig> {
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        return new LocalConfig(yaml.parse(fileContent));
    }

    public loadLocalConfigTask(k8, argv)  {
        return {
            title: 'Load local configuration',
                task: async (ctx, task) => {
                    let config
                    if (this.configFileEXists()) {
                        config = this.getConfig()
                    }
                    else {
                        const kubeConfig = k8.getKubeConfig()

                        let clusterMappings = {}
                        kubeConfig.contexts.forEach(c => {
                            clusterMappings[c.cluster] = c.name
                        })

                        let userEmailAddress = argv[flags.userEmailAddress.name];
                        if (!userEmailAddress) userEmailAddress = await promptUserEmailAddress(task, userEmailAddress)

                        let deploymentName = argv[flags.deploymentName.name];
                        if (!deploymentName) deploymentName = await promptDeploymentName(task, deploymentName)

                        let deploymentClusters = argv[flags.deploymentClusters.name];
                        if (!deploymentClusters) deploymentClusters = await promptDeploymentClusters(task, deploymentClusters)

                        const deployments = {}
                        deployments[deploymentName] = {
                            clusterAliases: deploymentClusters.split(',')
                        }

                        config = {
                            userEmailAddress,
                            deployments,
                            currentDeploymentName: deploymentName,
                            clusterMappings
                        } as LocalConfig;

                        await this.writeConfig(config)
                    }

                    return config
                }
        }
    }
}
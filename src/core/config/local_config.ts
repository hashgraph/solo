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
import {IsEmail, IsNotEmpty, IsObject, IsString, validateSync} from 'class-validator';
import type {ListrTask, ListrTaskWrapper} from 'listr2';
import fs from 'fs';
import * as yaml from 'yaml';
import {Flags as flags} from '../../commands/flags.js';
import {
  type ClusterContextMapping,
  type Deployments,
  type DeploymentStructure,
  type LocalConfigData,
} from './local_config_data.js';
import {MissingArgumentError, SoloError} from '../errors.js';
import {type SoloLogger} from '../logging.js';
import {IsClusterContextMapping, IsDeployments} from '../validator_decorators.js';
import type {ConfigManager} from '../config_manager.js';
import type {EmailAddress, Namespace} from './remote/types.js';
import {Templates} from '../templates.js';
import {ErrorMessages} from '../error_messages.js';

export class LocalConfig implements LocalConfigData {
  @IsEmail(
    {},
    {
      message: ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL,
    },
  )
  userEmailAddress: EmailAddress;

  // The string is the name of the deployment, will be used as the namespace,
  // so it needs to be available in all targeted clusters
  @IsDeployments({
    message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT,
  })
  @IsNotEmpty()
  @IsObject({
    message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT,
  })
  public deployments: Deployments;

  @IsString({
    message: ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST,
  })
  @IsNotEmpty()
  currentDeploymentName: string;

  @IsClusterContextMapping({
    message: ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT,
  })
  @IsNotEmpty()
  clusterContextMapping: ClusterContextMapping;

  private readonly skipPromptTask: boolean = false;

  public constructor(
    private readonly filePath: string,
    private readonly logger: SoloLogger,
    private readonly configManager: ConfigManager,
  ) {
    if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required');
    if (!logger) throw new Error('An instance of core/SoloLogger is required');

    const allowedKeys = ['userEmailAddress', 'deployments', 'currentDeploymentName', 'clusterContextMapping'];
    if (this.configFileExists()) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedConfig = yaml.parse(fileContent);

      for (const key in parsedConfig) {
        if (!allowedKeys.includes(key)) {
          throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
        }
        this[key] = parsedConfig[key];
      }

      this.validate();
      this.skipPromptTask = true;
    }
  }

  private validate(): void {
    const errors = validateSync(this, {});

    if (errors.length) {
      // throw the first error:
      const prop = Object.keys(errors[0]?.constraints);
      if (prop[0]) {
        throw new SoloError(errors[0].constraints[prop[0]]);
      } else {
        throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
      }
    }

    // Custom validations:
    if (!this.deployments[this.currentDeploymentName]) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST);
    }
  }

  public setUserEmailAddress(emailAddress: EmailAddress): this {
    this.userEmailAddress = emailAddress;
    this.validate();
    return this;
  }

  public setDeployments(deployments: Deployments): this {
    this.deployments = deployments;
    this.validate();
    return this;
  }

  public setCurrentDeployment(deploymentName: Namespace): this {
    this.currentDeploymentName = deploymentName;
    this.validate();
    return this;
  }

  public setClusterContextMapping(clusterContextMapping: ClusterContextMapping): this {
    this.clusterContextMapping = clusterContextMapping;
    this.validate();
    return this;
  }

  public getCurrentDeployment(): DeploymentStructure {
    return this.deployments[this.currentDeploymentName];
  }

  public configFileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  public async write(): Promise<void> {
    const yamlContent = yaml.stringify({
      userEmailAddress: this.userEmailAddress,
      deployments: this.deployments,
      currentDeploymentName: this.currentDeploymentName,
      clusterContextMapping: this.clusterContextMapping,
    });
    await fs.promises.writeFile(this.filePath, yamlContent);
    this.logger.info(`Wrote local config to ${this.filePath}`);
  }

  public promptLocalConfigTask(): ListrTask<any, any, any> {
    const self = this;

    return {
      title: 'Prompt local configuration',
      skip: this.skipPromptTask,
      task: async (_: any, task: ListrTaskWrapper<any, any, any>): Promise<void> => {
        let userEmailAddress = self.configManager.getFlag<EmailAddress>(flags.userEmailAddress);
        if (!userEmailAddress) {
          userEmailAddress = await flags.userEmailAddress.prompt(task, userEmailAddress);
          self.configManager.setFlag(flags.userEmailAddress, userEmailAddress);
        }

        const deploymentName = self.configManager.getFlag<Namespace>(flags.namespace);
        if (!deploymentName) throw new SoloError('Namespace was not specified');

        let deploymentClusters = self.configManager.getFlag<string>(flags.deploymentClusters);
        if (!deploymentClusters) {
          deploymentClusters = await flags.deploymentClusters.prompt(task, deploymentClusters);
          self.configManager.setFlag(flags.deploymentClusters, deploymentClusters);
        }

        const parsedClusters = Templates.parseCommaSeparatedList(deploymentClusters);

        const deployments: Deployments = {
          [deploymentName]: {clusters: parsedClusters},
        };

        const contexts = self.configManager.getFlag<string>(flags.context);
        const parsedContexts = Templates.parseCommaSeparatedList(contexts);

        if (parsedContexts.length < parsedClusters.length) {
          for (const cluster of parsedClusters) {
            let context;
            this.clusterContextMapping[cluster] = await flags.context.prompt(task, context, cluster);
          }
        } else {
          for (let i = 0; i < parsedClusters.length; i++) {
            const cluster = parsedClusters[i];
            this.clusterContextMapping[cluster] = parsedContexts[i];
          }
        }

        this.userEmailAddress = userEmailAddress;
        this.deployments = deployments;
        this.currentDeploymentName = deploymentName;
        this.validate();
        await this.write();
      },
    };
  }
}

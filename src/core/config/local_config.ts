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
import {SoloLogger} from '../logging.js';
import {IsClusterContextMapping, IsDeployments} from '../validator_decorators.js';
import {ConfigManager} from '../config_manager.js';
import type {DeploymentName, EmailAddress, Namespace} from './remote/types.js';
import {ErrorMessages} from '../error_messages.js';
import {type K8} from '../k8.js';
import {splitFlagInput} from '../helpers.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../container_helper.js';
import type {SoloListrTask} from '../../types/index.js';

@injectable()
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
  public clusterContextMapping: ClusterContextMapping = {};

  private readonly skipPromptTask: boolean = false;

  public constructor(
    @inject('localConfigFilePath') private readonly filePath?: string,
    @inject(SoloLogger) private readonly logger?: SoloLogger,
    @inject(ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.filePath = patchInject(filePath, 'localConfigFilePath', this.constructor.name);
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);

    if (!this.filePath || this.filePath === '') throw new MissingArgumentError('a valid filePath is required');

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

  public setCurrentDeployment(deploymentName: DeploymentName): this {
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

    this.logger.info(`Wrote local config to ${this.filePath}: ${yamlContent}`);
  }

  public promptLocalConfigTask(k8: K8): SoloListrTask<any> {
    const self = this;

    return {
      title: 'Prompt local configuration',
      skip: this.skipPromptTask,
      task: async (_, task): Promise<void> => {
        if (self.configFileExists()) {
          self.configManager.setFlag(flags.userEmailAddress, self.userEmailAddress);
        }

        const isQuiet = self.configManager.getFlag<boolean>(flags.quiet);
        const contexts = self.configManager.getFlag<string>(flags.context);
        const deploymentName = self.configManager.getFlag<DeploymentName>(flags.deployment);
        const namespace = self.configManager.getFlag<Namespace>(flags.namespace);
        let userEmailAddress = self.configManager.getFlag<EmailAddress>(flags.userEmailAddress);
        let deploymentClusters: string = self.configManager.getFlag<string>(flags.deploymentClusters);

        if (!userEmailAddress) {
          if (isQuiet) throw new SoloError(ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL);
          userEmailAddress = await flags.userEmailAddress.prompt(task, userEmailAddress);
          self.configManager.setFlag(flags.userEmailAddress, userEmailAddress);
        }

        if (!deploymentName) throw new SoloError('Deployment name was not specified');

        if (!deploymentClusters) {
          if (isQuiet) {
            deploymentClusters = k8.getCurrentClusterName();
          } else {
            deploymentClusters = await flags.deploymentClusters.prompt(task, deploymentClusters);
          }
          self.configManager.setFlag(flags.deploymentClusters, deploymentClusters);
        }

        const parsedClusters = splitFlagInput(deploymentClusters);

        const deployments: Deployments = {
          [deploymentName]: {
            clusters: parsedClusters,
            namespace,
          },
        };

        const parsedContexts = splitFlagInput(contexts);

        if (parsedContexts.length < parsedClusters.length) {
          if (!isQuiet) {
            const promptedContexts: string[] = [];
            for (const cluster of parsedClusters) {
              const kubeContexts = k8.getContexts();
              const context: string = await flags.context.prompt(
                task,
                kubeContexts.map(c => c.name),
                cluster,
              );
              self.clusterContextMapping[cluster] = context;
              promptedContexts.push(context);

              self.configManager.setFlag(flags.context, context);
            }
            self.configManager.setFlag(flags.context, promptedContexts.join(','));
          } else {
            const context = k8.getCurrentContext();
            for (const cluster of parsedClusters) {
              self.clusterContextMapping[cluster] = context;
            }
            self.configManager.setFlag(flags.context, context);
          }
        } else {
          for (let i = 0; i < parsedClusters.length; i++) {
            const cluster = parsedClusters[i];
            self.clusterContextMapping[cluster] = parsedContexts[i];

            self.configManager.setFlag(flags.context, parsedContexts[i]);
          }
        }

        self.userEmailAddress = userEmailAddress;
        self.deployments = deployments;
        self.currentDeploymentName = deploymentName;

        self.validate();
        await self.write();
      },
    };
  }
}

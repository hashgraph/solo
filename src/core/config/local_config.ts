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
import {flags} from '../../commands/index.js';
import {type Deployment, type Deployments, type LocalConfigData} from './local_config_data.js';
import {MissingArgumentError, SoloError} from '../errors.js';
import {promptDeploymentClusters, promptNamespace, promptUserEmailAddress} from '../../commands/prompts.js';
import {type SoloLogger} from '../logging.js';
import {Task} from '../task.js';
import {IsDeployments} from '../validator_decorators.js';
import {Templates} from '../templates.js';
import {ErrorMessages} from '../error_messages.js';

export class LocalConfig implements LocalConfigData {
  @IsEmail(
    {},
    {
      message: ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL,
    },
  )
  userEmailAddress: string;

  // The string is the name of the deployment, will be used as the namespace,
  // so it needs to be available in all targeted clusters
  @IsDeployments({
    message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT,
  })
  @IsNotEmpty()
  @IsObject({
    message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT,
  })
  deployments: Deployments;

  @IsString({
    message: ErrorMessages.LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST,
  })
  @IsNotEmpty()
  currentDeploymentName: string;

  private readonly skipPromptTask: boolean = false;

  constructor(
    private readonly filePath: string,
    private readonly logger: SoloLogger,
  ) {
    if (!filePath || filePath === '') throw new MissingArgumentError('a valid filePath is required');
    if (!logger) throw new Error('An instance of core/SoloLogger is required');

    const allowedKeys = ['userEmailAddress', 'deployments', 'currentDeploymentName'];
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

  private validate() {
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

  public setUserEmailAddress(emailAddress: string): this {
    this.userEmailAddress = emailAddress;
    this.validate();
    return this;
  }

  public setDeployments(deployments: Deployments): this {
    this.deployments = deployments;
    this.validate();
    return this;
  }

  public setCurrentDeployment(deploymentName: string): this {
    this.currentDeploymentName = deploymentName;
    this.validate();
    return this;
  }

  public getCurrentDeployment(): Deployment {
    return this.deployments[this.currentDeploymentName];
  }

  private configFileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  public async write(): Promise<void> {
    const yamlContent = yaml.stringify({
      userEmailAddress: this.userEmailAddress,
      deployments: this.deployments,
      currentDeploymentName: this.currentDeploymentName,
    });
    await fs.promises.writeFile(this.filePath, yamlContent);
    this.logger.info(`Wrote local config to ${this.filePath}`);
  }

  public promptLocalConfigTask(k8, argv): Task {
    const self = this;
    return new Task(
      'Prompt local configuration',
      async (ctx, task) => {
        let userEmailAddress = argv[flags.userEmailAddress.name];
        if (!userEmailAddress) userEmailAddress = await promptUserEmailAddress(task, userEmailAddress);

        let deploymentName = argv[flags.namespace.name];
        if (!deploymentName) deploymentName = await promptNamespace(task, deploymentName);

        let deploymentClusters = argv[flags.deploymentClusters.name];
        if (!deploymentClusters) deploymentClusters = await promptDeploymentClusters(task, deploymentClusters);

        const deployments = {};
        deployments[deploymentName] = {
          clusterAliases: Templates.parseClusterAliases(deploymentClusters),
        };

        self.userEmailAddress = userEmailAddress;
        self.deployments = deployments;
        self.currentDeploymentName = deploymentName;
        self.validate();
        await self.write();

        return self;
      },
      self.skipPromptTask,
    ) as Task;
  }
}

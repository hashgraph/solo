// SPDX-License-Identifier: Apache-2.0

import {IsEmail, IsNotEmpty, IsObject, IsString, validateSync} from 'class-validator';
import fs from 'fs';
import * as yaml from 'yaml';
import {Flags as flags} from '../../commands/flags.js';
import {type Deployments, type LocalConfigData} from './local-config-data.js';
import {MissingArgumentError} from '../errors/MissingArgumentError.js';
import {SoloError} from '../errors/SoloError.js';
import {type SoloLogger} from '../logging.js';
import {IsClusterRefs, IsDeployments} from '../validator-decorators.js';
import {type ConfigManager} from '../config-manager.js';
import {type EmailAddress, type Version, type ClusterRefs, type ClusterRef} from './remote/types.js';
import {ErrorMessages} from '../error-messages.js';
import * as helpers from '../helpers.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type SoloListrTask} from '../../types/index.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';

@injectable()
export class LocalConfig implements LocalConfigData {
  @IsEmail(
    {},
    {
      message: ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL,
    },
  )
  userEmailAddress: EmailAddress;

  @IsString({message: ErrorMessages.LOCAL_CONFIG_INVALID_SOLO_VERSION})
  @IsNotEmpty({message: ErrorMessages.LOCAL_CONFIG_INVALID_SOLO_VERSION})
  soloVersion: Version;

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

  @IsClusterRefs({
    message: ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT,
  })
  @IsNotEmpty()
  public clusterRefs: ClusterRefs = {};

  private readonly skipPromptTask: boolean = false;

  public constructor(
    @inject(InjectTokens.LocalConfigFilePath) private readonly filePath?: string,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.filePath = patchInject(filePath, InjectTokens.LocalConfigFilePath, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);

    if (!this.filePath || this.filePath === '') throw new MissingArgumentError('a valid filePath is required');

    const allowedKeys = ['userEmailAddress', 'deployments', 'clusterRefs', 'soloVersion'];

    if (this.configFileExists()) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedConfig = yaml.parse(fileContent);
      this.logger.debug(`Parsed local config from ${filePath}: ${JSON.stringify(parsedConfig)}`);

      for (const key in parsedConfig) {
        if (!allowedKeys.includes(key)) {
          throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
        }
        this[key] = parsedConfig[key];
      }

      this.validate();
      this.skipPromptTask = true;
    } else {
      // Initialize empty config
      this.deployments = {};
      this.clusterRefs = {};
      this.soloVersion = helpers.getSoloVersion();
      this.userEmailAddress = 'john@doe.com';
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

  public setClusterRefs(clusterRefs: ClusterRefs): this {
    this.clusterRefs = clusterRefs;
    this.validate();
    return this;
  }

  public setSoloVersion(version: Version): this {
    this.soloVersion = version;
    this.validate();
    return this;
  }

  public configFileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  public async write(): Promise<void> {
    const yamlContent = yaml.stringify({
      userEmailAddress: this.userEmailAddress,
      deployments: this.deployments,
      clusterRefs: this.clusterRefs,
      soloVersion: this.soloVersion,
    });

    await fs.promises.writeFile(this.filePath, yamlContent);

    this.logger.info(`Wrote local config to ${this.filePath}: ${yamlContent}`);
  }

  public createLocalConfigTask(): SoloListrTask<{
    config: {
      quiet: boolean;
      userEmailAddress: EmailAddress;
      clusterRef: ClusterRef;
      contextName: string;
    };
  }> {
    const self = this;

    return {
      title: 'Prompt local configuration',
      skip: this.skipPromptTask,
      task: async (ctx, task): Promise<void> => {
        const config = ctx.config;

        if (self.configFileExists() && !config.userEmailAddress) {
          config.userEmailAddress = self.userEmailAddress;
        }

        if (!config.userEmailAddress) {
          if (config.quiet) throw new SoloError(ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL);
          config.userEmailAddress = await flags.userEmailAddress.prompt(task, config.userEmailAddress);
        }

        self.userEmailAddress = config.userEmailAddress;
        self.soloVersion = helpers.getSoloVersion();
        self.clusterRefs = {};
        self.deployments = {};

        self.validate();
        await self.write();
      },
    };
  }
}

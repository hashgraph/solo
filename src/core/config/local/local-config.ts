// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as yaml from 'yaml';
import {MissingArgumentError} from '../../errors/missing-argument-error.js';
import {SoloError} from '../../errors/solo-error.js';
import {type SoloLogger} from '../../logging/solo-logger.js';
import {ErrorMessages} from '../../error-messages.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {LocalConfigDataWrapper} from './local-config-data-wrapper.js';
import {
  type ClusterReferences,
  DeploymentName,
  type EmailAddress,
  Realm,
  Shard,
  type Version,
} from '../remote/types.js';
import {type Deployments} from './local-config-data.js';

@injectable()
export class LocalConfig {
  private localConfigData: LocalConfigDataWrapper;

  public constructor(
    @inject(InjectTokens.LocalConfigFilePath) private readonly filePath?: string,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.filePath = patchInject(filePath, InjectTokens.LocalConfigFilePath, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    if (!this.filePath || this.filePath === '') {
      throw new MissingArgumentError('a valid filePath is required');
    }

    if (this.configFileExists()) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedConfig = yaml.parse(fileContent);
      this.logger.debug(`Parsed local config from ${filePath}: ${JSON.stringify(parsedConfig)}`);

      for (const key in parsedConfig) {
        if (!LocalConfigDataWrapper.ALLOWED_KEYS.includes(key)) {
          throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
        }
      }

      this.localConfigData = new LocalConfigDataWrapper(
        parsedConfig.userEmailAddress,
        parsedConfig.soloVersion,
        parsedConfig.deployments,
        parsedConfig.clusterRefs,
      );
    }
  }

  /**
   * @returns the email address from the local config data if it's loaded
   * @throws SoloError if the config is not loaded
   */
  public get userEmailAddress(): EmailAddress {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_READING_BEFORE_LOADING);
    }
    return this.localConfigData.userEmailAddress;
  }

  /**
   * @returns the solo version from the local config data if it's loaded
   * @throws SoloError if the config is not loaded
   */
  public get soloVersion(): Version {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_READING_BEFORE_LOADING);
    }
    return this.localConfigData.soloVersion;
  }

  /**
   * @returns the deployment mapping from the local config data if it's loaded
   * @throws SoloError if the config is not loaded
   */
  public get deployments(): Readonly<Deployments> {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_READING_BEFORE_LOADING);
    }
    return this.localConfigData.deployments;
  }

  /**
   * @returns the cluster refs mapping from the local config data if it's loaded
   * @throws SoloError if the config is not loaded
   */
  public get clusterRefs(): Readonly<ClusterReferences> {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_READING_BEFORE_LOADING);
    }
    return this.localConfigData.clusterRefs;
  }

  /**
   * @returns the realm for the specified deployment
   * @param deployment
   * @throws SoloError if the deployment does not exist in the local config
   */
  public getRealm(deployment: DeploymentName): Realm {
    if (!this.deployments[deployment]) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_DEPLOYMENT_DOES_NOT_EXIST);
    }
    return this.deployments[deployment].realm;
  }

  /**
   * @returns the shard for the specified deployment
   * @param deployment
   * @throws SoloError if the deployment does not exist in the local config
   */
  public getShard(deployment: DeploymentName): Shard {
    if (!this.deployments[deployment]) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_DEPLOYMENT_DOES_NOT_EXIST);
    }
    return this.deployments[deployment].shard;
  }

  /**
   * Method is used to apply changes to the `local config`,
   * use the `callback` to modify the underlying values.
   * Handles checking prerequisites, validation and writing the file.
   * @param callback - callback function containing inside of the the data wrapper.
   *
   * @throws SoloError if the local config is not loaded prior to modifying.
   */
  public async modify(callback: (config: LocalConfigDataWrapper) => Promise<void>): Promise<void> {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_MODIFY_BEFORE_LOADING);
    }

    await callback(this.localConfigData);

    this.localConfigData.validate();

    await this.write();
  }

  /**
   * Checks if the local config exists at the specified file path
   */
  public configFileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  /**
   * Handles write operations to the local config,
   * writes the current version of the local config data wrapper
   * @throws SoloError
   */
  private async write(): Promise<void> {
    if (!this.isLoaded()) {
      throw new SoloError(ErrorMessages.LOCAL_CONFIG_WRITING_BEFORE_LOADING);
    }

    const yamlContent = yaml.stringify(this.localConfigData.toObject());

    fs.writeFileSync(this.filePath, yamlContent);

    this.logger.info(`Wrote local config to ${this.filePath}: ${yamlContent}`);
  }

  /**
   * Creates new instance of the local config, after validation writes it to the specified file path.
   * @param email - the user identification
   * @param soloVersion - the current solo version
   */
  public async create(email: EmailAddress, soloVersion: Version): Promise<void> {
    this.localConfigData = new LocalConfigDataWrapper(email, soloVersion, {}, {});
    this.localConfigData.validate();
    await this.write();
  }

  /**
   * @returns whether the local config is loaded
   */
  private isLoaded(): boolean {
    return !!this.localConfigData;
  }
}

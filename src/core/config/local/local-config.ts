// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import * as yaml from 'yaml';
import {MissingArgumentError} from '../../errors/missing-argument-error.js';
import {SoloError} from '../../errors/solo-error.js';
import {type SoloLogger} from '../../logging.js';
import {ErrorMessages} from '../../error-messages.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {LocalConfigDataWrapper} from './local-config-data-wrapper.js';
import type {ClusterRef, ClusterRefs, DeploymentName, EmailAddress, Version} from '../remote/types.js';
import type {Deployments} from './local-config-data.js';
import deepClone from 'deep-clone';

@injectable()
export class LocalConfig {
  private localConfigData: LocalConfigDataWrapper;

  public constructor(
    @inject(InjectTokens.LocalConfigFilePath) private readonly filePath?: string,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.filePath = patchInject(filePath, InjectTokens.LocalConfigFilePath, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    if (!this.filePath || this.filePath === '') throw new MissingArgumentError('a valid filePath is required');

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

  public get userEmailAddress(): EmailAddress {
    return this.localConfigData.userEmailAddress;
  }

  public get soloVersion(): Version {
    return this.localConfigData.soloVersion;
  }

  public get deployments(): Readonly<Deployments> {
    return this.localConfigData.deployments;
  }

  public get clusterRefs(): Readonly<ClusterRefs> {
    return this.localConfigData.clusterRefs;
  }

  public async modify(callback: (config: LocalConfigDataWrapper) => Promise<void>): Promise<void> {
    await callback(this.localConfigData);

    this.localConfigData.validate();

    await this.write();
  }

  public configFileExists(): boolean {
    return fs.existsSync(this.filePath);
  }

  private async write(): Promise<void> {
    if (!this.localConfigData) throw new SoloError('attempting to write to local config without loading it');

    const yamlContent = yaml.stringify(this.localConfigData.toObject());

    fs.writeFileSync(this.filePath, yamlContent);

    this.logger.info(`Wrote local config to ${this.filePath}: ${yamlContent}`);
  }

  public async create(email: EmailAddress, soloVersion: Version): Promise<void> {
    this.localConfigData = new LocalConfigDataWrapper(email, soloVersion, {}, {});
    this.localConfigData.validate();
    await this.write();
  }
}

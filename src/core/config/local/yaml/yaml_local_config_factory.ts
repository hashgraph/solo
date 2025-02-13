/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type LocalConfigFactory} from '../local_config_factory.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../dependency_injection/inject_tokens.js';
import {type SoloLogger} from '../../../logging.js';
import {type ConfigManager} from '../../../config_manager.js';
import {patchInject} from '../../../dependency_injection/container_helper.js';
import {MissingArgumentError} from '../../../errors.js';
import {type LocalConfig} from '../local_config.js';

@injectable()
export class YamlLocalConfigFactory implements LocalConfigFactory {
  public constructor(
    @inject(InjectTokens.LocalConfigFilePath) private readonly filePath?: string,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.filePath = patchInject(filePath, InjectTokens.LocalConfigFilePath, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);

    if (!this.filePath || this.filePath === '') {
      throw new MissingArgumentError('a valid filePath is required');
    }
  }

  async empty(): Promise<LocalConfig> {
    return null;
  }

  async load(): Promise<LocalConfig> {
    return null;
  }

  async loadOrEmpty(): Promise<LocalConfig> {
    return null;
  }
}

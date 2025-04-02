// SPDX-License-Identifier: Apache-2.0

import {type ClusterCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {CommandHandler} from '../../core/command-handler.js';
import {type LocalConfig} from '../../core/config/local/local-config.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type ClusterCommandConfigs} from './configs.js';
import {type ArgvStruct} from '../../types/aliases.js';

@injectable()
export class ClusterCommandHandlers extends CommandHandler {
  constructor(
    @inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.ClusterCommandConfigs) private readonly configs: ClusterCommandConfigs,
  ) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.ClusterCommandConfigs, this.constructor.name);
  }

  /**
   * - Setup home directory.
   * - Create new local config if needed.
   * - Add new 'cluster-ref => context' mapping in the local config.
   */
  public async connect(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.connectConfigBuilder.bind(this.configs)),
        this.tasks.validateClusterRefs(),
        this.tasks.testConnectionToCluster(),
        this.tasks.connectClusterRef(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster-ref connect',
      null,
    );

    return true;
  }

  public async disconnect(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.defaultConfigBuilder.bind(this.configs)),
        this.tasks.disconnectClusterRef(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster-ref disconnect',
      null,
    );

    return true;
  }

  public async list(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.NO_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.showClusterList()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster list',
      null,
    );

    return true;
  }

  public async info(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.initialize(argv, this.configs.defaultConfigBuilder.bind(this.configs)), this.tasks.getClusterInfo()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster info',
      null,
    );

    return true;
  }

  public async setup(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.SETUP_FLAGS);

    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs)),
          this.tasks.prepareChartValues(),
          this.tasks.installClusterChart(argv),
        ],
        {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        },
        'cluster setup',
        null,
      );
    } catch (error) {
      throw new SoloError('Error on cluster setup', error);
    }

    return true;
  }

  public async reset(argv: ArgvStruct): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.RESET_FLAGS);

    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.resetConfigBuilder.bind(this.configs)),
          this.tasks.acquireNewLease(),
          this.tasks.uninstallClusterChart(argv),
        ],
        {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        },
        'cluster reset',
        null,
      );
    } catch (error) {
      throw new SoloError('Error on cluster reset', error);
    }
    return true;
  }
}

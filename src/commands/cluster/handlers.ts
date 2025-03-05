/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {SoloError} from '../../core/errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {type K8Factory} from '../../core/kube/k8_factory.js';
import {CommandHandler} from '../../core/command_handler.js';
import {type LocalConfig} from '../../core/config/local_config.js';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';
import {type ClusterCommandConfigs} from './configs.js';

@injectable()
export class ClusterCommandHandlers extends CommandHandler {
  constructor(
    @inject(InjectTokens.ClusterCommandTasks) private readonly tasks: ClusterCommandTasks,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.ClusterCommandConfigs) private readonly configs: ClusterCommandConfigs,
  ) {
    super();

    this.tasks = patchInject(tasks, InjectTokens.ClusterCommandTasks, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.configs = patchInject(configs, InjectTokens.ClusterCommandConfigs, this.constructor.name);
  }

  /**
   * - Setup home directory.
   * - Create new local config if needed.
   * - Add new 'cluster-ref => context' mapping in the local config.
   */
  async connect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.connectConfigBuilder.bind(this)),
        this.setupHomeDirectoryTask(),
        this.localConfig.createLocalConfigTask(),
        this.tasks.validateClusterRefs(),
        this.tasks.connectClusterRef(),
        this.tasks.testConnectionToCluster(),
        this.tasks.saveLocalConfig(),
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

  async disconnect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    await this.commandAction(
      argv,
      [
        this.tasks.initialize(argv, this.configs.defaultConfigBuilder.bind(this)),
        this.tasks.disconnectClusterRef(),
        this.tasks.saveLocalConfig(),
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

  async list(argv: any) {
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

  async info(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    await this.commandAction(
      argv,
      [this.tasks.getClusterInfo()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster info',
      null,
    );

    return true;
  }

  async setup(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);
    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.setupConfigBuilder.bind(this.configs)),
          this.tasks.prepareChartValues(argv),
          this.tasks.installClusterChart(argv),
        ],
        {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        },
        'cluster setup',
        null,
      );
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster setup', e);
    }

    return true;
  }

  async reset(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);
    try {
      await this.commandAction(
        argv,
        [
          this.tasks.initialize(argv, this.configs.resetConfigBuilder.bind(this.configs)),
          this.tasks.acquireNewLease(argv),
          this.tasks.uninstallClusterChart(argv),
        ],
        {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        },
        'cluster reset',
        null,
      );
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster reset', e);
    }
    return true;
  }
}

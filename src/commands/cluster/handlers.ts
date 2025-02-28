/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type BaseCommand, type CommandHandlers} from '../base.js';
import {type ClusterCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {connectConfigBuilder, defaultConfigBuilder, resetConfigBuilder, setupConfigBuilder} from './configs.js';
import {SoloError} from '../../core/errors.js';

export class ClusterCommandHandlers implements CommandHandlers {
  readonly parent: BaseCommand;
  readonly tasks: ClusterCommandTasks;
  public readonly remoteConfigManager: RemoteConfigManager;
  private getConfig: any;

  constructor(parent: BaseCommand, tasks: ClusterCommandTasks, remoteConfigManager: RemoteConfigManager) {
    this.parent = parent;
    this.tasks = tasks;
    this.remoteConfigManager = remoteConfigManager;
    this.getConfig = parent.getConfig.bind(parent);
  }

  /**
   * - Setup home directory.
   * - Create new local config if needed.
   * - Add new 'cluster-ref => context' mapping in the local config.
   */
  async connect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, connectConfigBuilder.bind(this)),
        this.parent.setupHomeDirectoryTask(),
        this.parent.getLocalConfig().createLocalConfigTask(),
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

    await action(argv, this);
    return true;
  }

  async disconnect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, defaultConfigBuilder.bind(this)),
        this.tasks.disconnectClusterRef(),
        this.tasks.saveLocalConfig(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster disconnect',
      null,
    );

    await action(argv, this);
    return true;
  }

  async list(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.NO_FLAGS);

    const action = this.parent.commandActionBuilder(
      [this.tasks.showClusterList()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster list',
      null,
    );

    await action(argv, this);
    return true;
  }

  async info(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.DEFAULT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [this.tasks.initialize(argv, defaultConfigBuilder.bind(this)), this.tasks.getClusterInfo()],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster info',
      null,
    );

    await action(argv, this);
    return true;
  }

  async setup(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, setupConfigBuilder.bind(this)),
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

    try {
      await action(argv, this);
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster setup', e);
    }

    return true;
  }

  async reset(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, resetConfigBuilder.bind(this)),
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

    try {
      await action(argv, this);
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster reset', e);
    }
    return true;
  }
}

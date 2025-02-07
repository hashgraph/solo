/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type BaseCommand, type CommandHandlers} from '../base.js';
import {type ClusterCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {ListrRemoteConfig} from '../../core/config/remote/listr_config_tasks.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {connectConfigBuilder, resetConfigBuilder, setupConfigBuilder} from './configs.js';
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

  async connect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, connectConfigBuilder.bind(this)),
        this.parent.setupHomeDirectoryTask(),
        this.parent.getLocalConfig().promptLocalConfigTask(this.parent.getK8()),
        this.tasks.selectContext(),
        ListrRemoteConfig.loadRemoteConfig(this.parent, argv),
        this.tasks.readClustersFromRemoteConfig(argv),
        this.tasks.updateLocalConfig(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'cluster connect',
      null,
    );

    await action(argv, this);
    return true;
  }

  async list(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

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
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [this.tasks.getClusterInfo()],
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

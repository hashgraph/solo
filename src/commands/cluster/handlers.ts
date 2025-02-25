/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type BaseCommand, type CommandHandlers} from '../base.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {ListrRemoteConfig} from '../../core/config/remote/listr_config_tasks.js';
import {type RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {connectConfigBuilder, resetConfigBuilder, setupConfigBuilder} from './configs.js';
import {SoloError} from '../../core/errors.js';
import {type CommandFlag} from '../../types/flag_types.js';
import {type AnyArgv, type AnyObject} from '../../types/aliases.js';
import {type IClusterCommandHandlers} from './interfaces/tasks.js';
import {type IClusterCommandTasks} from './interfaces/handlers.js';

export class ClusterCommandHandlers implements CommandHandlers, IClusterCommandHandlers {
  public readonly parent: BaseCommand;
  public readonly tasks: IClusterCommandTasks;
  public readonly remoteConfigManager: RemoteConfigManager;
  public readonly getConfig: (configName: string, flags: CommandFlag[], extraProperties?: string[]) => AnyObject;

  public constructor(parent: BaseCommand, tasks: IClusterCommandTasks, remoteConfigManager: RemoteConfigManager) {
    this.parent = parent;
    this.tasks = tasks;
    this.remoteConfigManager = remoteConfigManager;
    this.getConfig = parent.getConfig.bind(parent);
  }

  public async connect(argv: AnyArgv): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, connectConfigBuilder.bind(this)),
        this.parent.setupHomeDirectoryTask(),
        this.parent.getLocalConfig().promptLocalConfigTask(this.parent.getK8Factory()),
        this.tasks.selectContext(),
        ListrRemoteConfig.loadRemoteConfig(this.parent, argv),
        this.tasks.readClustersFromRemoteConfig(),
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

  public async list(argv: AnyArgv): Promise<boolean> {
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

  public async info(argv: AnyArgv): Promise<boolean> {
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

  public async setup(argv: AnyArgv): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, setupConfigBuilder.bind(this)),
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

    try {
      await action(argv, this);
    } catch (e) {
      throw new SoloError('Error on cluster setup', e);
    }

    return true;
  }

  public async reset(argv: AnyArgv): Promise<boolean> {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.CONNECT_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, resetConfigBuilder.bind(this)),
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

    try {
      await action(argv, this);
    } catch (e) {
      throw new SoloError('Error on cluster reset', e);
    }
    return true;
  }
}

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
import {ClusterCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {ListrRemoteConfig} from '../../core/config/remote/listr_config_tasks.js';
import {RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {connectConfigBuilder, resetConfigBuilder, setupConfigBuilder} from './configs.js';
import {SoloError} from '../../core/errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/container_helper.js';
import {K8} from '../../core/k8.js';
import {CommandHandler} from '../../core/command_handler.js';
import {LocalConfig} from '../../core/config/local_config.js';
import {ChartManager} from '../../core/chart_manager.js';

@injectable()
export class ClusterCommandHandlers extends CommandHandler {
  constructor(
    @inject(ClusterCommandTasks) private readonly tasks: ClusterCommandTasks,
    @inject(RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(LocalConfig) private readonly localConfig: LocalConfig,
    @inject(K8) private readonly k8: K8,
    @inject(ChartManager) private readonly chartManager: ChartManager,
  ) {
    super();

    this.tasks = patchInject(tasks, ClusterCommandTasks, this.constructor.name);
    this.remoteConfigManager = patchInject(remoteConfigManager, RemoteConfigManager, this.constructor.name);
    this.k8 = patchInject(k8, K8, this.constructor.name);
    this.localConfig = patchInject(localConfig, LocalConfig, this.constructor.name);
    this.chartManager = patchInject(chartManager, ChartManager, this.constructor.name);
  }

  async connect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS);

    const action = this.commandActionBuilder(
      [
        this.tasks.initialize(argv, connectConfigBuilder.bind(this)),
        this.setupHomeDirectoryTask(),
        this.localConfig.promptLocalConfigTask(this.k8),
        this.tasks.selectContext(),
        ListrRemoteConfig.loadRemoteConfig(this.remoteConfigManager, argv),
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
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS);

    const action = this.commandActionBuilder(
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
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS);

    const action = this.commandActionBuilder(
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
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS);

    const action = this.commandActionBuilder(
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
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS);

    const action = this.commandActionBuilder(
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

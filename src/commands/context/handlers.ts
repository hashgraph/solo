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
import {type BaseCommand, type CommandHandlers} from '../base.js';
import {type ContextCommandTasks} from './tasks.js';
import * as helpers from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import * as ContextFlags from './flags.js';
import {RemoteConfigTasks} from '../../core/config/remote/remote_config_tasks.js';
import type {RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {connectConfigBuilder} from './configs.js';

export class ContextCommandHandlers implements CommandHandlers {
  readonly parent: BaseCommand;
  readonly tasks: ContextCommandTasks;
  public readonly remoteConfigManager: RemoteConfigManager;
  private getConfig: any;

  constructor(parent: BaseCommand, tasks: ContextCommandTasks, remoteConfigManager: RemoteConfigManager) {
    this.parent = parent;
    this.tasks = tasks;
    this.remoteConfigManager = remoteConfigManager;
    this.getConfig = parent.getConfig.bind(parent);
  }

  async connect(argv: any) {
    argv = helpers.addFlagsToArgv(argv, ContextFlags.USE_FLAGS);

    const action = this.parent.commandActionBuilder(
      [
        this.tasks.initialize(argv, connectConfigBuilder.bind(this)),
        this.parent.getLocalConfig().promptLocalConfigTask(this.parent.getK8()),
        this.tasks.selectContext(argv),
        RemoteConfigTasks.loadRemoteConfig.bind(this)(argv),
        // todo validate remoteConfig
        this.tasks.updateLocalConfig(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
      'context use',
      null,
    );

    await action(argv, this);
    return true;
  }
}

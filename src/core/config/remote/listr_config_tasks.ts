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
import type {ListrTask} from 'listr2';
import type {BaseCommand} from '../../../commands/base.js';
import {type Cluster, type Context, type Namespace} from './types.js';
import type {SoloListrTask} from '../../../types/index.js';

/**
 * Static class that handles all tasks related to remote config used by other commands.
 */
export class ListrRemoteConfig {
  /**
   * Prevents instantiation of this utility class.
   */
  private constructor() {
    throw new Error('This class cannot be instantiated');
  }

  /* ----------- Create and Load ----------- */

  /**
   * Loads the remote config from the config class and performs component validation.
   *
   * @param command - the BaseCommand object on which an action will be performed
   * @param argv - used to update the last executed command and command history
   */
  public static loadRemoteConfig(command: BaseCommand, argv: any): ListrTask<any, any, any> {
    return {
      title: 'Load remote config',
      task: async (_, task): Promise<void> => {
        await command.getRemoteConfigManager().loadAndValidate(argv);
      },
    };
  }

  /**
   * Create remoteConfig and save it to the provided cluster.
   * @param command
   * @param cluster
   * @param context
   * @param namespace
   */
  public static createRemoteConfig(
    command: BaseCommand,
    cluster: Cluster,
    context: Context,
    namespace: Namespace,
  ): ListrTask<any, any, any> {
    return {
      title: `Create remote config in cluster: ${cluster}`,
      task: async (_, task): Promise<void> => {
        await command.getRemoteConfigManager().createAndValidate(cluster, context, namespace);
      },
    };
  }

  /**
   * Create a remoteConfig object and save it to multiple clusters, read from ctx config
   *
   * @param command - the BaseCommand object on which an action will be performed
   */
  public static createRemoteConfigInMultipleClusters(command: BaseCommand): ListrTask<any, any, any> {
    return {
      title: 'Create remoteConfig in clusters',
      task: async (ctx, task) => {
        const subTasks: SoloListrTask<Context>[] = [];

        for (const context of Object.keys(ctx.config.contextCluster)) {
          const cluster = ctx.config.contextCluster[context];
          subTasks.push(ListrRemoteConfig.createRemoteConfig(command, cluster, context, ctx.config.namespace));
        }

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }
}

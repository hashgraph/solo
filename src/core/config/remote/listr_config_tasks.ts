/**
 * SPDX-License-Identifier: Apache-2.0
 */
import chalk from 'chalk';
import {type BaseCommand} from '../../../commands/base.js';
import {type Cluster, type Context} from './types.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyObject} from '../../../types/aliases.js';
import {type NamespaceName} from '../../kube/resources/namespace/namespace_name.js';

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
  public static loadRemoteConfig(command: BaseCommand, argv: {_: string[]} & AnyObject): SoloListrTask<any> {
    return {
      title: 'Load remote config',
      task: async (): Promise<void> => {
        await command.getRemoteConfigManager().loadAndValidate(argv);
      },
    };
  }

  /**
   * Create remoteConfig and save it to the provided cluster.
   */
  public static createRemoteConfig(
    command: BaseCommand,
    cluster: Cluster,
    context: Context,
    namespace: NamespaceName,
    argv: AnyObject,
  ): SoloListrTask<any> {
    return {
      title: `Create remote config in cluster: ${chalk.cyan(cluster)}`,
      task: async (): Promise<void> => {
        await command.getRemoteConfigManager().createAndValidate(cluster, context, namespace.name, argv);
      },
    };
  }

  /**
   * Create a remoteConfig object and save it to multiple clusters, read from ctx config
   *
   * @param command - the BaseCommand object on which an action will be performed
   * @param argv
   */
  public static createRemoteConfigInMultipleClusters(command: BaseCommand, argv: AnyObject): SoloListrTask<any> {
    return {
      title: 'Create remoteConfig in clusters',
      task: async (ctx, task) => {
        const subTasks: SoloListrTask<Context>[] = [];

        for (const cluster of command.localConfig.deployments[ctx.config.deployment].clusters) {
          const context = command.localConfig.clusterContextMapping?.[cluster];
          if (!context) continue;

          subTasks.push(ListrRemoteConfig.createRemoteConfig(command, cluster, context, ctx.config.namespace, argv));
        }

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }
}

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
import {Task} from '../../core/task.js';
import {Flags as flags} from '../flags.js';
import {splitFlagInput} from '../../core/helpers.js';
import {promptForContext, selectContextForFirstCluster} from './context-helpers.js';
import type {ListrTaskWrapper} from 'listr2';
import type {ConfigBuilder} from '../../types/aliases.js';
import type {BaseCommand} from '../base.js';
import type {SoloListrTaskWrapper} from '../../types/index.js';

export class ContextCommandTasks {
  private readonly parent: BaseCommand;

  constructor(parent) {
    this.parent = parent;
  }

  updateLocalConfig(argv) {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.info('Compare local and remote configuration...');
      const configManager = this.parent.getConfigManager();
      const k8 = this.parent.getK8();
      const isQuiet = configManager.getFlag(flags.quiet);

      await this.parent.getRemoteConfigManager().modify(async remoteConfig => {
        // Update current deployment with cluster list from remoteConfig
        const localConfig = this.parent.getLocalConfig();
        const localDeployments = localConfig.deployments;
        const remoteClusterList = [];
        for (const cluster of Object.keys(remoteConfig.clusters)) {
          if (localConfig.currentDeploymentName === remoteConfig.clusters[cluster]) {
            remoteClusterList.push(cluster);
          }
        }
        ctx.config.clusters = remoteClusterList;
        localDeployments[localConfig.currentDeploymentName].clusters = ctx.config.clusters;
        localConfig.setDeployments(localDeployments);

        const contexts = splitFlagInput(configManager.getFlag(flags.context));

        for (let i = 0; i < ctx.config.clusters.length; i++) {
          const cluster = ctx.config.clusters[i];
          const context = contexts[i];

          // If a context is provided use it to update the mapping
          if (context) {
            localConfig.clusterContextMapping[cluster] = context;
          } else if (!localConfig.clusterContextMapping[cluster]) {
            // In quiet mode use the currently selected context to update the mapping
            if (isQuiet) {
              localConfig.clusterContextMapping[cluster] = k8.getKubeConfig().getCurrentContext();
            }

            // Prompt the user to select a context if mapping value is missing
            else {
              localConfig.clusterContextMapping[cluster] = await promptForContext(task, cluster, k8);
            }
          }
        }
        this.parent.logger.info('Update local configuration...');
        await localConfig.write();
      });
    });
  }

  selectContext(argv) {
    return new Task('Read local configuration settings', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.info('Read local configuration settings...');
      const configManager = this.parent.getConfigManager();
      const isQuiet = configManager.getFlag<boolean>(flags.quiet);
      const deploymentName: string = configManager.getFlag(flags.namespace);
      let clusters = splitFlagInput(configManager.getFlag(flags.clusterName));
      const contexts = splitFlagInput(configManager.getFlag(flags.context));
      const localConfig = this.parent.getLocalConfig();
      const k8 = this.parent.getK8();
      let selectedContext: string;

      // If one or more contexts are provided, use the first one
      if (contexts.length) {
        selectedContext = contexts[0];
      }

      // If one or more clusters are provided, use the first one to determine the context
      // from the mapping in the LocalConfig
      else if (clusters.length) {
        selectedContext = await selectContextForFirstCluster(task, clusters, localConfig, isQuiet, k8);
      }

      // If a deployment name is provided, get the clusters associated with the deployment from the LocalConfig
      // and select the context from the mapping, corresponding to the first deployment cluster
      else if (deploymentName) {
        const deployment = localConfig.deployments[deploymentName];

        if (deployment && deployment.clusters.length) {
          selectedContext = await selectContextForFirstCluster(task, deployment.clusters, localConfig, isQuiet, k8);
        }

        // The provided deployment does not exist in the LocalConfig
        else {
          // Add the deployment to the LocalConfig with the currently selected cluster and context in KubeConfig
          if (isQuiet) {
            selectedContext = k8.getKubeConfig().getCurrentContext();
            const selectedCluster = k8.getKubeConfig().getCurrentCluster().name;
            localConfig.deployments[deploymentName] = {
              clusters: [selectedCluster],
            };

            if (!localConfig.clusterContextMapping[selectedCluster]) {
              localConfig.clusterContextMapping[selectedCluster] = selectedContext;
            }
          }

          // Prompt user for clusters and contexts
          else {
            clusters = splitFlagInput(await flags.clusterName.prompt(task, clusters));

            for (const cluster of clusters) {
              if (!localConfig.clusterContextMapping[cluster]) {
                localConfig.clusterContextMapping[cluster] = await promptForContext(task, cluster, k8);
              }
            }

            selectedContext = localConfig.clusterContextMapping[clusters[0]];
          }
        }
      }

      k8.getKubeConfig().setCurrentContext(selectedContext);
    });
  }

  initialize(argv: any, configInit: ConfigBuilder) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return new Task('Initialize', async (ctx: any, task: SoloListrTaskWrapper<any>) => {
      if (argv[flags.devMode.name]) {
        this.parent.logger.setDevMode(true);
      }

      ctx.config = await configInit(argv, ctx, task);
    });
  }
}

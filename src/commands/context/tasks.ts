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
import {Templates} from '../../core/templates.js';
import {Flags as flags} from '../flags.js';
import type {ListrTaskWrapper} from 'listr2';
import type {ConfigBuilder} from '../../types/aliases.js';
import {type BaseCommand} from '../base.js';

export class ContextCommandTasks {
  private readonly parent: BaseCommand;

  constructor(parent) {
    this.parent = parent;
  }

  updateLocalConfig(argv) {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.info('Compare local and remote configuration...');
      const configManager = this.parent.getConfigManager();
      const isQuiet = configManager.getFlag(flags.quiet);

      await this.parent.getRemoteConfigManager().modify(async remoteConfig => {
        const localConfig = this.parent.getLocalConfig();
        const localDeployments = localConfig.deployments;
        ctx.config.clusters = Object.keys(remoteConfig.clusters);
        localDeployments[localConfig.currentDeploymentName].clusters = ctx.config.clusters;
        localConfig.setDeployments(localDeployments);

        const contexts = Templates.parseCommaSeparatedList(configManager.getFlag(flags.context));

        for (let i = 0; i < ctx.config.clusters.length; i++) {
          const cluster = ctx.config.clusters[i];
          const context = contexts[i];

          // If a context is provided use it to update the mapping
          if (context) {
            localConfig.clusterContextMapping[cluster] = context;
          }

          // In quiet mode use the currently selected context to update the mapping
          else if (isQuiet) {
            //default
            localConfig.clusterContextMapping[cluster] = this.parent.getK8().getKubeConfig().getCurrentContext();
          }

          // Prompt the user to select a context if mapping value is missing
          else if (!localConfig.clusterContextMapping[cluster]) {
            const kubeContexts = this.parent.getK8().getContexts();
            localConfig.clusterContextMapping[cluster] = await flags.context.prompt(
              task,
              kubeContexts.map(c => c.name),
              cluster,
            );
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
      const isQuiet = configManager.getFlag(flags.quiet);
      const deploymentName: string = configManager.getFlag(flags.namespace);
      let clusters = Templates.parseCommaSeparatedList(configManager.getFlag(flags.clusterName));
      const contexts = Templates.parseCommaSeparatedList(configManager.getFlag(flags.context));
      let selectedContext;

      // If one or more contexts are provided use the first one
      if (contexts.length) {
        selectedContext = contexts[0];
      }

      // If one or more clusters are provided use the first one to determine the context
      // from the mapping in the LocalConfig
      else if (clusters.length) {
        const selectedCluster = clusters[0];
        const localConfig = this.parent.getLocalConfig();

        if (localConfig.clusterContextMapping[selectedCluster]) {
          selectedContext = localConfig.clusterContextMapping[selectedCluster];
        }

        // If cluster does not exist in LocalConfig mapping prompt the user to select a context or use the current one
        else {
          if (isQuiet) {
            selectedContext = this.parent.getK8().getKubeConfig().getCurrentContext();
          } else {
            const kubeContexts = this.parent.getK8().getContexts();
            selectedContext = await flags.context.prompt(
              task,
              kubeContexts.map(c => c.name),
              selectedCluster,
            );
            localConfig.clusterContextMapping[selectedCluster] = selectedContext;
          }
        }
      }

      // If a deployment name is provided get the clusters associated with the deployment from the LocalConfig
      // and select the context from the mapping, corresponding to the first deployment cluster
      else if (deploymentName) {
        const localConfig = this.parent.getLocalConfig();
        const deployment = localConfig.deployments[deploymentName];

        if (deployment && deployment.clusters.length) {
          const selectedCluster = deployment.clusters[0];
          selectedContext = localConfig.clusterContextMapping[selectedCluster];
        }

        // The provided deployment does not exist in the LocalConfig
        else {
          // Add the deployment to the LocalConfig with the currently selected cluster and context in KubeConfig
          if (isQuiet) {
            selectedContext = this.parent.getK8().getKubeConfig().getCurrentContext();
            const selectedCluster = this.parent.getK8().getKubeConfig().getCurrentCluster().name;
            localConfig.deployments[deploymentName] = {
              clusters: [selectedCluster],
            };

            if (!localConfig.clusterContextMapping[selectedCluster]) {
              localConfig.clusterContextMapping[selectedCluster] = selectedContext;
            }
          }

          // Prompt user for clusters and contexts
          else {
            clusters = Templates.parseCommaSeparatedList(await flags.clusterName.prompt(task, clusters));

            const kubeContexts = this.parent.getK8().getContexts();
            for (const cluster of clusters) {
              if (!localConfig.clusterContextMapping[cluster]) {
                localConfig.clusterContextMapping[cluster] = await flags.context.prompt(
                  task,
                  kubeContexts.map(c => c.name),
                  cluster,
                );
              }
            }

            selectedContext = localConfig.clusterContextMapping[clusters[0]];
          }
        }
      }

      this.parent.getK8().getKubeConfig().setCurrentContext(selectedContext);
    });
  }

  initialize(argv: any, configInit: ConfigBuilder) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return new Task('Initialize', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      if (argv[flags.devMode.name]) {
        this.parent.logger.setDevMode(true);
      }

      ctx.config = await configInit(argv, ctx, task);
    });
  }
}

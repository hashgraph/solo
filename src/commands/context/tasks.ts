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
import type {ConfigBuilder} from "../../types/aliases.js";
import {BaseCommand} from "../base.js";

export class ContextCommandTasks {
  private readonly parent: BaseCommand;

  constructor(parent) {
    this.parent = parent;
  }

    updateLocalConfig(argv) {
        return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
            this.parent.logger.info('Compare local and remote configuration...');

            await this.parent.getRemoteConfigManager().modify(async remoteConfig => {
                const localConfig = this.parent.getLocalConfig()
                const localDeployments = localConfig.deployments
                ctx.config.clusters = Object.keys(remoteConfig.clusters)
                localDeployments[localConfig.currentDeploymentName].clusters = ctx.config.clusters
                localConfig.setDeployments(localDeployments)
            });

            this.parent.logger.info('Update local configuration...');
            const {currentDeploymentName, contextName, clusters} = ctx.config;
            this.parent.logger.info(
                `Save LocalConfig file: [currentDeploymentName: ${currentDeploymentName}, contextName: ${contextName}, clusters: ${clusters.join(' ')}]`,
            );
            await this.parent.getLocalConfig().write();
        })
    }

  readLocalConfig(argv) {
    return new Task('Read local configuration settings', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.info('Read local configuration settings...');
      const isQuiet = !!ctx.config.quiet;

      let currentDeploymentName = ctx.config.namespace;
      let clusters = Templates.parseClusterAliases(ctx.config.clusterName);
      let contextName = ctx.config.context;

      const kubeContexts = await this.parent.getK8().getContexts();

      if (isQuiet) {
        const currentCluster = await this.parent.getK8().getKubeConfig().getCurrentCluster();
        if (!clusters.length) clusters = [currentCluster.name];
        if (!contextName) contextName = await this.parent.getK8().getKubeConfig().getCurrentContext();

        if (!currentDeploymentName) {
          const selectedContext = kubeContexts.find(e => e.name === contextName);
          currentDeploymentName = selectedContext && selectedContext.namespace ? selectedContext.namespace : 'default';
        }
      } else {
        if (!clusters.length) {
          const unparsedClusterAliases = await flags.clusterName.prompt(task, clusters);
          clusters = Templates.parseClusterAliases(unparsedClusterAliases);
        }
        if (!contextName) {
          contextName = await flags.context.prompt(
            task,
            kubeContexts.map(c => c.name),
          );
        }
        if (!currentDeploymentName) {
          currentDeploymentName = await flags.namespace.prompt(task, currentDeploymentName);
        }
      }

      // Select current deployment
      this.parent.getLocalConfig().setCurrentDeployment(currentDeploymentName);

      // Set clusters for active deployment
      const deployments = this.parent.getLocalConfig().deployments;
      deployments[currentDeploymentName].clusters = clusters;
      this.parent.getLocalConfig().setDeployments(deployments);

      this.parent.getK8().getKubeConfig().setCurrentContext(contextName);


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

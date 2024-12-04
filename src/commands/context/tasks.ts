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
import {Task, Templates} from '../../core/index.js';
import * as flags from '../flags.js';
import type {ListrTaskWrapper} from 'listr2';
import {BaseCommand} from '../base.js';
import {CommandTasks} from "../../types/index.js";
import {autoInjectable} from "tsyringe-neo";

@autoInjectable()
export class ContextCommandTasks extends BaseCommand implements CommandTasks {
  public tasks: any

  constructor(private readonly promptMap?: Map<string, Function>) {
    super()
    this.promptMap = promptMap;
    this.tasks = [
        this.updateLocalConfig,
        this.initialize
    ]
  }

  updateLocalConfig(argv) {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.logger.info('Updating local configuration...');

      const isQuiet = !!argv[flags.quiet.name];

      let currentDeploymentName = argv[flags.namespace.name];
      let clusterAliases = Templates.parseClusterAliases(argv[flags.clusterName.name]);
      let contextName = argv[flags.context.name];

      const kubeContexts = await this.getK8().getContexts();

      if (isQuiet) {
        const currentCluster = await this.getK8().getKubeConfig().getCurrentCluster();
        if (!clusterAliases.length) clusterAliases = [currentCluster.name];
        if (!contextName) contextName = await this.getK8().getKubeConfig().getCurrentContext();

        if (!currentDeploymentName) {
          const selectedContext = kubeContexts.find(e => e.name === contextName);
          currentDeploymentName = selectedContext && selectedContext.namespace ? selectedContext.namespace : 'default';
        }
      } else {
        if (!clusterAliases.length) {
          const prompt = this.promptMap.get(flags.clusterName.name);
          const unparsedClusterAliases = await prompt(task, clusterAliases);
          clusterAliases = Templates.parseClusterAliases(unparsedClusterAliases);
        }
        if (!contextName) {
          const prompt = this.promptMap.get(flags.context.name);
          contextName = await prompt(
            task,
            kubeContexts.map(c => c.name),
            contextName,
          );
        }
        if (!currentDeploymentName) {
          const prompt = this.promptMap.get(flags.namespace.name);
          currentDeploymentName = await prompt(task, currentDeploymentName);
        }
      }

      // Select current deployment
      this.getLocalConfig().setCurrentDeployment(currentDeploymentName);

      // Set clusters for active deployment
      const deployments = this.getLocalConfig().deployments;
      deployments[currentDeploymentName].clusterAliases = clusterAliases;
      this.getLocalConfig().setDeployments(deployments);

      this.getK8().getKubeConfig().setCurrentContext(contextName);

      this.logger.info(
        `Save LocalConfig file: [currentDeploymentName: ${currentDeploymentName}, contextName: ${contextName}, clusterAliases: ${clusterAliases.join(' ')}]`,
      );
      await this.getLocalConfig().write();
    });
  }

  initialize(argv: any) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return new Task('Initialize', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      if (argv[flags.devMode.name]) {
        this.logger.setDevMode(true);
      }
    });
  }
}

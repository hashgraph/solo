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
import {
  Task
} from '../../core/index.ts'
import * as flags from '../flags.ts'
import type { ListrTaskWrapper } from 'listr2'
import {BaseCommand} from "../base.js";
import {promptContext, promptDeploymentClusters, promptNamespace} from "../prompts.js";

export class ContextCommandTasks {

  private readonly parent: BaseCommand

  constructor (parent) {
    this.parent = parent
  }

  updateLocalConfig (argv) {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.info('Updating local configuration...')

      const isQuiet = !!argv[flags.quiet.name]
      const isForcing = !!argv[flags.force.name]

      let currentDeploymentName = argv[flags.namespace.name]
      let clusterAliases = argv[flags.clusterName.name]?.split(',')
      let contextName = argv[flags.context.name]

      if (isQuiet) {
        const currentCluster = (await this.parent.getK8().getKubeConfig().getCurrentCluster()).name
        if (!clusterAliases) clusterAliases = [currentCluster]
        if (!contextName) contextName = await this.parent.getK8().getKubeConfig().getCurrentContext()

        // TODO properly get the active namespace
        if (!currentDeploymentName) currentDeploymentName = currentCluster
      }
      else {
        if (!clusterAliases) clusterAliases = await promptDeploymentClusters(task, clusterAliases)
        if (!contextName) contextName = await promptContext(task, contextName)
        if (!currentDeploymentName) currentDeploymentName = await promptNamespace(task, currentDeploymentName)
      }

      if (isForcing) {
        const userClusterName = clusterAliases[0]
        let savedClusterName
        for (const [cluster, context] of Object.entries(this.parent.getLocalConfig().clusterMappings)) {
          if (context === contextName) {
            savedClusterName = cluster;
          }
        }

        if (savedClusterName !== userClusterName) {
          // Overwrite the key in the clusterMapping object for the
          // corresponding context with the one specified in the CLI
          this.parent.getLocalConfig().clusterMappings[userClusterName] = contextName
          delete this.parent.getLocalConfig().clusterMappings[savedClusterName]
        }
      }

      // Select current deployment
      this.parent.getLocalConfig().setCurrentDeployment(currentDeploymentName)

      // Set clusters for active deployment
      const deployments = this.parent.getLocalConfig().deployments
      deployments[currentDeploymentName].clusterAliases = clusterAliases
      this.parent.getLocalConfig().setDeployments(deployments)

      this.parent.getK8().getKubeConfig().setCurrentContext(contextName)

      this.parent.logger.info(`Save LocalConfig file`)
      await this.parent.getLocalConfig().write()
    })
  }

  initialize (argv: any) {
    const { requiredFlags, optionalFlags } = argv

    argv.flags = [
      ...requiredFlags,
      ...optionalFlags
    ]

    return new Task('Initialize', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      if (argv[flags.devMode.name]) {
        this.parent.logger.setDevMode(true)
      }
    })
  }
}

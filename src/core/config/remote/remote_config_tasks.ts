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
import {ConsensusNodeComponent} from './components/consensus_node_component.js';
import {EnvoyProxyComponent} from './components/envoy_proxy_component.js';
import {HaProxyComponent} from './components/ha_proxy_component.js';
import {ConsensusNodeStates} from './enumerations.js';

import type {ListrTask} from 'listr2';
import type {BaseCommand} from '../../../commands/base.js';
import type {NetworkCommand} from '../../../commands/network.js';
import type {DeploymentCommand} from '../../../commands/deployment.js';

/**
 * Static class that handles all tasks related to remote config used by other commands.
 */
export class RemoteConfigTasks {
  /* ----------- Create and Load ----------- */

  /**
   * Loads the remote config from the config class.
   *
   * @param argv - used to update the last executed command and command history
   */
  public static loadRemoteConfig(this: BaseCommand, argv: any): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildLoadTask(argv);
  }

  /** Creates remote config. */
  public static createRemoteConfig(this: DeploymentCommand): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildCreateTask();
  }

  /* ----------- Component Modifying ----------- */

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public static addNodesAndProxies(this: NetworkCommand): ListrTask<any, any, any> {
    return {
      title: 'Add node and proxies to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        const {
          config: {namespace, nodeAliases},
        } = ctx;
        const cluster = this.remoteConfigManager.currentCluster;

        await this.remoteConfigManager.modify(async remoteConfig => {
          for (const nodeAlias of nodeAliases) {
            remoteConfig.components.add(
              nodeAlias,
              new ConsensusNodeComponent(nodeAlias, cluster, namespace, ConsensusNodeStates.INITIALIZED),
            );

            remoteConfig.components.add(
              `envoy-${nodeAlias}`,
              new EnvoyProxyComponent(`envoy-${nodeAlias}`, cluster, namespace),
            );

            remoteConfig.components.add(
              `haproxy-${nodeAlias}`,
              new HaProxyComponent(`haproxy-${nodeAlias}`, cluster, namespace),
            );
          }
        });
      },
    };
  }
}

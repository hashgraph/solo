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
  ConsensusNodeComponent, EnvoyProxyComponent, HaProxyComponent, MirrorNodeComponent, RelayComponent
} from './components/index.ts'
import { ComponentTypeEnum, ConsensusNodeStates } from './enumerations.ts'

import type { RelayCommand } from '../../../commands/relay.ts'
import type { ListrTask } from 'listr2'
import type { MirrorNodeCommand } from '../../../commands/mirror_node.ts'
import type { NetworkCommand } from '../../../commands/network.ts'
import type { NodeAliases } from '../../../types/aliases.ts'
import type { NodeCommandHandlers } from '../../../commands/node/handlers.ts'
import type { BaseCommand } from '../../../commands/base.ts'
import type { DeploymentCommand } from '../../../commands/deployment.ts'

/**
 * Static class that handles all tasks used by other commands
 */
export class RemoteConfigTasks {

  /* ----------- Create and Load ----------- */

  public static loadRemoteConfig (this: BaseCommand, argv: any): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildLoadTask(argv)
  }

  public static createRemoteConfig (this: DeploymentCommand): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildCreateTask()
  }

  /* ----------- Component Modifying ----------- */

  public static addRelayComponent (this: RelayCommand): ListrTask<any, any, any> {
    return {
      title: 'Add relay component in remote config',
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          const { config: { namespace, nodeAliases } } = ctx
          const cluster = this.remoteConfigManager.currentCluster

          remoteConfig.components.add(
            'relay',
            new RelayComponent('relay', cluster, namespace, nodeAliases)
          )
        })
      }
    }
  }

  public static removeRelayComponent (this: RelayCommand): ListrTask<any, any, any> {
    return {
      title: 'Remove relay component from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          remoteConfig.components.remove('relay', ComponentTypeEnum.Relay)
        })
      }
    }
  }

  public static addMirrorNodeAndMirrorNodeToExplorer (this: MirrorNodeCommand): ListrTask<any, any, any> {
    return {
      title: 'Add mirror node and mirror node explorer to remote config',
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          const { config: { namespace } } = ctx
          const cluster = this.remoteConfigManager.currentCluster

          remoteConfig.components.add(
            'mirrorNode',
            new MirrorNodeComponent('mirrorNode', cluster, namespace)
          )

          remoteConfig.components.add(
            'mirrorNodeExplorer',
            new MirrorNodeComponent('mirrorNodeExplorer', cluster, namespace)
          )
        })
      }
    }
  }

  public static removeMirrorNodeAndMirrorNodeToExplorer (this: MirrorNodeCommand): ListrTask<any, any, any> {
    return {
      title: 'Remove mirror node and mirror node explorer from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          remoteConfig.components.remove('mirrorNode', ComponentTypeEnum.MirrorNode)

          remoteConfig.components.remove('mirrorNodeExplorer', ComponentTypeEnum.MirrorNode)
        })
      }
    }
  }

  public static addNodesAndProxies (this: NetworkCommand): ListrTask<any, any, any> {
    return {
      title: 'Add node and proxies to remote config',
      task: async (ctx): Promise<void> => {
        const { config: { namespace, nodeAliases } } = ctx
        const cluster = this.remoteConfigManager.currentCluster

        await this.remoteConfigManager.modify(async (remoteConfig) => {
          for (const nodeAlias of nodeAliases) {
            remoteConfig.components.add(
              nodeAlias,
              new ConsensusNodeComponent(nodeAlias, cluster, namespace, ConsensusNodeStates.INITIALIZED)
            )

            remoteConfig.components.add(
              `envoy-${nodeAlias}`,
              new EnvoyProxyComponent(`envoy-${nodeAlias}`, cluster, namespace)
            )

            remoteConfig.components.add(
              `haproxy-${nodeAlias}`,
              new HaProxyComponent(`haproxy-${nodeAlias}`, cluster, namespace)
            )
          }
        })
      }
    }
  }

  public static changeAllNodeStates (this: NodeCommandHandlers, state: ConsensusNodeStates): ListrTask<any, any, any> {
    return {
      title: `Change node state to ${state} in remote config`,
      task: async (ctx: { config: { namespace: string, nodeAliases: NodeAliases } }): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          const { config: { namespace, nodeAliases } } = ctx
          const cluster = this.remoteConfigManager.currentCluster

          for (const nodeAlias of nodeAliases) {
            remoteConfig.components.edit(
              nodeAlias,
              new ConsensusNodeComponent(nodeAlias, cluster, namespace, state)
            )
          }
        })
      }
    }
  }

  public static removeNodeAndProxies (this: NodeCommandHandlers): ListrTask<any, any, any> {
    return {
      title: 'Remove node and proxies from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          remoteConfig.components.remove('Consensus node name', ComponentTypeEnum.ConsensusNode)
          remoteConfig.components.remove('Envoy proxy name', ComponentTypeEnum.EnvoyProxy)
          remoteConfig.components.remove('HaProxy name', ComponentTypeEnum.HaProxy)
        })
      }
    }
  }
}
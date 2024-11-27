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
  RelayComponent, HaProxyComponent, EnvoyProxyComponent, MirrorNodeComponent, ConsensusNodeComponent,
} from './components/index.js'
import { ComponentType, ConsensusNodeStates } from './enumerations.js'
import chalk from 'chalk'
import { SoloError } from '../../errors.js'

import type { Listr, ListrTask } from 'listr2'
import type { NodeAliases } from '../../../types/aliases.js'
import type { BaseCommand } from '../../../commands/base.js'
import type { RelayCommand } from '../../../commands/relay.js'
import type { NetworkCommand } from '../../../commands/network.js'
import type { DeploymentCommand } from '../../../commands/deployment.js'
import type { MirrorNodeCommand } from '../../../commands/mirror_node.js'
import type { NodeCommandHandlers } from '../../../commands/node/handlers.js'

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
  public static loadRemoteConfig (this: BaseCommand, argv: any): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildLoadTask(argv)
  }

  /** Creates remote config. */
  public static createRemoteConfig (this: DeploymentCommand): ListrTask<any, any, any> {
    return this.remoteConfigManager.buildCreateTask()
  }

  /* ----------- Component Modifying ----------- */

  /** Adds the relay component to remote config. */
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

  /** Remove the relay component from remote config. */
  public static removeRelayComponent (this: RelayCommand): ListrTask<any, any, any> {
    return {
      title: 'Remove relay component from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          remoteConfig.components.remove('relay', ComponentType.Relay)
        })
      }
    }
  }

  /** Adds the mirror node and mirror node explorer components to remote config. */
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

  /** Removes the mirror node and mirror node explorer components from remote config. */
  public static removeMirrorNodeAndMirrorNodeToExplorer (this: MirrorNodeCommand): ListrTask<any, any, any> {
    return {
      title: 'Remove mirror node and mirror node explorer from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          remoteConfig.components.remove('mirrorNode', ComponentType.MirrorNode)

          remoteConfig.components.remove('mirrorNodeExplorer', ComponentType.MirrorNode)
        })
      }
    }
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
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

  /** Removes the consensus node, envoy and haproxy components from remote config.  */
  public static removeNodeAndProxies (this: NodeCommandHandlers): ListrTask<any, any, any> {
    return {
      title: 'Remove node and proxies from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig) => {
          remoteConfig.components.remove('Consensus node name', ComponentType.ConsensusNode)
          remoteConfig.components.remove('Envoy proxy name', ComponentType.EnvoyProxy)
          remoteConfig.components.remove('HaProxy name', ComponentType.HaProxy)
        })
      }
    }
  }

  /**
   * Changes the state from all consensus nodes components in remote config.
   *
   * @param state - to which to change the consensus node component
   */
  public static changeAllNodeStates (this: NodeCommandHandlers, state: ConsensusNodeStates): ListrTask<any, any, any> {
    interface Context { config: { namespace: string, nodeAliases: NodeAliases } }

    return {
      title: `Change node state to ${state} in remote config`,
      task: async (ctx: Context): Promise<void> => {
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

  /**
   * Creates tasks to validate that each node state is one of the accepted states.
   *
   * @param acceptedStates - the state at which the nodes can be, not matching any of the states throws and error
   */
  public static validateAllNodeStates (
    this: NodeCommandHandlers,
    acceptedStates: ConsensusNodeStates[]
  ): ListrTask<any, any, any> {
    interface Context { config: { namespace: string, nodeAliases: NodeAliases } }

    return {
      title: 'Validate nodes states',
      task: async (ctx: Context, task): Promise<Listr<any, any, any>> => {
        const { config: { namespace, nodeAliases } } = ctx
        const components = this.remoteConfigManager.components

        const subTasks: ListrTask<Context, any, any>[] = []

        for (const nodeAlias of nodeAliases) {
          subTasks.push({
            title: `Validating state for node ${nodeAlias}`,
            task: async (_, task): Promise<void> => {
              let nodeComponent: ConsensusNodeComponent
              try {
                nodeComponent = components.getComponent<ConsensusNodeComponent>(
                  ComponentType.ConsensusNode,
                  nodeAlias
                )
              } catch (e) {
                throw new SoloError(`${nodeAlias} not found in remote config for namespace ${namespace}`)
              }

              if (!acceptedStates.includes(nodeComponent.state)) {
                const errorMessageData =
                  `accepted states: ${acceptedStates.join(', ')}, ` +
                  `current state: ${nodeComponent.state}`

                throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData)
              }

              task.title = `${task.title} - ${chalk.green('valid state')}: ${chalk.cyan(nodeComponent.state)}`
            }
          })
        }

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: { collapseSubtasks: false }
        })
      }
    }
  }
}
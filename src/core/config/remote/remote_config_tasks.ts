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
import {RelayComponent} from './components/relay_component.js';
import {ConsensusNodeComponent} from './components/consensus_node_component.js';
import {EnvoyProxyComponent} from './components/envoy_proxy_component.js';
import {HaProxyComponent} from './components/ha_proxy_component.js';
import {ComponentType, ConsensusNodeStates} from './enumerations.js';
import chalk from 'chalk';
import {SoloError} from '../../errors.js';

import type {Listr, ListrTask} from 'listr2';
import type {NodeAlias, NodeAliases} from '../../../types/aliases.js';
import type {BaseCommand} from '../../../commands/base.js';
import type {RelayCommand} from '../../../commands/relay.js';
import type {NetworkCommand} from '../../../commands/network.js';
import type {DeploymentCommand} from '../../../commands/deployment.js';
import type {NodeCommandHandlers} from '../../../commands/node/handlers.js';
import type {Optional} from '../../../types/index.js';
import {type ComponentsDataWrapper} from './components_data_wrapper.js';

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

  /** Adds the relay component to remote config. */
  public static addRelayComponent(this: RelayCommand): ListrTask<any, any, any> {
    return {
      title: 'Add relay component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, nodeAliases},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          remoteConfig.components.add('relay', new RelayComponent('relay', cluster, namespace, nodeAliases));
        });
      },
    };
  }

  /** Remove the relay component from remote config. */
  public static removeRelayComponent(this: RelayCommand): ListrTask<any, any, any> {
    return {
      title: 'Remove relay component from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('relay', ComponentType.Relay);
        });
      },
    };
  }

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

  /** Removes the consensus node, envoy and haproxy components from remote config.  */
  public static removeNodeAndProxies(this: NodeCommandHandlers): ListrTask<any, any, any> {
    return {
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      title: 'Remove node and proxies from remote config',
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('Consensus node name', ComponentType.ConsensusNode);
          remoteConfig.components.remove('Envoy proxy name', ComponentType.EnvoyProxy);
          remoteConfig.components.remove('HaProxy name', ComponentType.HaProxy);
        });
      },
    };
  }

  /**
   * Changes the state from all consensus nodes components in remote config.
   *
   * @param state - to which to change the consensus node component
   */
  public static changeAllNodeStates(this: NodeCommandHandlers, state: ConsensusNodeStates): ListrTask<any, any, any> {
    interface Context {
      config: {namespace: string; nodeAliases: NodeAliases};
    }

    return {
      title: `Change node state to ${state} in remote config`,
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx: Context): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, nodeAliases},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          for (const nodeAlias of nodeAliases) {
            remoteConfig.components.edit(nodeAlias, new ConsensusNodeComponent(nodeAlias, cluster, namespace, state));
          }
        });
      },
    };
  }

  /**
   * Creates tasks to validate that each node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedStates - the state at which the nodes can be, not matching any of the states throws an error
   * @param excludedStates - the state at which the nodes can't be, matching any of the states throws an error
   */
  public static validateAllNodeStates(
    this: NodeCommandHandlers,
    {acceptedStates, excludedStates}: {acceptedStates?: ConsensusNodeStates[]; excludedStates?: ConsensusNodeStates[]},
  ): ListrTask<any, any, any> {
    interface Context {
      config: {namespace: string; nodeAliases: NodeAliases};
    }

    return {
      title: 'Validate nodes states',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (ctx: Context, task): Listr<any, any, any> => {
        const nodeAliases = ctx.config.nodeAliases;

        const components = this.remoteConfigManager.components;

        const subTasks: ListrTask<Context, any, any>[] = nodeAliases.map(nodeAlias => ({
          title: `Validating state for node ${nodeAlias}`,
          task: (_, task): void => {
            const state = RemoteConfigTasks.validateNodeState(nodeAlias, components, acceptedStates, excludedStates);

            task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
          },
        }));

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  /**
   * Creates tasks to validate that specific node state is either one of the accepted states or not one of the excluded.
   *
   * @param acceptedStates - the state at which the node can be, not matching any of the states throws an error
   * @param excludedStates - the state at which the node can't be, matching any of the states throws an error
   */
  public static validateSingleNodeState(
    this: NodeCommandHandlers,
    {acceptedStates, excludedStates}: {acceptedStates?: ConsensusNodeStates[]; excludedStates?: ConsensusNodeStates[]},
  ): ListrTask<any, any, any> {
    interface Context {
      config: {namespace: string; nodeAlias: NodeAlias};
    }

    return {
      title: 'Validate nodes state',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (ctx: Context, task): void => {
        const nodeAlias = ctx.config.nodeAlias;

        task.title += ` ${nodeAlias}`;

        const components = this.remoteConfigManager.components;

        const state = RemoteConfigTasks.validateNodeState(nodeAlias, components, acceptedStates, excludedStates);

        task.title += ` - ${chalk.green('valid state')}: ${chalk.cyan(state)}`;
      },
    };
  }

  /**
   * @param nodeAlias - the alias of the node whose state to validate
   * @param components - the component data wrapper
   * @param acceptedStates - the state at which the node can be, not matching any of the states throws an error
   * @param excludedStates - the state at which the node can't be, matching any of the states throws an error
   */
  private static validateNodeState(
    nodeAlias: NodeAlias,
    components: ComponentsDataWrapper,
    acceptedStates: Optional<ConsensusNodeStates[]>,
    excludedStates: Optional<ConsensusNodeStates[]>,
  ): ConsensusNodeStates {
    let nodeComponent: ConsensusNodeComponent;
    try {
      nodeComponent = components.getComponent<ConsensusNodeComponent>(ComponentType.ConsensusNode, nodeAlias);
    } catch (e) {
      throw new SoloError(`${nodeAlias} not found in remote config`);
    }

    if (acceptedStates && !acceptedStates.includes(nodeComponent.state)) {
      const errorMessageData =
        `accepted states: ${acceptedStates.join(', ')}, ` + `current state: ${nodeComponent.state}`;

      throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    }

    if (excludedStates && excludedStates.includes(nodeComponent.state)) {
      const errorMessageData =
        `excluded states: ${excludedStates.join(', ')}, ` + `current state: ${nodeComponent.state}`;

      throw new SoloError(`${nodeAlias} has invalid state - ` + errorMessageData);
    }

    return nodeComponent.state;
  }
}

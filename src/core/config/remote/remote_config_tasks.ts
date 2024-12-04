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
  RelayComponent,
  HaProxyComponent,
  EnvoyProxyComponent,
  MirrorNodeComponent,
  ConsensusNodeComponent,
  MirrorNodeExplorerComponent,
} from './components/index.js';
import {ComponentType, ConsensusNodeStates} from './enumerations.js';
import chalk from 'chalk';
import {SoloError} from '../../errors.js';

import type {Listr} from 'listr2';
import type {NodeAlias} from '../../../types/aliases.js';
import type {BaseCommand} from '../../../commands/base.js';
import type {RelayCommand} from '../../../commands/relay.js';
import type {NetworkCommand} from '../../../commands/network.js';
import type {DeploymentCommand} from '../../../commands/deployment.js';
import type {MirrorNodeCommand} from '../../../commands/mirror_node.js';
import type {NodeCommandHandlers} from '../../../commands/node/handlers.js';
import type {EmptyContextConfig, Optional, SoloListrTask} from '../../../types/index.js';
import type {ComponentsDataWrapper} from './components_data_wrapper.js';
import type {
  ValidateStatesObject,
  AddRelayComponentContext,
  AddNodesAndProxiesContext,
  ChangeAllNodeStatesContext,
  ValidateAllNodeStatesContext,
  ValidateSingleNodeStateContext,
  AddMirrorNodeComponentsContext,
} from './types.js';
import {Templates} from '../../templates.js';

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
  public static loadRemoteConfig(this: BaseCommand, argv: any): SoloListrTask<EmptyContextConfig> {
    return this.remoteConfigManager.buildLoadTask(argv);
  }

  /** Creates remote config. */
  public static createRemoteConfig(this: DeploymentCommand): SoloListrTask<EmptyContextConfig> {
    return this.remoteConfigManager.buildCreateTask();
  }

  /* ----------- Component Modifying ----------- */

  /** Adds the relay component to remote config. */
  public static addRelayComponent(this: RelayCommand): SoloListrTask<AddRelayComponentContext> {
    return {
      title: 'Add relay component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, nodeAliases},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          const component = new RelayComponent('relay', cluster, namespace, nodeAliases);

          remoteConfig.components.add('relay', component);
        });
      },
    };
  }

  /** Remove the relay component from remote config. */
  public static removeRelayComponent(this: RelayCommand): SoloListrTask<EmptyContextConfig> {
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

  /** Adds the mirror node and mirror node explorer components to remote config. */
  public static addMirrorNodeComponents(this: MirrorNodeCommand): SoloListrTask<AddMirrorNodeComponentsContext> {
    return {
      title: 'Add mirror node and mirror node explorer to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, deployHederaExplorer},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          try {
            const component = new MirrorNodeComponent('mirrorNode', cluster, namespace);

            remoteConfig.components.add('mirrorNode', component);
          } catch (e) {
            throw new SoloError('Mirror node component already exists', e);
          }

          // Add a mirror node explorer component to remote config only if the flag is enabled
          if (!deployHederaExplorer) return;

          try {
            const component = new MirrorNodeExplorerComponent('mirrorNodeExplorer', cluster, namespace);

            remoteConfig.components.add('mirrorNodeExplorer', component);
          } catch (e) {
            throw new SoloError('Mirror node explorer component already exists', e);
          }
        });
      },
    };
  }

  /** Removes the mirror node and mirror node explorer components from remote config. */
  public static removeMirrorNodeComponents(this: MirrorNodeCommand): SoloListrTask<EmptyContextConfig> {
    return {
      title: 'Remove mirror node and mirror node explorer from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('mirrorNode', ComponentType.MirrorNode);

          try {
            remoteConfig.components.remove('mirrorNodeExplorer', ComponentType.MirrorNode);
          } catch {
            // When the mirror node explorer component is not deployed,
            // error is thrown since is not found, in this case ignore it
          }
        });
      },
    };
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public static addNodesAndProxies(this: NetworkCommand): SoloListrTask<AddNodesAndProxiesContext> {
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

            const envoyProxyName = Templates.renderEnvoyProxyName(nodeAlias);

            remoteConfig.components.add(envoyProxyName, new EnvoyProxyComponent(envoyProxyName, cluster, namespace));

            const haProxyName = Templates.renderHaProxyName(nodeAlias);

            remoteConfig.components.add(haProxyName, new HaProxyComponent(haProxyName, cluster, namespace));
          }
        });
      },
    };
  }

  /** Removes the consensus node, envoy and haproxy components from remote config.  */
  public static removeNodeAndProxies(this: NodeCommandHandlers): SoloListrTask<EmptyContextConfig> {
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
  public static changeAllNodeStates(
    this: NodeCommandHandlers,
    state: ConsensusNodeStates,
  ): SoloListrTask<ChangeAllNodeStatesContext> {
    return {
      title: `Change node state to ${state} in remote config`,
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace, nodeAliases},
          } = ctx;

          const cluster = this.remoteConfigManager.currentCluster;

          for (const nodeAlias of nodeAliases) {
            const component = new ConsensusNodeComponent(nodeAlias, cluster, namespace, state);

            remoteConfig.components.edit(nodeAlias, component);
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
    {acceptedStates, excludedStates}: ValidateStatesObject,
  ): SoloListrTask<ValidateAllNodeStatesContext> {
    return {
      title: 'Validate nodes states',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (ctx, task): Listr<ValidateAllNodeStatesContext> => {
        const nodeAliases = ctx.config.nodeAliases;

        const components = this.remoteConfigManager.components;

        const subTasks: SoloListrTask<ValidateAllNodeStatesContext>[] = nodeAliases.map(nodeAlias => ({
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
    {acceptedStates, excludedStates}: ValidateStatesObject,
  ): SoloListrTask<ValidateSingleNodeStateContext> {
    return {
      title: 'Validate nodes state',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: (ctx, task): void => {
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
      throw new SoloError(`${nodeAlias} not found in remote config`, e);
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

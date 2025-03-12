// SPDX-License-Identifier: Apache-2.0

import {ComponentType, ConsensusNodeStates} from './enumerations.js';
import {SoloError} from '../../errors/SoloError.js';
import {BaseComponent} from './components/base_component.js';
import {RelayComponent} from './components/relay_component.js';
import {HaProxyComponent} from './components/ha_proxy_component.js';
import {MirrorNodeComponent} from './components/mirror_node_component.js';
import {EnvoyProxyComponent} from './components/envoy_proxy_component.js';
import {ConsensusNodeComponent} from './components/consensus_node_component.js';
import {MirrorNodeExplorerComponent} from './components/mirror_node_explorer_component.js';
import {
  type ClusterRef,
  type Component,
  type ComponentName,
  type ComponentsDataStructure,
  type IConsensusNodeComponent,
  type IRelayComponent,
  type NamespaceNameAsString,
} from './types.js';
import {type ToObject, type Validate} from '../../../types/index.js';
import {Templates} from '../../templates.js';
import {type NodeAliases} from '../../../types/aliases.js';

/**
 * Represent the components in the remote config and handles:
 * - CRUD operations on the components.
 * - Validation.
 * - Conversion FROM and TO plain object.
 */
export class ComponentsDataWrapper implements Validate, ToObject<ComponentsDataStructure> {
  /**
   * @param relays - Relay record mapping service name to relay components
   * @param haProxies - HA Proxies record mapping service name to ha proxies components
   * @param mirrorNodes - Mirror Nodes record mapping service name to mirror nodes components
   * @param envoyProxies - Envoy Proxies record mapping service name to envoy proxies components
   * @param consensusNodes - Consensus Nodes record mapping service name to consensus nodes components
   * @param mirrorNodeExplorers - Mirror Node Explorers record mapping service name to mirror node explorers components
   */
  private constructor(
    public readonly relays: Record<ComponentName, RelayComponent> = {},
    public readonly haProxies: Record<ComponentName, HaProxyComponent> = {},
    public readonly mirrorNodes: Record<ComponentName, MirrorNodeComponent> = {},
    public readonly envoyProxies: Record<ComponentName, EnvoyProxyComponent> = {},
    public readonly consensusNodes: Record<ComponentName, ConsensusNodeComponent> = {},
    public readonly mirrorNodeExplorers: Record<ComponentName, MirrorNodeExplorerComponent> = {},
  ) {
    this.validate();
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public add(component: BaseComponent): void {
    const self = this;

    const serviceName = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', null, BaseComponent);
    }

    function addComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (self.exists(components, component)) {
        throw new SoloError('Component exists', null, component.toObject());
      }
      components[serviceName] = component;
    }

    self.applyCallbackToComponentGroup(component.type, serviceName, addComponentCallback);
  }

  /** Used to edit an existing component from their respective group. */
  public edit(component: BaseComponent): void {
    const self = this;

    const serviceName = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }
    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', null, BaseComponent);
    }

    function editComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (!components[serviceName]) {
        throw new SoloError(`Component doesn't exist, name: ${serviceName}`, null, {component});
      }
      components[serviceName] = component;
    }

    self.applyCallbackToComponentGroup(component.type, serviceName, editComponentCallback);
  }

  /** Used to remove specific component from their respective group. */
  public remove(serviceName: ComponentName, type: ComponentType): void {
    const self = this;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }
    if (!Object.values(ComponentType).includes(type)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    function deleteComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (!components[serviceName]) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to remove`);
      }
      delete components[serviceName];
    }

    self.applyCallbackToComponentGroup(type, serviceName, deleteComponentCallback);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseComponent>(type: ComponentType, serviceName: ComponentName): T {
    let component: T;

    function getComponentCallback(components: Record<ComponentName, BaseComponent>): void {
      if (!components[serviceName]) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to read`);
      }

      component = components[serviceName] as T;
    }

    this.applyCallbackToComponentGroup(type, serviceName, getComponentCallback);

    return component;
  }

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup(
    type: ComponentType,
    serviceName: ComponentName,
    callback: (components: Record<ComponentName, BaseComponent>) => void,
  ): void {
    switch (type) {
      case ComponentType.Relay:
        callback(this.relays);
        break;
      case ComponentType.HaProxy:
        callback(this.haProxies);
        break;
      case ComponentType.MirrorNode:
        callback(this.mirrorNodes);
        break;
      case ComponentType.EnvoyProxy:
        callback(this.envoyProxies);
        break;
      case ComponentType.ConsensusNode:
        callback(this.consensusNodes);
        break;
      case ComponentType.MirrorNodeExplorer:
        callback(this.mirrorNodeExplorers);
        break;
      default:
        throw new SoloError(`Unknown component type ${type}, service name: ${serviceName}`);
    }

    this.validate();
  }

  /**
   * Handles creating instance of the class from plain object.
   *
   * @param components - component groups distinguished by their type.
   */
  public static fromObject(components: ComponentsDataStructure): ComponentsDataWrapper {
    const relays: Record<ComponentName, RelayComponent> = {};
    const haProxies: Record<ComponentName, HaProxyComponent> = {};
    const mirrorNodes: Record<ComponentName, MirrorNodeComponent> = {};
    const envoyProxies: Record<ComponentName, EnvoyProxyComponent> = {};
    const consensusNodes: Record<ComponentName, ConsensusNodeComponent> = {};
    const mirrorNodeExplorers: Record<ComponentName, MirrorNodeExplorerComponent> = {};

    Object.entries(components).forEach(
      ([type, components]: [ComponentType, Record<ComponentName, Component>]): void => {
        switch (type) {
          case ComponentType.Relay:
            Object.entries(components).forEach(([name, component]: [ComponentName, IRelayComponent]): void => {
              relays[name] = RelayComponent.fromObject(component);
            });
            break;

          case ComponentType.HaProxy:
            Object.entries(components).forEach(([name, component]: [ComponentName, Component]): void => {
              haProxies[name] = HaProxyComponent.fromObject(component);
            });
            break;

          case ComponentType.MirrorNode:
            Object.entries(components).forEach(([name, component]: [ComponentName, Component]): void => {
              mirrorNodes[name] = MirrorNodeComponent.fromObject(component);
            });
            break;

          case ComponentType.EnvoyProxy:
            Object.entries(components).forEach(([name, component]: [ComponentName, Component]): void => {
              envoyProxies[name] = EnvoyProxyComponent.fromObject(component);
            });
            break;

          case ComponentType.ConsensusNode:
            Object.entries(components).forEach(([name, component]: [ComponentName, IConsensusNodeComponent]): void => {
              consensusNodes[name] = ConsensusNodeComponent.fromObject(component);
            });
            break;

          case ComponentType.MirrorNodeExplorer:
            Object.entries(components).forEach(([name, component]: [ComponentName, Component]): void => {
              mirrorNodeExplorers[name] = MirrorNodeExplorerComponent.fromObject(component);
            });
            break;

          default:
            throw new SoloError(`Unknown component type ${type}`);
        }
      },
    );

    return new ComponentsDataWrapper(relays, haProxies, mirrorNodes, envoyProxies, consensusNodes, mirrorNodeExplorers);
  }

  /** Used to create an empty instance used to keep the constructor private */
  public static initializeEmpty(): ComponentsDataWrapper {
    return new ComponentsDataWrapper();
  }

  public static initializeWithNodes(
    nodeAliases: NodeAliases,
    clusterRef: ClusterRef,
    namespace: NamespaceNameAsString,
  ): ComponentsDataWrapper {
    const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> = {};

    nodeAliases.forEach(nodeAlias => {
      consensusNodeComponents[nodeAlias] = new ConsensusNodeComponent(
        nodeAlias,
        clusterRef,
        namespace,
        ConsensusNodeStates.NON_DEPLOYED,
        Templates.nodeIdFromNodeAlias(nodeAlias),
      );
    });

    return new ComponentsDataWrapper(undefined, undefined, undefined, undefined, consensusNodeComponents, undefined);
  }

  /** checks if component exists in the respective group */
  private exists(components: Record<ComponentName, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components).some(component => BaseComponent.compare(component, newComponent));
  }

  public validate(): void {
    function testComponentsObject(components: Record<ComponentName, BaseComponent>, expectedInstance: any): void {
      Object.entries(components).forEach(([name, component]: [ComponentName, BaseComponent]): void => {
        if (!name || typeof name !== 'string') {
          throw new SoloError(`Invalid component service name ${{[name]: component?.constructor?.name}}`);
        }

        if (!(component instanceof expectedInstance)) {
          throw new SoloError(
            `Invalid component type, service name: ${name}, ` +
              `expected ${expectedInstance?.name}, actual: ${component?.constructor?.name}`,
            null,
            {component},
          );
        }
      });
    }

    testComponentsObject(this.relays, RelayComponent);
    testComponentsObject(this.haProxies, HaProxyComponent);
    testComponentsObject(this.mirrorNodes, MirrorNodeComponent);
    testComponentsObject(this.envoyProxies, EnvoyProxyComponent);
    testComponentsObject(this.consensusNodes, ConsensusNodeComponent);
    testComponentsObject(this.mirrorNodeExplorers, MirrorNodeExplorerComponent);
  }

  public toObject(): ComponentsDataStructure {
    function transform(components: Record<ComponentName, BaseComponent>): Record<ComponentName, Component> {
      const transformedComponents: Record<ComponentName, Component> = {};

      Object.entries(components).forEach(([name, component]: [ComponentName, BaseComponent]): void => {
        transformedComponents[name] = component.toObject() as Component;
      });

      return transformedComponents;
    }

    return {
      [ComponentType.Relay]: transform(this.relays),
      [ComponentType.HaProxy]: transform(this.haProxies),
      [ComponentType.MirrorNode]: transform(this.mirrorNodes),
      [ComponentType.EnvoyProxy]: transform(this.envoyProxies),
      [ComponentType.ConsensusNode]: transform(this.consensusNodes),
      [ComponentType.MirrorNodeExplorer]: transform(this.mirrorNodeExplorers),
    };
  }

  public clone(): ComponentsDataWrapper {
    const data = this.toObject();

    return ComponentsDataWrapper.fromObject(data);
  }
}

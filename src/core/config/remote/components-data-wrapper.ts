// SPDX-License-Identifier: Apache-2.0

import {ComponentType, ConsensusNodeStates} from './enumerations.js';
import {SoloError} from '../../errors/solo-error.js';
import {BaseComponent} from './components/base-component.js';
import {RelayComponent} from './components/relay-component.js';
import {HaProxyComponent} from './components/ha-proxy-component.js';
import {MirrorNodeComponent} from './components/mirror-node-component.js';
import {EnvoyProxyComponent} from './components/envoy-proxy-component.js';
import {ConsensusNodeComponent} from './components/consensus-node-component.js';
import {MirrorNodeExplorerComponent} from './components/mirror-node-explorer-component.js';
import {
  type ClusterReference,
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
import {type CloneTrait} from '../../../types/traits/clone-trait.js';
import {BlockNodeComponent} from './components/block-node-component.js';

/**
 * Represent the components in the remote config and handles:
 * - CRUD operations on the components.
 * - Validation.
 * - Conversion FROM and TO plain object.
 */
export class ComponentsDataWrapper
  implements Validate, ToObject<ComponentsDataStructure>, CloneTrait<ComponentsDataWrapper>
{
  private constructor(
    public readonly relays: Record<ComponentName, RelayComponent> = {},
    public readonly haProxies: Record<ComponentName, HaProxyComponent> = {},
    public readonly mirrorNodes: Record<ComponentName, MirrorNodeComponent> = {},
    public readonly envoyProxies: Record<ComponentName, EnvoyProxyComponent> = {},
    public readonly consensusNodes: Record<ComponentName, ConsensusNodeComponent> = {},
    public readonly mirrorNodeExplorers: Record<ComponentName, MirrorNodeExplorerComponent> = {},
    public readonly blockNodes: Record<ComponentName, BlockNodeComponent> = {},
  ) {
    this.validate();
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public add(component: BaseComponent): void {
    const serviceName: string = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent);
    }

    const addComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = (components): void => {
      if (this.exists(components, component)) {
        throw new SoloError('Component exists', undefined, component.toObject());
      }
      components[serviceName] = component;
    };

    this.applyCallbackToComponentGroup(component.type, serviceName, addComponentCallback);
  }

  /** Used to edit an existing component from their respective group. */
  public edit(component: BaseComponent): void {
    const serviceName: string = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }
    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent);
    }

    const editComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = (components): void => {
      if (!components[serviceName]) {
        throw new SoloError(`Component doesn't exist, name: ${serviceName}`, undefined, {component});
      }
      components[serviceName] = component;
    };

    this.applyCallbackToComponentGroup(component.type, serviceName, editComponentCallback);
  }

  /** Used to remove specific component from their respective group. */
  public remove(serviceName: ComponentName, type: ComponentType): void {
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

    this.applyCallbackToComponentGroup(type, serviceName, deleteComponentCallback);
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
      case ComponentType.Relay: {
        callback(this.relays);
        break;
      }
      case ComponentType.HaProxy: {
        callback(this.haProxies);
        break;
      }
      case ComponentType.MirrorNode: {
        callback(this.mirrorNodes);
        break;
      }
      case ComponentType.EnvoyProxy: {
        callback(this.envoyProxies);
        break;
      }
      case ComponentType.ConsensusNode: {
        callback(this.consensusNodes);
        break;
      }
      case ComponentType.MirrorNodeExplorer: {
        callback(this.mirrorNodeExplorers);
        break;
      }
      default: {
        throw new SoloError(`Unknown component type ${type}, service name: ${serviceName}`);
      }
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

    for (const [type, subComponents] of Object.entries(components)) {
      switch (type) {
        case ComponentType.Relay: {
          for (const [name, component] of Object.entries(subComponents)) {
            relays[name] = RelayComponent.fromObject(component as IRelayComponent);
          }
          break;
        }

        case ComponentType.HaProxy: {
          for (const [name, component] of Object.entries(subComponents)) {
            haProxies[name] = HaProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentType.MirrorNode: {
          for (const [name, component] of Object.entries(subComponents)) {
            mirrorNodes[name] = MirrorNodeComponent.fromObject(component);
          }
          break;
        }

        case ComponentType.EnvoyProxy: {
          for (const [name, component] of Object.entries(subComponents)) {
            envoyProxies[name] = EnvoyProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentType.ConsensusNode: {
          for (const [name, component] of Object.entries(subComponents)) {
            consensusNodes[name] = ConsensusNodeComponent.fromObject(component as IConsensusNodeComponent);
          }
          break;
        }

        case ComponentType.MirrorNodeExplorer: {
          for (const [name, component] of Object.entries(subComponents)) {
            mirrorNodeExplorers[name] = MirrorNodeExplorerComponent.fromObject(component);
          }
          break;
        }

        default: {
          throw new SoloError(`Unknown component type ${type}`);
        }
      }
    }

    return new ComponentsDataWrapper(relays, haProxies, mirrorNodes, envoyProxies, consensusNodes, mirrorNodeExplorers);
  }

  /** Used to create an empty instance used to keep the constructor private */
  public static initializeEmpty(): ComponentsDataWrapper {
    return new ComponentsDataWrapper();
  }

  public static initializeWithNodes(
    nodeAliases: NodeAliases,
    clusterReference: ClusterReference,
    namespace: NamespaceNameAsString,
  ): ComponentsDataWrapper {
    const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> = {};

    for (const nodeAlias of nodeAliases) {
      consensusNodeComponents[nodeAlias] = new ConsensusNodeComponent(
        nodeAlias,
        clusterReference,
        namespace,
        ConsensusNodeStates.NON_DEPLOYED,
        Templates.nodeIdFromNodeAlias(nodeAlias),
      );
    }

    return new ComponentsDataWrapper(undefined, undefined, undefined, undefined, consensusNodeComponents, undefined);
  }

  /** checks if component exists in the respective group */
  private exists(components: Record<ComponentName, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components).some(component => BaseComponent.compare(component, newComponent));
  }

  public validate(): void {
    function testComponentsObject(components: Record<ComponentName, BaseComponent>, expectedInstance: any): void {
      for (const [name, component] of Object.entries(components)) {
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
      }
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

      for (const [name, component] of Object.entries(components)) {
        transformedComponents[name] = component.toObject() as Component;
      }

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

  public clone() {
    const data = this.toObject();

    return ComponentsDataWrapper.fromObject(data);
  }
}

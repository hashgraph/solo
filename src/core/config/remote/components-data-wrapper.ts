// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {BaseComponent} from './components/base-component.js';
import {RelayComponent} from './components/relay-component.js';
import {HaProxyComponent} from './components/ha-proxy-component.js';
import {BlockNodeComponent} from './components/block-node-component.js';
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
import {ComponentTypes} from './enumerations/component-types.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {ComponentStates} from './enumerations/component-states.js';

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
  public addNewComponent(component: BaseComponent): void {
    const serviceName: string = component.name;

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent);
    }

    const addComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = (components): void => {
      if (this.checkComponentExists(components, component)) {
        throw new SoloError('Component exists', undefined, component.toObject());
      }
      components[serviceName] = component;
    };

    this.applyCallbackToComponentGroup(component.type, serviceName, addComponentCallback);
  }

  /** Used to edit an existing component from their respective group. */
  public editComponent(component: BaseComponent): void {
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
  public disableComponent(serviceName: ComponentName, type: ComponentTypes): void {
    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`);
    }

    if (!Object.values(ComponentTypes).includes(type)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    const disableComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = (components): void => {
      if (!components[serviceName]) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to remove`);
      }
      components[serviceName].state = ComponentStates.DELETED;
    };

    this.applyCallbackToComponentGroup(type, serviceName, disableComponentCallback);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseComponent>(type: ComponentTypes, serviceName: ComponentName): T {
    let component: T;

    const getComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = (components): void => {
      if (!components[serviceName]) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to read`);
      }
      component = components[serviceName] as T;
    };

    this.applyCallbackToComponentGroup(type, serviceName, getComponentCallback);

    return component;
  }

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup(
    componentType: ComponentTypes,
    serviceName: ComponentName,
    callback: (components: Record<ComponentName, BaseComponent>) => void,
  ): void {
    switch (componentType) {
      case ComponentTypes.Relay: {
        callback(this.relays);
        break;
      }

      case ComponentTypes.HaProxy: {
        callback(this.haProxies);
        break;
      }

      case ComponentTypes.MirrorNode: {
        callback(this.mirrorNodes);
        break;
      }

      case ComponentTypes.EnvoyProxy: {
        callback(this.envoyProxies);
        break;
      }

      case ComponentTypes.ConsensusNode: {
        callback(this.consensusNodes);
        break;
      }

      case ComponentTypes.MirrorNodeExplorer: {
        callback(this.mirrorNodeExplorers);
        break;
      }

      case ComponentTypes.BlockNode: {
        callback(this.blockNodes);
        break;
      }

      default: {
        throw new SoloError(`Unknown component type ${componentType}, service name: ${serviceName}`);
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
    const blockNodes: Record<ComponentName, BlockNodeComponent> = {};

    for (const [componentType, subComponents] of Object.entries(components)) {
      switch (componentType) {
        case ComponentTypes.Relay: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            relays[serviceName] = RelayComponent.fromObject(component as IRelayComponent);
          }
          break;
        }

        case ComponentTypes.HaProxy: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            haProxies[serviceName] = HaProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.MirrorNode: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            mirrorNodes[serviceName] = MirrorNodeComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.EnvoyProxy: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            envoyProxies[serviceName] = EnvoyProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.ConsensusNode: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            consensusNodes[serviceName] = ConsensusNodeComponent.fromObject(component as IConsensusNodeComponent);
          }
          break;
        }

        case ComponentTypes.MirrorNodeExplorer: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            mirrorNodeExplorers[serviceName] = MirrorNodeExplorerComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.BlockNode: {
          for (const [serviceName, component] of Object.entries(subComponents)) {
            blockNodes[serviceName] = BlockNodeComponent.fromObject(component);
          }
          break;
        }

        default: {
          throw new SoloError(`Unknown component type ${componentType}`);
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
        ComponentStates.ACTIVE,
        ConsensusNodeStates.NON_DEPLOYED,
        Templates.nodeIdFromNodeAlias(nodeAlias),
      );
    }

    return new ComponentsDataWrapper(undefined, undefined, undefined, undefined, consensusNodeComponents);
  }

  /** checks if component exists in the respective group */
  private checkComponentExists(components: Record<ComponentName, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components).some((component): boolean => BaseComponent.compare(component, newComponent));
  }

  /** Validates that the component group mapping has only components from the expected instance */
  private validateComponentTypes(components: Record<ComponentName, BaseComponent>, expectedInstance: any): void {
    for (const [serviceName, component] of Object.entries(components)) {
      if (!serviceName || typeof serviceName !== 'string') {
        throw new SoloError(`Invalid component service name ${{[serviceName]: component?.constructor?.name}}`);
      }

      if (!(component instanceof expectedInstance)) {
        throw new SoloError(
          `Invalid component type, service name: ${serviceName}, ` +
            `expected ${expectedInstance?.name}, actual: ${component?.constructor?.name}`,
          undefined,
          {component},
        );
      }
    }
  }

  public validate(): void {
    this.validateComponentTypes(this.relays, RelayComponent);
    this.validateComponentTypes(this.haProxies, HaProxyComponent);
    this.validateComponentTypes(this.mirrorNodes, MirrorNodeComponent);
    this.validateComponentTypes(this.envoyProxies, EnvoyProxyComponent);
    this.validateComponentTypes(this.consensusNodes, ConsensusNodeComponent);
    this.validateComponentTypes(this.mirrorNodeExplorers, MirrorNodeExplorerComponent);
    this.validateComponentTypes(this.blockNodes, BlockNodeComponent);
  }

  private transformComponentGroupToObject(
    components: Record<ComponentName, BaseComponent>,
  ): Record<ComponentName, Component> {
    const transformedComponents: Record<ComponentName, Component> = {};

    for (const [serviceName, component] of Object.entries(components)) {
      transformedComponents[serviceName] = component.toObject() as Component;
    }

    return transformedComponents;
  }

  public toObject(): ComponentsDataStructure {
    return {
      [ComponentTypes.Relay]: this.transformComponentGroupToObject(this.relays),
      [ComponentTypes.HaProxy]: this.transformComponentGroupToObject(this.haProxies),
      [ComponentTypes.MirrorNode]: this.transformComponentGroupToObject(this.mirrorNodes),
      [ComponentTypes.EnvoyProxy]: this.transformComponentGroupToObject(this.envoyProxies),
      [ComponentTypes.ConsensusNode]: this.transformComponentGroupToObject(this.consensusNodes),
      [ComponentTypes.MirrorNodeExplorer]: this.transformComponentGroupToObject(this.mirrorNodeExplorers),
      [ComponentTypes.BlockNode]: this.transformComponentGroupToObject(this.blockNodes),
    };
  }

  public clone(): ComponentsDataWrapper {
    const data: ComponentsDataStructure = this.toObject();

    return ComponentsDataWrapper.fromObject(data);
  }
}

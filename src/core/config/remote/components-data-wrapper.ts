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
} from './types.js';
import {type ToObject, type Validate} from '../../../types/index.js';
import {type NodeAliases} from '../../../types/aliases.js';
import {type CloneTrait} from '../../../types/traits/clone-trait.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {ComponentStates} from './enumerations/component-states.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {isValidEnum} from '../../util/validation-helpers.js';

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
    const componentName: string = component.name;

    if (!componentName || typeof componentName !== 'string') {
      throw new SoloError(`Component name is required ${componentName}`);
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent);
    }

    const addComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = components => {
      if (this.checkComponentExists(components, component)) {
        throw new SoloError('Component exists', undefined, component.toObject());
      }
      components[componentName] = component;
    };

    this.applyCallbackToComponentGroup(component.type, addComponentCallback, componentName);
  }

  public changeNodeState(componentName: ComponentName, nodeState: ConsensusNodeStates): void {
    if (!this.consensusNodes[componentName]) {
      throw new SoloError(`Consensus node ${componentName} doesn't exist`);
    }

    if (!isValidEnum(nodeState, ConsensusNodeStates)) {
      throw new SoloError(`Invalid node state ${nodeState}`);
    }

    this.consensusNodes[componentName].changeNodeState(nodeState);
  }

  /** Used to remove specific component from their respective group. */
  public disableComponent(componentName: ComponentName, type: ComponentTypes): void {
    if (!componentName || typeof componentName !== 'string') {
      throw new SoloError(`Component name is required ${componentName}`);
    }

    if (!isValidEnum(type, ComponentTypes)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    const disableComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = components => {
      if (!components[componentName]) {
        throw new SoloError(`Component ${componentName} of type ${type} not found while attempting to remove`);
      }
      components[componentName].state = ComponentStates.DELETED;
    };

    this.applyCallbackToComponentGroup(type, disableComponentCallback, componentName);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseComponent>(type: ComponentTypes, componentName: ComponentName): T {
    let component: T;

    const getComponentCallback: (components: Record<ComponentName, BaseComponent>) => void = components => {
      if (!components[componentName]) {
        throw new SoloError(`Component ${componentName} of type ${type} not found while attempting to read`);
      }
      component = components[componentName] as T;
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentName);

    return component;
  }

  public getComponentsByClusterReference<T extends BaseComponent>(
    type: ComponentTypes,
    clusterReference: ClusterReference,
  ): T[] {
    let filteredComponents: T[] = [];

    const getComponentsByClusterReferenceCallback: (components: Record<ComponentName, T>) => void = components => {
      filteredComponents = Object.values(components).filter(component => component.cluster === clusterReference);
    };

    this.applyCallbackToComponentGroup(type, getComponentsByClusterReferenceCallback);

    return filteredComponents;
  }

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup(
    componentType: ComponentTypes,
    callback: (components: Record<ComponentName, BaseComponent>) => void,
    componentName?: ComponentName,
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
        throw new SoloError(`Unknown component type ${componentType}, component name: ${componentName}`);
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
          for (const [componentName, component] of Object.entries(subComponents)) {
            relays[componentName] = RelayComponent.fromObject(component as IRelayComponent);
          }
          break;
        }

        case ComponentTypes.HaProxy: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            haProxies[componentName] = HaProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.MirrorNode: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            mirrorNodes[componentName] = MirrorNodeComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.EnvoyProxy: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            envoyProxies[componentName] = EnvoyProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.ConsensusNode: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            consensusNodes[componentName] = ConsensusNodeComponent.fromObject(component as IConsensusNodeComponent);
          }
          break;
        }

        case ComponentTypes.MirrorNodeExplorer: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            mirrorNodeExplorers[componentName] = MirrorNodeExplorerComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.BlockNode: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            blockNodes[componentName] = BlockNodeComponent.fromObject(component);
          }
          break;
        }

        default: {
          throw new SoloError(`Unknown component type ${componentType}`);
        }
      }
    }

    return new ComponentsDataWrapper(
      relays,
      haProxies,
      mirrorNodes,
      envoyProxies,
      consensusNodes,
      mirrorNodeExplorers,
      blockNodes,
    );
  }

  /** Used to create an empty instance used to keep the constructor private */
  public static initializeEmpty(): ComponentsDataWrapper {
    return new ComponentsDataWrapper();
  }

  public static initializeWithNodes(
    nodeAliases: NodeAliases,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): ComponentsDataWrapper {
    const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> = {};

    for (const nodeAlias of nodeAliases) {
      consensusNodeComponents[nodeAlias] = ConsensusNodeComponent.createNew(
        nodeAlias,
        clusterReference,
        namespace,
        ConsensusNodeStates.NON_DEPLOYED,
      );
    }

    return new ComponentsDataWrapper(undefined, undefined, undefined, undefined, consensusNodeComponents);
  }

  /** checks if component exists in the respective group */
  private checkComponentExists(components: Record<ComponentName, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components).some((component): boolean => BaseComponent.compare(component, newComponent));
  }

  /**
   * Checks all existing components of specified type and gives you a new unique index
   */
  public getNewComponentIndex(componentType: ComponentTypes): number {
    let newComponentIndex: number = 1;

    const calculateNewComponentIndexCallback: (
      components: Record<ComponentName, BaseComponent>,
    ) => void = components => {
      for (const componentName of Object.keys(components)) {
        const componentIndex: number = BaseComponent.parseComponentName(componentName);
        if (newComponentIndex <= componentIndex) {
          newComponentIndex = componentIndex + 1;
        }
      }
    };

    this.applyCallbackToComponentGroup(componentType, calculateNewComponentIndexCallback);

    return newComponentIndex;
  }

  /** Validates that the component group mapping has only components from the expected instance */
  private validateComponentTypes(components: Record<ComponentName, BaseComponent>, expectedInstance: any): void {
    for (const [componentName, component] of Object.entries(components)) {
      if (!componentName || typeof componentName !== 'string') {
        throw new SoloError(`Invalid component name ${{[componentName]: component?.constructor?.name}}`);
      }

      if (!(component instanceof expectedInstance)) {
        throw new SoloError(
          `Invalid component type, component name: ${componentName}, ` +
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

    for (const [componentName, component] of Object.entries(components)) {
      transformedComponents[componentName] = component.toObject() as Component;
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

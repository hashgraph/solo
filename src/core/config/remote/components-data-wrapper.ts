// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {BaseComponent} from './components/base-component.js';
import {RelayComponent} from './components/relay-component.js';
import {HaProxyComponent} from './components/ha-proxy-component.js';
import {MirrorNodeComponent} from './components/mirror-node-component.js';
import {EnvoyProxyComponent} from './components/envoy-proxy-component.js';
import {ConsensusNodeComponent} from './components/consensus-node-component.js';
import {MirrorNodeExplorerComponent} from './components/mirror-node-explorer-component.js';
import {type ClusterReference, type ComponentName} from './types.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type BaseComponentStruct} from './components/interfaces/base-component-struct.js';
import {type RelayComponentStruct} from './components/interfaces/relay-component-struct.js';
import {type ConsensusNodeComponentStruct} from './components/interfaces/consensus-node-component-struct.js';
import {type ComponentsDataWrapperApi} from './api/components-data-wrapper-api.js';
import {type ComponentsDataStruct} from './interfaces/components-data-struct.js';
import {ComponentNameTemplates} from './components/component-name-templates.js';

/**
 * Represent the components in the remote config and handles:
 * - CRUD operations on the components.
 * - Validation.
 * - Conversion FROM and TO plain object.
 */
export class ComponentsDataWrapper implements ComponentsDataWrapperApi {
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

  public getComponentById<T extends BaseComponent>(type: ComponentTypes, id: number): T {
    let filteredComponent: T;

    const getComponentByIdCallback: (components: Record<ComponentName, T>) => void = components => {
      filteredComponent = Object.values(components).find(
        component => ComponentNameTemplates.parseComponentName(component.name) === id,
      );
    };

    this.applyCallbackToComponentGroup(type, getComponentByIdCallback);

    if (!filteredComponent) {
      throw new SoloError(`Component of type ${type} with id ${id} was not found in remote config`);
    }

    return filteredComponent;
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
  public static fromObject(components: ComponentsDataStruct): ComponentsDataWrapper {
    const relays: Record<ComponentName, RelayComponent> = {};
    const haProxies: Record<ComponentName, HaProxyComponent> = {};
    const mirrorNodes: Record<ComponentName, MirrorNodeComponent> = {};
    const envoyProxies: Record<ComponentName, EnvoyProxyComponent> = {};
    const consensusNodes: Record<ComponentName, ConsensusNodeComponent> = {};
    const mirrorNodeExplorers: Record<ComponentName, MirrorNodeExplorerComponent> = {};

    for (const [componentType, subComponents] of Object.entries(components)) {
      switch (componentType) {
        case ComponentTypes.Relay: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            relays[componentName] = RelayComponent.fromObject(component as RelayComponentStruct);
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
            consensusNodes[componentName] = ConsensusNodeComponent.fromObject(
              component as ConsensusNodeComponentStruct,
            );
          }
          break;
        }

        case ComponentTypes.MirrorNodeExplorer: {
          for (const [componentName, component] of Object.entries(subComponents)) {
            mirrorNodeExplorers[componentName] = MirrorNodeExplorerComponent.fromObject(component);
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
    consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent>,
  ): ComponentsDataWrapper {
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
    let newComponentIndex: number = 0;

    const calculateNewComponentIndexCallback: (
      components: Record<ComponentName, BaseComponent>,
    ) => void = components => {
      for (const componentName of Object.keys(components)) {
        const componentIndex: number = ComponentNameTemplates.parseComponentName(componentName);
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
  }

  private transformComponentGroupToObject(
    components: Record<ComponentName, BaseComponent>,
  ): Record<ComponentName, BaseComponentStruct> {
    const transformedComponents: Record<ComponentName, BaseComponentStruct> = {};

    for (const [componentName, component] of Object.entries(components)) {
      transformedComponents[componentName] = component.toObject() as BaseComponentStruct;
    }

    return transformedComponents;
  }

  public toObject(): ComponentsDataStruct {
    return {
      [ComponentTypes.Relay]: this.transformComponentGroupToObject(this.relays),
      [ComponentTypes.HaProxy]: this.transformComponentGroupToObject(this.haProxies),
      [ComponentTypes.MirrorNode]: this.transformComponentGroupToObject(this.mirrorNodes),
      [ComponentTypes.EnvoyProxy]: this.transformComponentGroupToObject(this.envoyProxies),
      [ComponentTypes.ConsensusNode]: this.transformComponentGroupToObject(this.consensusNodes),
      [ComponentTypes.MirrorNodeExplorer]: this.transformComponentGroupToObject(this.mirrorNodeExplorers),
    };
  }

  public clone(): ComponentsDataWrapper {
    const data: ComponentsDataStruct = this.toObject();

    return ComponentsDataWrapper.fromObject(data);
  }
}

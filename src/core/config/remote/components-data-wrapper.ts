// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {BaseComponent} from './components/base-component.js';
import {RelayComponent} from './components/relay-component.js';
import {HaProxyComponent} from './components/ha-proxy-component.js';
import {MirrorNodeComponent} from './components/mirror-node-component.js';
import {EnvoyProxyComponent} from './components/envoy-proxy-component.js';
import {ConsensusNodeComponent} from './components/consensus-node-component.js';
import {MirrorNodeExplorerComponent} from './components/mirror-node-explorer-component.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type ClusterReference, type ComponentId} from './types.js';
import {type BaseComponentStruct} from './components/interfaces/base-component-struct.js';
import {type RelayComponentStruct} from './components/interfaces/relay-component-struct.js';
import {type ComponentsDataWrapperApi} from './api/components-data-wrapper-api.js';
import {type ComponentsDataStruct} from './interfaces/components-data-struct.js';
import {type DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';

/**
 * Represent the components in the remote config and handles:
 * - CRUD operations on the components.
 * - Validation.
 * - Conversion FROM and TO plain object.
 */
export class ComponentsDataWrapper implements ComponentsDataWrapperApi {
  private constructor(
    public readonly relays: Record<ComponentId, RelayComponent> = {},
    public readonly haProxies: Record<ComponentId, HaProxyComponent> = {},
    public readonly mirrorNodes: Record<ComponentId, MirrorNodeComponent> = {},
    public readonly envoyProxies: Record<ComponentId, EnvoyProxyComponent> = {},
    public readonly consensusNodes: Record<ComponentId, ConsensusNodeComponent> = {},
    public readonly mirrorNodeExplorers: Record<ComponentId, MirrorNodeExplorerComponent> = {},
  ) {
    this.validate();
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public addNewComponent(component: BaseComponent): void {
    const componentId: ComponentId = component.id;

    if (typeof componentId !== 'number' || componentId < 0) {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent);
    }

    const addComponentCallback: (components: Record<ComponentId, BaseComponent>) => void = components => {
      if (this.checkComponentExists(components, component)) {
        throw new SoloError('Component exists', undefined, component.toObject());
      }
      components[componentId] = component;
    };

    this.applyCallbackToComponentGroup(component.type, addComponentCallback, componentId);
  }

  public changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void {
    if (!this.consensusNodes[componentId]) {
      throw new SoloError(`Consensus node ${componentId} doesn't exist`);
    }

    this.consensusNodes[componentId].phase = phase;
  }

  /** Used to remove specific component from their respective group. */
  public removeComponent(componentId: ComponentId, type: ComponentTypes): void {
    if (typeof componentId !== 'number' || componentId < 0) {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!isValidEnum(type, ComponentTypes)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    const removeComponentCallback: (components: Record<ComponentId, BaseComponent>) => void = components => {
      if (!components[componentId]) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to remove`);
      }

      delete components[componentId];
    };

    this.applyCallbackToComponentGroup(type, removeComponentCallback, componentId);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseComponent>(type: ComponentTypes, componentId: ComponentId): T {
    let component: T;

    const getComponentCallback: (components: Record<ComponentId, BaseComponent>) => void = components => {
      if (!components[componentId]) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to read`);
      }
      component = components[componentId] as T;
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentId);

    return component;
  }

  public getComponentsByClusterReference<T extends BaseComponent>(
    type: ComponentTypes,
    clusterReference: ClusterReference,
  ): T[] {
    let filteredComponents: T[] = [];

    const getComponentsByClusterReferenceCallback: (components: Record<ComponentId, T>) => void = components => {
      filteredComponents = Object.values(components).filter(component => component.cluster === clusterReference);
    };

    this.applyCallbackToComponentGroup(type, getComponentsByClusterReferenceCallback);

    return filteredComponents;
  }

  public getComponentById<T extends BaseComponent>(type: ComponentTypes, id: number): T {
    let filteredComponent: T;

    const getComponentByIdCallback: (components: Record<ComponentId, T>) => void = components => {
      filteredComponent = Object.values(components).find(component => component.id === id);
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
    callback: (components: Record<ComponentId, BaseComponent>) => void,
    componentId?: ComponentId,
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
        throw new SoloError(`Unknown component type ${componentType}, component id: ${componentId}`);
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
    const relays: Record<ComponentId, RelayComponent> = {};
    const haProxies: Record<ComponentId, HaProxyComponent> = {};
    const mirrorNodes: Record<ComponentId, MirrorNodeComponent> = {};
    const envoyProxies: Record<ComponentId, EnvoyProxyComponent> = {};
    const consensusNodes: Record<ComponentId, ConsensusNodeComponent> = {};
    const mirrorNodeExplorers: Record<ComponentId, MirrorNodeExplorerComponent> = {};

    for (const [componentType, subComponents] of Object.entries(components)) {
      switch (componentType) {
        case ComponentTypes.Relay: {
          for (const [componentId, component] of Object.entries(subComponents)) {
            relays[componentId] = RelayComponent.fromObject(component as RelayComponentStruct);
          }
          break;
        }

        case ComponentTypes.HaProxy: {
          for (const [componentId, component] of Object.entries(subComponents)) {
            haProxies[componentId] = HaProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.MirrorNode: {
          for (const [componentId, component] of Object.entries(subComponents)) {
            mirrorNodes[componentId] = MirrorNodeComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.EnvoyProxy: {
          for (const [componentId, component] of Object.entries(subComponents)) {
            envoyProxies[componentId] = EnvoyProxyComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.ConsensusNode: {
          for (const [componentId, component] of Object.entries(subComponents)) {
            consensusNodes[componentId] = ConsensusNodeComponent.fromObject(component);
          }
          break;
        }

        case ComponentTypes.MirrorNodeExplorer: {
          for (const [componentId, component] of Object.entries(subComponents)) {
            mirrorNodeExplorers[componentId] = MirrorNodeExplorerComponent.fromObject(component);
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
    consensusNodeComponents: Record<ComponentId, ConsensusNodeComponent>,
  ): ComponentsDataWrapper {
    return new ComponentsDataWrapper(undefined, undefined, undefined, undefined, consensusNodeComponents);
  }

  /** checks if component exists in the respective group */
  private checkComponentExists(components: Record<ComponentId, BaseComponent>, newComponent: BaseComponent): boolean {
    return Object.values(components).some((component): boolean => BaseComponent.compare(component, newComponent));
  }

  /**
   * Checks all existing components of specified type and gives you a new unique index
   */
  public getNewComponentId(componentType: ComponentTypes): number {
    let newComponentId: number = 0;

    const calculateNewComponentIndexCallback: (components: Record<ComponentId, BaseComponent>) => void = components => {
      for (const componentId of Object.keys(components)) {
        if (newComponentId <= +componentId) {
          newComponentId = +componentId + 1;
        }
      }
    };

    this.applyCallbackToComponentGroup(componentType, calculateNewComponentIndexCallback);

    return newComponentId;
  }

  /** Validates that the component group mapping has only components from the expected instance */
  private validateComponentTypes(components: Record<ComponentId, BaseComponent>, expectedInstance: any): void {
    for (const [componentId, component] of Object.entries(components)) {
      if (typeof componentId !== 'number' || componentId < 0) {
        console.log(componentId);
        throw new SoloError(`Invalid component id ${{[componentId]: component?.constructor?.name}}`);
      }

      if (!(component instanceof expectedInstance)) {
        throw new SoloError(
          `Invalid component type, component id: ${componentId}, ` +
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
    components: Record<ComponentId, BaseComponent>,
  ): Record<ComponentId, BaseComponentStruct> {
    const transformedComponents: Record<ComponentId, BaseComponentStruct> = {};

    for (const [ComponentId, component] of Object.entries(components)) {
      transformedComponents[ComponentId] = component.toObject() as BaseComponentStruct;
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

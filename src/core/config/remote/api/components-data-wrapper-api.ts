// SPDX-License-Identifier: Apache-2.0

import {type ToObject, type Validate} from '../../../../types/index.js';
import {type ClusterReference, type ComponentName} from '../types.js';
import {type CloneTrait} from '../../../../types/traits/clone-trait.js';
import {type BaseComponent} from '../components/base-component.js';
import {type ConsensusNodeStates} from '../enumerations/consensus-node-states.js';
import {type ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentsDataStruct} from '../interfaces/components-data-struct.js';

export interface ComponentsDataWrapperApi
  extends Validate,
    ToObject<ComponentsDataStruct>,
    CloneTrait<ComponentsDataWrapperApi> {
  /** Used to add new component to their respective group. */
  addNewComponent(component: BaseComponent): void;

  changeNodeState(componentName: ComponentName, nodeState: ConsensusNodeStates): void;

  getComponent<T extends BaseComponent>(type: ComponentTypes, componentName: ComponentName): T;

  getComponentsByClusterReference<T extends BaseComponent>(
    type: ComponentTypes,
    clusterReference: ClusterReference,
  ): T[];

  getComponentById<T extends BaseComponent>(type: ComponentTypes, id: number): T;

  /**
   * Checks all existing components of specified type and gives you a new unique index
   */
  getNewComponentIndex(componentType: ComponentTypes): number;
}

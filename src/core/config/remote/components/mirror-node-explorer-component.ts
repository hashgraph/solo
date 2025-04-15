// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentStates} from '../enumerations/component-states.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

export class MirrorNodeExplorerComponent extends BaseComponent {
  public constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.MirrorNodeExplorer, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStruct): MirrorNodeExplorerComponent {
    const {name, cluster, namespace, state} = component;
    return new MirrorNodeExplorerComponent(name, cluster, namespace, state);
  }
}

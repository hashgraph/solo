// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {type ClusterReference, type Component, type NamespaceNameAsString} from '../types.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentStates} from '../enumerations/component-states.js';

export class MirrorNodeExplorerComponent extends BaseComponent {
  private static readonly BASE_NAME: string = 'mirror-node-explorer';

  public constructor(
    name: string,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.MirrorNodeExplorer, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): MirrorNodeExplorerComponent {
    const {name, cluster, namespace, state} = component;
    return new MirrorNodeExplorerComponent(name, cluster, namespace, state);
  }

  public static renderMirrorNodeExplorerName(index: number): string {
    return MirrorNodeExplorerComponent.renderComponentName(MirrorNodeExplorerComponent.BASE_NAME, index);
  }
}

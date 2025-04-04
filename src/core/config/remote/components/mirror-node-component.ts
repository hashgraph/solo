// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {type ClusterReference, type Component, type NamespaceNameAsString} from '../types.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentStates} from '../enumerations/component-states.js';

export class MirrorNodeComponent extends BaseComponent {
  private static readonly BASE_NAME: string = 'mirror-node';

  public constructor(
    name: string,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.MirrorNode, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): MirrorNodeComponent {
    const {name, cluster, namespace, state} = component;
    return new MirrorNodeComponent(name, cluster, namespace, state);
  }

  public static renderMirrorNodeName(index: number): string {
    return MirrorNodeComponent.renderComponentName(MirrorNodeComponent.BASE_NAME, index);
  }
}

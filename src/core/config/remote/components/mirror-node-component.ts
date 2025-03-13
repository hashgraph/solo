// SPDX-License-Identifier: Apache-2.0

import {ComponentType} from '../enumerations.js';
import {BaseComponent} from './base_component.js';
import {type Component, type NamespaceNameAsString} from '../types.js';

export class MirrorNodeComponent extends BaseComponent {
  public constructor(name: string, cluster: string, namespace: NamespaceNameAsString) {
    super(ComponentType.MirrorNode, name, cluster, namespace);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): MirrorNodeComponent {
    const {name, cluster, namespace} = component;
    return new MirrorNodeComponent(name, cluster, namespace);
  }
}

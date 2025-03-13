// SPDX-License-Identifier: Apache-2.0

import {ComponentType} from '../enumerations.js';
import {BaseComponent} from './base_component.js';
import {type Component, type NamespaceNameAsString} from '../types.js';

export class HaProxyComponent extends BaseComponent {
  public constructor(name: string, cluster: string, namespace: NamespaceNameAsString) {
    super(ComponentType.HaProxy, name, cluster, namespace);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): HaProxyComponent {
    const {name, cluster, namespace} = component;
    return new HaProxyComponent(name, cluster, namespace);
  }
}

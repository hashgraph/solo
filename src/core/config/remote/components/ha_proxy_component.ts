/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {ComponentType} from '../enumerations.js';
import {BaseComponent} from './base_component.js';
import {type Component} from '../types.js';
import {type NamespaceName} from '../../../kube/namespace_name.js';

export class HaProxyComponent extends BaseComponent {
  public constructor(name: string, cluster: string, namespace: NamespaceName) {
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

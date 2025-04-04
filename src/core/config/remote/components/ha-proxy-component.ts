// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {type ClusterReference, type Component, type NamespaceNameAsString} from '../types.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentStates} from '../enumerations/component-states.js';
import {type NodeAlias} from '../../../../types/aliases.js';

export class HaProxyComponent extends BaseComponent {
  private static BASE_NAME: (nodeAlias: NodeAlias) => string = (nodeAlias): string => `haproxy-${nodeAlias}}`;

  public constructor(
    name: string,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.HaProxy, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): HaProxyComponent {
    const {name, cluster, namespace, state} = component;
    return new HaProxyComponent(name, cluster, namespace, state);
  }

  public static renderHaProxyName(index: number, nodeAlias: NodeAlias): string {
    return HaProxyComponent.renderComponentName(HaProxyComponent.BASE_NAME(nodeAlias), index);
  }
}

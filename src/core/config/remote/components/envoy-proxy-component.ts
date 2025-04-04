// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {type ClusterReference, type Component, type NamespaceNameAsString} from '../types.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentStates} from '../enumerations/component-states.js';
import {type NodeAlias} from '../../../../types/aliases.js';

export class EnvoyProxyComponent extends BaseComponent {
  private static BASE_NAME: (nodeAlias: NodeAlias) => string = (nodeAlias): string => `envoy-proxy-${nodeAlias}}`;

  public constructor(
    name: string,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.EnvoyProxy, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): EnvoyProxyComponent {
    const {name, cluster, namespace, state} = component;
    return new EnvoyProxyComponent(name, cluster, namespace, state);
  }

  public static renderEnvoyProxyName(index: number, nodeAlias: NodeAlias): string {
    return EnvoyProxyComponent.renderComponentName(EnvoyProxyComponent.BASE_NAME(nodeAlias), index);
  }
}

// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {ComponentNameTemplates} from './component-name-templates.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type NodeAlias} from '../../../../types/aliases.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type RemoteConfigManagerApi} from '../api/remote-config-manager-api.js';
import {type BaseComponentStructure} from './interfaces/base-component-structure.js';

export class EnvoyProxyComponent extends BaseComponent {
  private constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.EnvoyProxy, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  public static createNew(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
  ): EnvoyProxyComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.EnvoyProxy);

    const name: ComponentName = ComponentNameTemplates.renderEnvoyProxyName(index, nodeAlias);

    return new EnvoyProxyComponent(name, clusterReference, namespace.name, ComponentStates.ACTIVE);
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStructure): EnvoyProxyComponent {
    const {name, cluster, namespace, state} = component;
    return new EnvoyProxyComponent(name, cluster, namespace, state);
  }
}

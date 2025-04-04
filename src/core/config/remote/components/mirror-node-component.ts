// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {type ClusterReference, type Component, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type RemoteConfigManager} from '../remote-config-manager.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';

export class MirrorNodeComponent extends BaseComponent {
  private static readonly BASE_NAME: string = 'mirror-node';

  private constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.MirrorNode, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  public static createNew(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.MirrorNode);

    const name: ComponentName = MirrorNodeComponent.renderMirrorNodeName(index);

    return new MirrorNodeComponent(name, clusterReference, namespace.name, ComponentStates.ACTIVE);
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): MirrorNodeComponent {
    const {name, cluster, namespace, state} = component;
    return new MirrorNodeComponent(name, cluster, namespace, state);
  }

  private static renderMirrorNodeName(index: number): string {
    return MirrorNodeComponent.renderComponentName(MirrorNodeComponent.BASE_NAME, index);
  }
}

// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {type ClusterReference, type Component, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type RemoteConfigManager} from '../remote-config-manager.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';

export class MirrorNodeExplorerComponent extends BaseComponent {
  private static readonly BASE_NAME: string = 'mirror-node-explorer';

  private constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.MirrorNodeExplorer, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  public static createNew(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeExplorerComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.MirrorNodeExplorer);

    const name: ComponentName = MirrorNodeExplorerComponent.renderMirrorNodeExplorerName(index);

    return new MirrorNodeExplorerComponent(name, clusterReference, namespace.name, ComponentStates.ACTIVE);
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: Component): MirrorNodeExplorerComponent {
    const {name, cluster, namespace, state} = component;
    return new MirrorNodeExplorerComponent(name, cluster, namespace, state);
  }

  private static renderMirrorNodeExplorerName(index: number): string {
    return MirrorNodeExplorerComponent.renderComponentName(MirrorNodeExplorerComponent.BASE_NAME, index);
  }
}

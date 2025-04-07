// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type RemoteConfigManagerApi} from '../api/remote-config-manager-api.js';
import {type BaseComponentStructure} from './interfaces/base-component-structure.js';

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
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeExplorerComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.MirrorNodeExplorer);

    const name: ComponentName = MirrorNodeExplorerComponent.renderMirrorNodeExplorerName(index);

    return new MirrorNodeExplorerComponent(name, clusterReference, namespace.name, ComponentStates.ACTIVE);
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStructure): MirrorNodeExplorerComponent {
    const {name, cluster, namespace, state} = component;
    return new MirrorNodeExplorerComponent(name, cluster, namespace, state);
  }

  private static renderMirrorNodeExplorerName(index: number): string {
    return MirrorNodeExplorerComponent.renderComponentName(MirrorNodeExplorerComponent.BASE_NAME, index);
  }
}

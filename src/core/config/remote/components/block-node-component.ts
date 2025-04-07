// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type RemoteConfigManagerApi} from '../api/remote-config-manager-api.js';
import {BaseComponentStructure} from './interface/base-component-structure.js';

export class BlockNodeComponent extends BaseComponent {
  private static readonly BASE_NAME: string = 'block-node';

  private constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
  ) {
    super(ComponentTypes.BlockNode, name, cluster, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  public static createNew(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): BlockNodeComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.BlockNode);

    const name: ComponentName = BlockNodeComponent.renderBlockNodeName(index);

    return new BlockNodeComponent(name, clusterReference, namespace.name, ComponentStates.ACTIVE);
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStructure): BlockNodeComponent {
    const {name, cluster, namespace, state} = component;
    return new BlockNodeComponent(name, cluster, namespace, state);
  }

  private static renderBlockNodeName(index: number): string {
    return BlockNodeComponent.renderComponentName(BlockNodeComponent.BASE_NAME, index);
  }
}

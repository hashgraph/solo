// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {type ClusterReference, type ComponentName, type IRelayComponent, type NamespaceNameAsString} from '../types.js';
import {type NodeAliases} from '../../../../types/aliases.js';
import {type ToObject} from '../../../../types/index.js';
import {type RemoteConfigManager} from '../remote-config-manager.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';

export class RelayComponent extends BaseComponent implements IRelayComponent, ToObject<IRelayComponent> {
  private static readonly BASE_NAME: string = 'relay';

  /**
   * @param name - to distinguish components.
   * @param clusterReference - in which the component is deployed.
   * @param namespace - associated with the component.
   * @param state - the state of the component
   * @param consensusNodeAliases - list node aliases
   */
  private constructor(
    name: ComponentName,
    clusterReference: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
    public readonly consensusNodeAliases: NodeAliases = [],
  ) {
    super(ComponentTypes.Relay, name, clusterReference, namespace, state);
    this.validate();
  }

  /* -------- Utilities -------- */

  public static createNew(
    remoteConfigManager: RemoteConfigManager,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeAliases: NodeAliases,
  ): RelayComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.Relay);

    const name: ComponentName = RelayComponent.renderRelayName(index);

    return new RelayComponent(name, clusterReference, namespace.name, ComponentStates.ACTIVE, nodeAliases);
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: IRelayComponent): RelayComponent {
    const {name, cluster, namespace, state, consensusNodeAliases} = component;
    return new RelayComponent(name, cluster, namespace, state, consensusNodeAliases);
  }

  public override validate(): void {
    super.validate();

    for (const alias of this.consensusNodeAliases) {
      if (!alias || typeof alias !== 'string') {
        throw new SoloError(`Invalid consensus node alias: ${alias}, aliases ${this.consensusNodeAliases}`);
      }
    }
  }

  public override toObject(): IRelayComponent {
    return {
      consensusNodeAliases: this.consensusNodeAliases,
      ...super.toObject(),
    };
  }

  private static renderRelayName(index: number): string {
    return RelayComponent.renderComponentName(RelayComponent.BASE_NAME, index);
  }
}

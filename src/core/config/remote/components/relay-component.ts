// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type ComponentStates} from '../enumerations/component-states.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type NodeAliases} from '../../../../types/aliases.js';
import {type ToObject} from '../../../../types/index.js';
import {type RelayComponentStructure} from './interfaces/relay-component-structure.js';

export class RelayComponent
  extends BaseComponent
  implements RelayComponentStructure, ToObject<RelayComponentStructure>
{
  /**
   * @param name - to distinguish components.
   * @param clusterReference - in which the component is deployed.
   * @param namespace - associated with the component.
   * @param state - the state of the component
   * @param consensusNodeAliases - list node aliases
   */
  public constructor(
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

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: RelayComponentStructure): RelayComponent {
    const {name, cluster, namespace, state, consensusNodeAliases} = component;
    return new RelayComponent(name, cluster, namespace, state, consensusNodeAliases);
  }

  public override validate(): void {
    super.validate();

    for (const nodeAlias of this.consensusNodeAliases) {
      if (!nodeAlias || typeof nodeAlias !== 'string') {
        throw new SoloError(`Invalid consensus node alias: ${nodeAlias}, aliases ${this.consensusNodeAliases}`);
      }
    }
  }

  public override toObject(): RelayComponentStructure {
    return {
      consensusNodeAliases: this.consensusNodeAliases,
      ...super.toObject(),
    };
  }
}

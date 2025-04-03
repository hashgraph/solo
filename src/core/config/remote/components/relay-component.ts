// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {BaseComponent} from './base-component.js';
import {type IRelayComponent, type NamespaceNameAsString} from '../types.js';
import {type NodeAliases} from '../../../../types/aliases.js';
import {type ToObject} from '../../../../types/index.js';
import {ComponentTypes} from '../enumerations/component-types.js';

export class RelayComponent extends BaseComponent implements IRelayComponent, ToObject<IRelayComponent> {
  /**
   * @param name - to distinguish components.
   * @param cluster - in which the component is deployed.
   * @param namespace - associated with the component.
   * @param consensusNodeAliases - list node aliases
   */
  public constructor(
    name: string,
    cluster: string,
    namespace: NamespaceNameAsString,
    public readonly consensusNodeAliases: NodeAliases = [],
  ) {
    super(ComponentTypes.Relay, name, cluster, namespace);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: IRelayComponent): RelayComponent {
    const {name, cluster, namespace, consensusNodeAliases} = component;
    return new RelayComponent(name, cluster, namespace, consensusNodeAliases);
  }

  public validate(): void {
    super.validate();

    for (const alias of this.consensusNodeAliases) {
      if (!alias || typeof alias !== 'string') {
        throw new SoloError(`Invalid consensus node alias: ${alias}, aliases ${this.consensusNodeAliases}`);
      }
    }
  }

  public toObject(): IRelayComponent {
    return {
      consensusNodeAliases: this.consensusNodeAliases,
      ...super.toObject(),
    };
  }
}

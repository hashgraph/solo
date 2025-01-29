/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {ComponentType} from '../enumerations.js';
import {SoloError} from '../../../errors.js';
import {BaseComponent} from './base_component.js';
import type {IRelayComponent} from '../types.js';
import type {NodeAliases} from '../../../../types/aliases.js';
import type {ToObject} from '../../../../types/index.js';

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
    namespace: string,
    public readonly consensusNodeAliases: NodeAliases = [],
  ) {
    super(ComponentType.Relay, name, cluster, namespace);
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

    this.consensusNodeAliases.forEach(alias => {
      if (!alias || typeof alias !== 'string') {
        throw new SoloError(`Invalid consensus node alias: ${alias}, aliases ${this.consensusNodeAliases}`);
      }
    });
  }

  public toObject(): IRelayComponent {
    return {
      consensusNodeAliases: this.consensusNodeAliases,
      ...super.toObject(),
    };
  }
}

/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
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
import { ComponentTypeEnum } from '../enumerations.ts'
import { SoloError } from '../../../errors.ts'
import { BaseComponent } from './base_component.ts'
import type { IRelayComponent } from '../types.ts'
import type { NodeAliases } from '../../../../types/aliases.ts'

export class RelayComponent extends BaseComponent implements IRelayComponent {
  constructor (
    name: string, cluster: string, namespace: string,
    public readonly consensusNodeAliases: NodeAliases = []
  ) {
    super(ComponentTypeEnum.Relay, name, cluster, namespace)
  }

  protected validate () {
    super.validate()

    this.consensusNodeAliases.forEach(alias => {
      if (!alias || typeof alias === 'string') {
        throw new SoloError(`Invalid consensus node alias: ${alias}, aliases ${this.consensusNodeAliases}`)
      }
    })
  }

  toObject (): IRelayComponent {
    return {
      consensusNodeAliases: this.consensusNodeAliases,
      ...super.toObject()
    }
  }
}

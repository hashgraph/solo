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
import { ComponentTypeEnum, ConsensusNodeStates } from '../enumerations.ts'
import { BaseComponent } from './base_component.ts'
import { SoloError } from '../../../errors.ts'
import type { IConsensusNodeComponent } from '../types.ts'

export class ConsensusNodeComponent extends BaseComponent implements IConsensusNodeComponent{
  private _state: ConsensusNodeStates

  constructor (
    name: string, cluster: string, namespace: string,
    state: ConsensusNodeStates
  ) {
    super(ComponentTypeEnum.ConsensusNode, name, cluster, namespace)
    this._state = state

    this.validate()
  }

  get state () { return this._state }

  set state (state: ConsensusNodeStates) {
    this._state = state
    this.validate()
  }

  protected validate () {
    super.validate()

    if (!Object.values(ConsensusNodeStates).includes(this.state)) {
      throw new SoloError(`Invalid ConsensusNodeStates value: ${this.state}`)
    }
  }

  toObject (): IConsensusNodeComponent {
    return {
      state: this.state,
      ...super.toObject()
    }
  }
}

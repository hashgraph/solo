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
import type { Cluster, IConsensusNodeComponent, Namespace, ServiceName } from '../types.ts'
import { ToObject } from "../../../../types/index.js";

/**
 * Represents a consensus node component within the system.
 *
 * A `ConsensusNodeComponent` extends the functionality of `BaseComponent` and includes additional properties and behaviors
 * specific to consensus nodes, such as maintaining and validating the node's state.
 */
export class ConsensusNodeComponent extends BaseComponent
  implements IConsensusNodeComponent, ToObject<IConsensusNodeComponent>
{
  /** The state of the node. */
  private _state: ConsensusNodeStates

  /**
   * @param name - of the consensus node
   * @param cluster - associated to component
   * @param namespace - associated to component
   * @param state - of the consensus node
   */
  public constructor (
    name: ServiceName,
    cluster: Cluster,
    namespace: Namespace,
    state: ConsensusNodeStates
  ) {
    super(ComponentTypeEnum.ConsensusNode, name, cluster, namespace)
    this._state = state

    this.validate()
  }

  /* -------- Getters & Setters -------- */

  /** Retrieves the state of the consensus node. */
  public get state (): ConsensusNodeStates { return this._state }

  /** Updates the state of the consensus node and validates it. */
  public set state (state: ConsensusNodeStates) {
    this._state = state
    this.validate()
  }

  /* -------- Utilities -------- */

  public validate (): void {
    super.validate()

    if (!Object.values(ConsensusNodeStates).includes(this.state)) {
      throw new SoloError(`Invalid ConsensusNodeStates value: ${this.state}`)
    }
  }

  public toObject (): IConsensusNodeComponent {
    return {
      state: this.state,
      ...super.toObject()
    }
  }
}

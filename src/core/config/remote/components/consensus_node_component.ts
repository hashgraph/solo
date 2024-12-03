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
import {ComponentType, ConsensusNodeStates} from '../enumerations.js';
import {BaseComponent} from './base_component.js';
import {SoloError} from '../../../errors.js';
import type {Cluster, IConsensusNodeComponent, Namespace, ComponentName} from '../types.js';
import type {ToObject} from '../../../../types/index.js';

/**
 * Represents a consensus node component within the system.
 *
 * A `ConsensusNodeComponent` extends the functionality of `BaseComponent` and includes additional properties and behaviors
 * specific to consensus nodes, such as maintaining and validating the node's state.
 */
export class ConsensusNodeComponent
  extends BaseComponent
  implements IConsensusNodeComponent, ToObject<IConsensusNodeComponent>
{
  /**
   * @param name - the name to distinguish components.
   * @param cluster - associated to component
   * @param namespace - associated to component
   * @param state - of the consensus node
   */
  public constructor(
    name: ComponentName,
    cluster: Cluster,
    namespace: Namespace,
    public readonly state: ConsensusNodeStates,
  ) {
    super(ComponentType.ConsensusNode, name, cluster, namespace);

    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: IConsensusNodeComponent): ConsensusNodeComponent {
    const {name, cluster, namespace, state} = component;
    return new ConsensusNodeComponent(name, cluster, namespace, state);
  }

  public validate(): void {
    super.validate();

    if (!Object.values(ConsensusNodeStates).includes(this.state)) {
      throw new SoloError(`Invalid consensus node state: ${this.state}`);
    }
  }

  public toObject(): IConsensusNodeComponent {
    return {
      ...super.toObject(),
      state: this.state,
    };
  }
}

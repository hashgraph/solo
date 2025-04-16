// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {SoloError} from '../../../errors/solo-error.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type ToObject} from '../../../../types/index.js';
import {type ConsensusNodeComponentStruct} from './interfaces/consensus-node-component-struct.js';

/**
 * Represents a consensus node component within the system.
 *
 * A `ConsensusNodeComponent` extends the functionality of `BaseComponent` and includes additional properties and behaviors
 * specific to consensus nodes, such as maintaining and validating the node's state.
 */
export class ConsensusNodeComponent
  extends BaseComponent
  implements ConsensusNodeComponentStruct, ToObject<ConsensusNodeComponentStruct>
{
  public constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    phase: DeploymentPhase,
    public readonly nodeId: number,
  ) {
    super(ComponentTypes.ConsensusNode, name, cluster, namespace, phase);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: ConsensusNodeComponentStruct): ConsensusNodeComponent {
    return new ConsensusNodeComponent(
      component.name,
      component.cluster,
      component.namespace,
      component.phase,
      component.nodeId,
    );
  }

  public override validate(): void {
    super.validate();

    if (typeof this.nodeId !== 'number') {
      throw new SoloError(`Invalid node id. It must be a number: ${this.nodeId}`);
    }

    if (this.nodeId < 0) {
      throw new SoloError(`Invalid node id. It cannot be negative: ${this.nodeId}`);
    }
  }

  public override toObject(): ConsensusNodeComponentStruct {
    return {
      ...super.toObject(),
      nodeId: this.nodeId,
    };
  }
}

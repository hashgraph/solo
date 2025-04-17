// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReference, type ComponentId, type NamespaceNameAsString} from '../types.js';
import {type NodeId} from '../../../../types/aliases.js';
import {type ToObject} from '../../../../types/index.js';
import {type RelayComponentStruct} from './interfaces/relay-component-struct.js';

export class RelayComponent extends BaseComponent implements RelayComponentStruct, ToObject<RelayComponentStruct> {
  public constructor(
    id: ComponentId,
    clusterReference: ClusterReference,
    namespace: NamespaceNameAsString,
    phase: DeploymentPhase,
    public readonly consensusNodeIds: NodeId[] = [],
  ) {
    super(ComponentTypes.Relay, id, clusterReference, namespace, phase);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: RelayComponentStruct): RelayComponent {
    return new RelayComponent(
      component.id,
      component.cluster,
      component.namespace,
      component.phase,
      component.consensusNodeIds,
    );
  }

  public override validate(): void {
    super.validate();

    for (const nodeId of this.consensusNodeIds) {
      if (typeof nodeId !== 'number' || nodeId < 0) {
        throw new SoloError(`Invalid consensus node id: ${nodeId}, aliases ${this.consensusNodeIds}`);
      }
    }
  }

  public override toObject(): RelayComponentStruct {
    return {
      consensusNodeIds: this.consensusNodeIds,
      ...super.toObject(),
    };
  }
}

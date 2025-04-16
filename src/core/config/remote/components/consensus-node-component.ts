// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReference, type ComponentId, type NamespaceNameAsString} from '../types.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

/**
 * Represents a consensus node component within the system.
 *
 * A `ConsensusNodeComponent` extends the functionality of `BaseComponent` and includes additional properties and behaviors
 * specific to consensus nodes, such as maintaining and validating the node's state.
 */
export class ConsensusNodeComponent extends BaseComponent {
  public constructor(
    id: ComponentId,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    phase: DeploymentPhase,
  ) {
    super(ComponentTypes.ConsensusNode, id, cluster, namespace, phase);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStruct): ConsensusNodeComponent {
    return new ConsensusNodeComponent(component.id, component.cluster, component.namespace, component.phase);
  }
}

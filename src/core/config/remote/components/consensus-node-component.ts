// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {SoloError} from '../../../errors/solo-error.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type ToObject} from '../../../../types/index.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {ConsensusNodeStates} from '../enumerations/consensus-node-states.js';
import {ComponentStates} from '../enumerations/component-states.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAlias, type NodeId} from '../../../../types/aliases.js';
import {Templates} from '../../../templates.js';
import {isValidEnum} from '../../../util/validation-helpers.js';
import {type ConsensusNodeComponentStructure} from './interface/consensus-node-component-structure.js';

/**
 * Represents a consensus node component within the system.
 *
 * A `ConsensusNodeComponent` extends the functionality of `BaseComponent` and includes additional properties and behaviors
 * specific to consensus nodes, such as maintaining and validating the node's state.
 */
export class ConsensusNodeComponent
  extends BaseComponent
  implements ConsensusNodeComponentStructure, ToObject<ConsensusNodeComponentStructure>
{
  private _nodeState: ConsensusNodeStates;

  /**
   * @param name - the name to distinguish components.
   * @param nodeId - node id of the consensus node
   * @param cluster - associated to component
   * @param namespace - associated to component
   * @param state - the component state
   * @param nodeState - of the consensus node
   */
  private constructor(
    name: ComponentName,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    state: ComponentStates,
    nodeState: ConsensusNodeStates,
    public readonly nodeId: number,
  ) {
    super(ComponentTypes.ConsensusNode, name, cluster, namespace, state);
    this._nodeState = nodeState;
    this.validate();
  }

  public get nodeState(): ConsensusNodeStates {
    return this._nodeState;
  }

  public changeNodeState(nodeState: ConsensusNodeStates): void {
    this._nodeState = nodeState;
    this.validate();
  }

  /* -------- Utilities -------- */

  public static createNew(
    nodeAlias: NodeAlias,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeState: ConsensusNodeStates.REQUESTED | ConsensusNodeStates.NON_DEPLOYED | ConsensusNodeStates.STARTED,
  ): ConsensusNodeComponent {
    const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
    return new ConsensusNodeComponent(
      nodeAlias,
      clusterReference,
      namespace.name,
      ComponentStates.ACTIVE,
      nodeState,
      nodeId,
    );
  }

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: ConsensusNodeComponentStructure): ConsensusNodeComponent {
    const {name, cluster, state, namespace, nodeState, nodeId} = component;
    return new ConsensusNodeComponent(name, cluster, namespace, state, nodeState, nodeId);
  }

  public override validate(): void {
    super.validate();

    if (!isValidEnum(this.nodeState, ConsensusNodeStates)) {
      throw new SoloError(`Invalid consensus node state: ${this.nodeState}`);
    }

    if (typeof this.nodeId !== 'number') {
      throw new SoloError(`Invalid node id. It must be a number: ${this.nodeId}`);
    }

    if (this.nodeId < 0) {
      throw new SoloError(`Invalid node id. It cannot be negative: ${this.nodeId}`);
    }
  }

  public override toObject(): ConsensusNodeComponentStructure {
    return {
      ...super.toObject(),
      nodeState: this.nodeState,
      nodeId: this.nodeId,
    };
  }
}

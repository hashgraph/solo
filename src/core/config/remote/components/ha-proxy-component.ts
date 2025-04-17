// SPDX-License-Identifier: Apache-2.0

import {BaseComponent} from './base-component.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {type DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReference, type ComponentId, type NamespaceNameAsString} from '../types.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

export class HaProxyComponent extends BaseComponent {
  public constructor(
    id: ComponentId,
    cluster: ClusterReference,
    namespace: NamespaceNameAsString,
    phase: DeploymentPhase,
  ) {
    super(ComponentTypes.HaProxy, id, cluster, namespace, phase);
    this.validate();
  }

  /* -------- Utilities -------- */

  /** Handles creating instance of the class from plain object. */
  public static fromObject(component: BaseComponentStruct): HaProxyComponent {
    return new HaProxyComponent(component.id, component.cluster, component.namespace, component.phase);
  }
}

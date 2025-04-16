// SPDX-License-Identifier: Apache-2.0

import {type ClusterReference, type ComponentId, type NamespaceNameAsString} from '../../types.js';
import {type DeploymentPhase} from '../../../../../data/schema/model/remote/deployment-phase.js';

export interface BaseComponentStruct {
  id: ComponentId;
  cluster: ClusterReference;
  namespace: NamespaceNameAsString;
  phase: DeploymentPhase;
}

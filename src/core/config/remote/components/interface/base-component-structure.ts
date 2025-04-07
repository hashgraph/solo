// SPDX-License-Identifier: Apache-2.0

import {type ComponentStates} from '../../enumerations/component-states.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../../types.js';

export interface BaseComponentStructure {
  name: ComponentName;
  cluster: ClusterReference;
  namespace: NamespaceNameAsString;
  state: ComponentStates;
}
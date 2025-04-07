// SPDX-License-Identifier: Apache-2.0

import {type BaseComponentStructure} from './base-component-structure.js';
import {type NodeAliases} from '../../../../../types/aliases.js';

export interface RelayComponentStructure extends BaseComponentStructure {
  consensusNodeAliases: NodeAliases;
}

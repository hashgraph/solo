// SPDX-License-Identifier: Apache-2.0

import {type NodeAliases} from '../../../types/aliases.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeKeysConfigClass {
  cacheDir: string;
  devMode: boolean;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  nodeAliasesUnparsed: string;
  curDate: Date;
  keysDir: string;
  nodeAliases: NodeAliases;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}

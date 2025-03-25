// SPDX-License-Identifier: Apache-2.0

import {GenesisNetworkDataWrapper} from './genesis-network-data-wrapper.js';
import {type NodeId} from '../../types/aliases.js';
import {type GenesisNetworkRosterStructure, type ToObject} from '../../types/index.js';

export class GenesisNetworkRosterEntryDataWrapper
  extends GenesisNetworkDataWrapper
  implements GenesisNetworkRosterStructure, ToObject<GenesisNetworkRosterStructure>
{
  constructor(public readonly nodeId: NodeId) {
    super(nodeId);
  }

  public toObject() {
    return {
      nodeId: this.nodeId,
      gossipEndpoint: this.gossipEndpoint,
      gossipCaCertificate: this.gossipCaCertificate,
      weight: this.weight,
    };
  }
}

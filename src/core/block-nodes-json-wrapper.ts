// SPDX-License-Identifier: Apache-2.0

import {Templates} from './templates.js';
import {type BlockNodeComponent} from './config/remote/components/block-node-component.js';
import {type Cluster} from './config/remote/cluster.js';
import {type ToJSON} from '../types/index.js';
import {type ClusterReference} from './config/remote/types.js';
import * as constants from './constants.js';

interface BlockNodeConnectionData {
  address: string;
  port: number;
}

interface BlockNodesJsonStructure {
  nodes: BlockNodeConnectionData[];
  blockItemBatchSize: number;
}

export class BlockNodesJsonWrapper implements ToJSON {
  public constructor(
    private readonly blockNodeComponents: BlockNodeComponent[],
    private readonly clusterMapping: Record<ClusterReference, Cluster>,
  ) {}

  public toJSON(): string {
    const blockNodeConnectionData: BlockNodeConnectionData[] = this.blockNodeComponents.map(
      (blockNodeComponent): BlockNodeConnectionData => {
        const cluster: Cluster = this.clusterMapping[blockNodeComponent.cluster];

        const address: string = Templates.renderSvcFullyQualifiedDomainName(
          blockNodeComponent.name,
          blockNodeComponent.namespace,
          cluster.dnsBaseDomain,
        );

        const port: number = constants.BLOCK_NODE_PORT;

        return {address, port};
      },
    );

    const data: BlockNodesJsonStructure = {
      nodes: blockNodeConnectionData,
      blockItemBatchSize: constants.BLOCK_ITEM_BATCH_SIZE,
    };

    return JSON.stringify(data);
  }
}

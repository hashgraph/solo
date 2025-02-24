/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {type LocalConfig} from '../core/config/local_config.js';
import {type RemoteConfigManager} from '../core/config/remote/remote_config_manager.js';
import {ConsensusNode} from '../core/model/consensus_node.js';
import {type ClusterRef, type ClusterRefs} from '../core/config/remote/types.js';
import {type Cluster} from '../core/config/remote/cluster.js';
import {Templates} from '../core/templates.js';
import {type SoloLogger} from '../core/logging.js';
import {type NodeAlias} from '../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency_injection/inject_tokens.js';
import {patchInject} from './dependency_injection/container_helper.js';

@injectable()
export class ConsensusNodeManager {
  constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
  }

  /**
   * Get the consensus nodes from the remoteConfigManager and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  public getConsensusNodes(): ConsensusNode[] {
    const consensusNodes: ConsensusNode[] = [];
    const clusters: Record<ClusterRef, Cluster> = this.remoteConfigManager.clusters;

    try {
      if (!this.remoteConfigManager?.components?.consensusNodes) return [];
    } catch {
      return [];
    }

    // using the remoteConfigManager to get the consensus nodes
    if (this.remoteConfigManager?.components?.consensusNodes) {
      Object.values(this.remoteConfigManager.components.consensusNodes).forEach(node => {
        consensusNodes.push(
          new ConsensusNode(
            node.name as NodeAlias,
            node.nodeId,
            node.namespace,
            node.cluster,
            // use local config to get the context
            this.localConfig.clusterRefs[node.cluster],
            clusters[node.cluster].dnsBaseDomain,
            clusters[node.cluster].dnsConsensusNodePattern,
            Templates.renderConsensusNodeFullyQualifiedDomainName(
              node.name as NodeAlias,
              node.nodeId,
              node.namespace,
              node.cluster,
              clusters[node.cluster].dnsBaseDomain,
              clusters[node.cluster].dnsConsensusNodePattern,
            ),
          ),
        );
      });
    }

    // return the consensus nodes
    return consensusNodes;
  }

  /**
   * Gets a list of distinct contexts from the consensus nodes
   * @returns an array of context strings
   * @deprecated use one inside remote config
   */
  public getContexts(): string[] {
    const contexts: string[] = [];
    this.getConsensusNodes().forEach(node => {
      if (!contexts.includes(node.context)) {
        contexts.push(node.context);
      }
    });
    return contexts;
  }

  /**
   * Gets a list of distinct cluster references from the consensus nodes
   * @returns an object of cluster references
   * @deprecated use one inside remote config
   */
  public getClusterRefs(): ClusterRefs {
    const clustersRefs: ClusterRefs = {};
    this.getConsensusNodes().forEach(node => {
      if (!Object.keys(clustersRefs).includes(node.cluster)) {
        clustersRefs[node.cluster] = node.context;
      }
    });
    return clustersRefs;
  }
}

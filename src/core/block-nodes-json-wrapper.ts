// SPDX-License-Identifier: Apache-2.0

import {Templates} from './templates.js';
import {type PriorityMapping, type ToJSON} from '../types/index.js';
import * as constants from './constants.js';
import {type BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {type ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {ExternalBlockNodeStateSchema} from '../data/schema/model/remote/state/external-block-node-state-schema.js';
import {type ConfigProvider} from '../data/configuration/api/config-provider.js';
import {SoloConfigSchema} from '../data/schema/model/solo/solo-config-schema.js';
import {SoloConfig} from '../business/runtime-state/config/solo/solo-config.js';

type BlockNodeConnectionDatabase = {
  messageSizeSoftLimitBytes?: number;
  messageSizeHardLimitBytes?: number;
};

type BlockNodeConnectionData = {
  address: string;
  streamingPort: number;
  servicePort: number;
  priority: number;
} & BlockNodeConnectionDatabase;

interface BlockNodesJsonStructure {
  nodes: BlockNodeConnectionData[];
}

/**
 * Wrapper used to generate `block-nodes.json` file
 * for the consensus node used to configure block node connections.
 */
export class BlockNodesJsonWrapper implements ToJSON {
  private readonly remoteConfig: RemoteConfigRuntimeStateApi;
  private readonly configProvider: ConfigProvider;
  private readonly blockNodes: BlockNodeStateSchema[];
  private readonly externalBlockNodes: ExternalBlockNodeStateSchema[];
  private readonly tssEnabled: boolean;

  public constructor(
    private readonly blockNodeMap: PriorityMapping[],
    private readonly externalBlockNodeMap: PriorityMapping[],
    @inject(InjectTokens.RemoteConfigRuntimeState) remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.ConfigProvider) configProvider?: ConfigProvider,
  ) {
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.configProvider = patchInject(configProvider, InjectTokens.ConfigProvider, this.constructor.name);
    this.blockNodes = this.remoteConfig.configuration.state.blockNodes;
    this.externalBlockNodes = this.remoteConfig.configuration.state.externalBlockNodes;
    this.tssEnabled = this.remoteConfig.configuration.state.tssEnabled ?? false;
  }

  public toJSON(): string {
    return JSON.stringify(this.buildBlockNodesJsonStructure());
  }

  /**
   * Resolves the message-size limit fields written into each block-nodes.json entry. Only emitted when
   * TSS is enabled. A deployment-wide override persisted in remote config (set via the block node
   * `--block-node-message-size-*-limit-bytes` flags) takes precedence over the TSS config default.
   */
  private resolveMessageSizeFields(): BlockNodeConnectionDatabase {
    if (!this.tssEnabled) {
      return {};
    }

    const soloConfig: SoloConfig = new SoloConfig(this.configProvider.config().asObject(SoloConfigSchema));

    return {
      messageSizeSoftLimitBytes:
        this.remoteConfig.configuration.state.blockNodeMessageSizeSoftLimitBytes ??
        soloConfig.tss.messageSizeSoftLimitBytes,
      messageSizeHardLimitBytes:
        this.remoteConfig.configuration.state.blockNodeMessageSizeHardLimitBytes ??
        soloConfig.tss.messageSizeHardLimitBytes,
    };
  }

  private buildBlockNodesJsonStructure(): BlockNodesJsonStructure {
    const blockNodeConnectionData: BlockNodeConnectionData[] = [];

    for (const [id, priority] of this.blockNodeMap) {
      const blockNodeComponent: BlockNodeStateSchema = this.blockNodes.find(
        (component): boolean => component.metadata.id === id,
      );

      const cluster: ClusterSchema = this.remoteConfig.configuration.clusters.find(
        (cluster): boolean => cluster.name === blockNodeComponent.metadata.cluster,
      );

      const address: string = Templates.renderSvcFullyQualifiedDomainName(
        Templates.renderBlockNodeName(blockNodeComponent.metadata.id),
        blockNodeComponent.metadata.namespace,
        cluster.dnsBaseDomain,
      );

      const port: number = constants.BLOCK_NODE_PORT;

      const tssMessageSizeFields: BlockNodeConnectionDatabase = this.resolveMessageSizeFields();

      blockNodeConnectionData.push({
        address,
        streamingPort: port,
        servicePort: port,
        priority,
        ...tssMessageSizeFields,
      });
    }

    for (const [id, priority] of this.externalBlockNodeMap) {
      const blockNodeComponent: ExternalBlockNodeStateSchema = this.externalBlockNodes.find(
        (component): boolean => component.id === id,
      );

      const address: string = blockNodeComponent.address;
      const port: number = blockNodeComponent.port;

      const tssMessageSizeFields: BlockNodeConnectionDatabase = this.resolveMessageSizeFields();

      blockNodeConnectionData.push({
        address,
        streamingPort: port,
        servicePort: port,
        priority,
        ...tssMessageSizeFields,
      });
    }

    return {
      nodes: blockNodeConnectionData,
    };
  }
}

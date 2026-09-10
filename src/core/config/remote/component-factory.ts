// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';

import {ComponentTypes} from './enumerations/component-types.js';
import {DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type NodeId} from '../../../types/aliases.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type PortForwardConfig,
  type PriorityMapping,
} from '../../../types/index.js';
import {type RemoteConfigRuntimeStateApi} from '../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type ComponentFactoryApi} from './api/component-factory-api.js';
import {ComponentStateMetadataSchema} from '../../../data/schema/model/remote/state/component-state-metadata-schema.js';
import {RelayNodeStateSchema} from '../../../data/schema/model/remote/state/relay-node-state-schema.js';
import {ExplorerStateSchema} from '../../../data/schema/model/remote/state/explorer-state-schema.js';
import {MirrorNodeStateSchema} from '../../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {HaProxyStateSchema} from '../../../data/schema/model/remote/state/ha-proxy-state-schema.js';
import {EnvoyProxyStateSchema} from '../../../data/schema/model/remote/state/envoy-proxy-state-schema.js';
import {ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {BlockNodeStateSchema} from '../../../data/schema/model/remote/state/block-node-state-schema.js';
import {PostgresStateSchema} from '../../../data/schema/model/remote/state/postgres-state-schema.js';
import {RedisStateSchema} from '../../../data/schema/model/remote/state/redis-state-schema.js';
import {Templates} from '../../templates.js';

@injectable()
export class ComponentFactory implements ComponentFactoryApi {
  public constructor(
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
  ) {
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
  }

  public createNewRelayComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayNodeStateSchema {
    return new RelayNodeStateSchema(this.getMetadata(ComponentTypes.RelayNodes, clusterReference, namespace), nodeIds);
  }

  public createNewExplorerComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): ExplorerStateSchema {
    return new ExplorerStateSchema(this.getMetadata(ComponentTypes.Explorer, clusterReference, namespace));
  }

  public createNewMirrorNodeComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): MirrorNodeStateSchema {
    return new MirrorNodeStateSchema(this.getMetadata(ComponentTypes.MirrorNode, clusterReference, namespace));
  }

  public createNewHaProxyComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): HaProxyStateSchema {
    return new HaProxyStateSchema(this.getMetadata(ComponentTypes.HaProxy, clusterReference, namespace));
  }

  public createNewEnvoyProxyComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): EnvoyProxyStateSchema {
    return new EnvoyProxyStateSchema(this.getMetadata(ComponentTypes.EnvoyProxy, clusterReference, namespace));
  }

  public createNewBlockNodeComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): BlockNodeStateSchema {
    return new BlockNodeStateSchema(this.getMetadata(ComponentTypes.BlockNode, clusterReference, namespace));
  }

  public createNewPostgresComponent(
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): PostgresStateSchema {
    return new PostgresStateSchema(this.getMetadata(ComponentTypes.Postgres, clusterReference, namespace));
  }

  public createNewRedisComponent(clusterReference: ClusterReferenceName, namespace: NamespaceName): RedisStateSchema {
    return new RedisStateSchema(this.getMetadata(ComponentTypes.Redis, clusterReference, namespace));
  }

  public createNewConsensusNodeComponent(
    id: ComponentId,
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
    portForwardConfigs?: PortForwardConfig[],
    blockNodeMap: PriorityMapping[] = [],
    externalBlockNodeMap: PriorityMapping[] = [],
  ): ConsensusNodeStateSchema {
    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(
      id,
      namespace.name,
      clusterReference,
      phase,
      portForwardConfigs,
    );

    return new ConsensusNodeStateSchema(metadata, blockNodeMap, externalBlockNodeMap);
  }

  public createConsensusNodeComponentsFromNodeIds(
    nodeIds: NodeId[],
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
    portForwardConfigs?: PortForwardConfig[],
  ): ConsensusNodeStateSchema[] {
    return nodeIds.map((nodeId: NodeId): ConsensusNodeStateSchema =>
      this.createNewConsensusNodeComponent(
        Templates.renderComponentIdFromNodeId(nodeId),
        clusterReference,
        namespace,
        DeploymentPhase.REQUESTED,
        portForwardConfigs,
      ),
    );
  }

  private getMetadata(
    componentType: ComponentTypes,
    clusterReference: ClusterReferenceName,
    namespace: NamespaceName,
  ): ComponentStateMetadataSchema {
    const id: ComponentId = this.remoteConfig.configuration.components.getNewComponentId(componentType);
    const phase: DeploymentPhase = DeploymentPhase.DEPLOYED;
    return new ComponentStateMetadataSchema(id, namespace.name, clusterReference, phase);
  }
}

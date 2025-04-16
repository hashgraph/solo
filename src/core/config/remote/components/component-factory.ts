// SPDX-License-Identifier: Apache-2.0

import {ComponentTypes} from '../enumerations/component-types.js';
import {ComponentNameTemplates} from './component-name-templates.js';
import {RelayComponent} from './relay-component.js';
import {MirrorNodeExplorerComponent} from './mirror-node-explorer-component.js';
import {MirrorNodeComponent} from './mirror-node-component.js';
import {HaProxyComponent} from './ha-proxy-component.js';
import {EnvoyProxyComponent} from './envoy-proxy-component.js';
import {Templates} from '../../../templates.js';
import {ConsensusNodeComponent} from './consensus-node-component.js';
import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {type RemoteConfigManagerApi} from '../api/remote-config-manager-api.js';
import {type ClusterReference, type ComponentId} from '../types.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAlias, type NodeAliases, type NodeId} from '../../../../types/aliases.js';

export class ComponentFactory {
  public static createNewRelayComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.Relay);

    return new RelayComponent(id, clusterReference, namespace.name, DeploymentPhase.DEPLOYED, nodeIds);
  }

  public static createNewExplorerComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeExplorerComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.MirrorNodeExplorer);

    return new MirrorNodeExplorerComponent(id, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewMirrorNodeComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.MirrorNode);

    return new MirrorNodeComponent(id, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewHaProxyComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): HaProxyComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.HaProxy);

    return new HaProxyComponent(id, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewEnvoyProxyComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): EnvoyProxyComponent {
    const id: ComponentId = remoteConfigManager.components.getNewComponentId(ComponentTypes.EnvoyProxy);

    return new EnvoyProxyComponent(id, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewConsensusNodeComponent(
    nodeId: NodeId,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeComponent {
    return new ConsensusNodeComponent(nodeId, clusterReference, namespace.name, phase, nodeId);
  }

  public static createConsensusNodeComponentsFromNodeAliases(
    nodeIds: NodeId[],
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): Record<ComponentId, ConsensusNodeComponent> {
    const consensusNodeComponents: Record<ComponentId, ConsensusNodeComponent> = {};

    for (const nodeId of nodeIds) {
      consensusNodeComponents[nodeId] = ComponentFactory.createNewConsensusNodeComponent(
        nodeId,
        clusterReference,
        namespace,
        DeploymentPhase.REQUESTED,
      );
    }

    return consensusNodeComponents;
  }
}

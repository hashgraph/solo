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
import {type ClusterReference, type ComponentName} from '../types.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAlias, type NodeAliases, type NodeId} from '../../../../types/aliases.js';

export class ComponentFactory {
  public static createNewRelayComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeIds: NodeId[],
  ): RelayComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.Relay);

    const name: ComponentName = ComponentNameTemplates.renderRelayName(index);

    return new RelayComponent(name, clusterReference, namespace.name, DeploymentPhase.DEPLOYED, nodeIds);
  }

  public static createNewExplorerComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeExplorerComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.MirrorNodeExplorer);

    const name: ComponentName = ComponentNameTemplates.renderMirrorNodeExplorerName(index);

    return new MirrorNodeExplorerComponent(name, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewMirrorNodeComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): MirrorNodeComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.MirrorNode);

    const name: ComponentName = ComponentNameTemplates.renderMirrorNodeName(index);

    return new MirrorNodeComponent(name, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewHaProxyComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
  ): HaProxyComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.HaProxy);

    const name: ComponentName = ComponentNameTemplates.renderHaProxyName(index, nodeAlias);

    return new HaProxyComponent(name, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewEnvoyProxyComponent(
    remoteConfigManager: RemoteConfigManagerApi,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
  ): EnvoyProxyComponent {
    const index: number = remoteConfigManager.components.getNewComponentIndex(ComponentTypes.EnvoyProxy);

    const name: ComponentName = ComponentNameTemplates.renderEnvoyProxyName(index, nodeAlias);

    return new EnvoyProxyComponent(name, clusterReference, namespace.name, DeploymentPhase.DEPLOYED);
  }

  public static createNewConsensusNodeComponent(
    nodeAlias: NodeAlias,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
    phase: DeploymentPhase.REQUESTED | DeploymentPhase.STARTED,
  ): ConsensusNodeComponent {
    const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
    return new ConsensusNodeComponent(nodeAlias, clusterReference, namespace.name, phase, nodeId);
  }

  public static createConsensusNodeComponentsFromNodeAliases(
    nodeAliases: NodeAliases,
    clusterReference: ClusterReference,
    namespace: NamespaceName,
  ): Record<ComponentName, ConsensusNodeComponent> {
    const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> = {};

    for (const nodeAlias of nodeAliases) {
      consensusNodeComponents[nodeAlias] = ComponentFactory.createNewConsensusNodeComponent(
        nodeAlias,
        clusterReference,
        namespace,
        DeploymentPhase.REQUESTED,
      );
    }

    return consensusNodeComponents;
  }
}

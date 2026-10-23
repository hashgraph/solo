// SPDX-License-Identifier: Apache-2.0

import {
  type ClusterReferenceName,
  type ClusterReferences,
  type Context,
  type DeploymentName,
  type Optional,
} from '../../../types/index.js';
import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {type AnyObject, type ArgvStruct, type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type LedgerPhase} from '../../../data/schema/model/remote/ledger-phase.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type ComponentFactoryApi} from '../../../core/config/remote/api/component-factory-api.js';
import {type RemoteConfig} from '../config/remote/remote-config.js';
import {type ComponentTypes} from '../../../core/config/remote/enumerations/component-types.js';
import {type SemanticVersion} from '../../utils/semantic-version.js';
import {type DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';

export interface RemoteConfigRuntimeStateApi {
  configuration?: RemoteConfig;

  getClusterRefs(): ClusterReferences;
  getContexts(): Context[];
  getConsensusNodes(): ConsensusNode[];
  deleteComponents(): Promise<void>;
  getNamespace(): NamespaceName;
  getLeaseContext(): Context;

  isLoaded(): boolean;
  load(namespace?: NamespaceName, context?: Context): Promise<void>;
  persist(): Promise<void>;

  create(
    argv: ArgvStruct,
    ledgerPhase: LedgerPhase,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void>;

  createFromExisting(
    namespace: NamespaceName,
    clusterReference: ClusterReferenceName,
    deployment: DeploymentName,
    componentFactory: ComponentFactoryApi,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
    existingClusterContext: Context,
    argv: ArgvStruct,
    nodeAliases: NodeAliases,
  ): Promise<void>;

  addCommandToHistory(command: string): void;
  createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap>;

  remoteConfigExists(namespace: NamespaceName, context: Context): Promise<boolean>;
  populateFromExisting(namespace: NamespaceName, context: Context): Promise<void>;

  loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate?: boolean,
    skipConsensusNodesValidation?: boolean,
  ): Promise<void>;

  extractContextFromConsensusNodes(nodeAlias: NodeAlias): Optional<string>;

  updateComponentVersion(type: ComponentTypes, version: SemanticVersion<string>): void;

  getComponentVersion(type: ComponentTypes): SemanticVersion<string>;

  getComponentPhasesMap(): Map<ComponentTypes, DeploymentPhase>;
}

// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfigDataWrapper} from '../remote-config-data-wrapper.js';
import {type ClusterReference, type ClusterReferences, type Context, type DeploymentName} from '../types.js';
import {type ComponentsDataWrapper} from '../components-data-wrapper.js';
import {type Cluster} from '../cluster.js';
import {type AnyObject, type ArgvStruct, type NodeAliases} from '../../../../types/aliases.js';
import {type DeploymentStates} from '../enumerations/deployment-states.js';
import {type NamespaceName} from '../../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../model/consensus-node.js';
import {type ConfigMap} from '../../../../integration/kube/resources/config-map/config-map.js';

export interface RemoteConfigManagerApi {
  /** @returns the default cluster from kubectl */
  get currentCluster(): ClusterReference;

  /** @returns the components data wrapper cloned */
  get components(): ComponentsDataWrapper;

  /**
   * @returns the remote configuration data's clusters cloned
   */
  get clusters(): Record<ClusterReference, Cluster>;

  /**
   * Modifies the loaded remote configuration data using a provided callback function.
   * The callback operates on the configuration data, which is then saved to the cluster.
   *
   * @param callback - an async function that modifies the remote configuration data.
   * @throws if the configuration is not loaded before modification, will throw a SoloError {@link SoloError}
   */
  modify(callback: (remoteConfig: RemoteConfigDataWrapper) => Promise<void>): Promise<void>;

  /**
   * Creates a new remote configuration in the Kubernetes cluster.
   * Gathers data from the local configuration and constructs a new ConfigMap
   * entry in the cluster with initial command history and metadata.
   */
  create(
    argv: ArgvStruct,
    state: DeploymentStates,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterReference: ClusterReference,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void>;

  /**
   * Loads the remote configuration, performs a validation and returns it
   * @returns RemoteConfigDataWrapper
   */
  get(context?: Context): Promise<RemoteConfigDataWrapper>;

  /** Unload the remote config from the remote config manager. */
  unload(): void;

  /**
   * Performs the loading of the remote configuration.
   * Checks if the configuration is already loaded, otherwise loads and adds the command to history.
   *
   * @param argv - arguments containing command input for historical reference.
   * @param validate - whether to validate the remote configuration.
   * @param [skipConsensusNodesValidation] - whether or not to validate the consensusNodes
   */
  loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate: boolean,
    skipConsensusNodesValidation: boolean,
  ): Promise<void>;

  /** Empties the component data inside the remote config */
  deleteComponents(): Promise<void>;

  /** @returns if the remote config is already loaded */
  isLoaded(): boolean;

  /**
   * Retrieves the ConfigMap containing the remote configuration from the Kubernetes cluster.
   *
   * @param namespace - The namespace to search for the ConfigMap.
   * @param context - The context to use for the Kubernetes client.
   * @returns the remote configuration data.
   * @throws if the ConfigMap could not be read and the error is not a 404 status, will throw a SoloError {@link SoloError}
   */
  getConfigMap(namespace?: NamespaceName, context?: Context): Promise<ConfigMap>;

  /**
   * Creates a new ConfigMap entry in the Kubernetes cluster with the remote configuration data.
   */
  createConfigMap(context?: Context): Promise<void>;

  /**
   * Get the consensus nodes from the remoteConfigManager and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  getConsensusNodes(): ConsensusNode[];

  /**
   * Gets a list of distinct contexts from the consensus nodes.
   * @returns an array of context strings.
   */
  getContexts(): Context[];

  /**
   * Gets a list of distinct cluster references from the consensus nodes.
   * @returns an object of cluster references.
   */
  getClusterRefs(): ClusterReferences;
}

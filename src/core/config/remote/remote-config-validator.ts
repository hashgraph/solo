// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../constants.js';
import {SoloError} from '../../errors/solo-error.js';
import {ConsensusNodeStates} from './enumerations.js';

import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type BaseComponent} from './components/base-component.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type LocalConfig} from '../local/local-config.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  /**
   * Gathers and handles validation of all components.
   *
   * @param namespace - namespace to validate the components in.
   * @param components - components to validate.
   * @param k8Factory - to validate the elements.
   * @param localConfig - to get the context from cluster
   * @param skipConsensusNodes - whether to validate consensus nodes
   */
  public static async validateComponents(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    skipConsensusNodes: boolean,
  ): Promise<void> {
    await Promise.all([
      ...RemoteConfigValidator.validateRelays(namespace, components, k8Factory, localConfig),
      ...RemoteConfigValidator.validateHaProxies(namespace, components, k8Factory, localConfig),
      ...RemoteConfigValidator.validateMirrorNodes(namespace, components, k8Factory, localConfig),
      ...RemoteConfigValidator.validateEnvoyProxies(namespace, components, k8Factory, localConfig),
      ...RemoteConfigValidator.validateMirrorNodeExplorers(namespace, components, k8Factory, localConfig),
      ...(skipConsensusNodes
        ? []
        : RemoteConfigValidator.validateConsensusNodes(namespace, components, k8Factory, localConfig)),
    ]);
  }

  private static validateRelays(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
  ): Promise<void>[] {
    return Object.values(components.relays).map(async component => {
      const context = localConfig.clusterRefs[component.cluster];
      const labels = [constants.SOLO_RELAY_LABEL];
      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (!pods.length) {
          throw new Error('Pod not found');
        } // to return the generic error message
      } catch (error) {
        RemoteConfigValidator.throwValidationError('Relay', component, error);
      }
    });
  }

  private static validateHaProxies(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
  ): Promise<void>[] {
    return Object.values(components.haProxies).map(async component => {
      const context = localConfig.clusterRefs[component.cluster];
      const labels = [`app=${component.name}`];
      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (!pods.length) {
          throw new Error('Pod not found');
        } // to return the generic error message
      } catch (error) {
        RemoteConfigValidator.throwValidationError('HaProxy', component, error);
      }
    });
  }

  private static validateMirrorNodes(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
  ): Promise<void>[] {
    return Object.values(components.mirrorNodes).map(async component => {
      const context = localConfig.clusterRefs[component.cluster];
      const labels = constants.SOLO_HEDERA_MIRROR_IMPORTER;
      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (!pods.length) {
          throw new Error('Pod not found');
        } // to return the generic error message
      } catch (error) {
        RemoteConfigValidator.throwValidationError('Mirror node', component, error);
      }
    });
  }

  private static validateEnvoyProxies(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
  ): Promise<void>[] {
    return Object.values(components.envoyProxies).map(async component => {
      const context = localConfig.clusterRefs[component.cluster];
      const labels = [`app=${component.name}`];
      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (!pods.length) {
          throw new Error('Pod not found');
        } // to return the generic error message
      } catch (error) {
        RemoteConfigValidator.throwValidationError('Envoy proxy', component, error);
      }
    });
  }

  private static validateConsensusNodes(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
  ): Promise<void>[] {
    return Object.values(components.consensusNodes).map(async component => {
      if (component.state === ConsensusNodeStates.REQUESTED || component.state === ConsensusNodeStates.NON_DEPLOYED) {
        return;
      }

      const context = localConfig.clusterRefs[component.cluster];
      const labels = [`app=network-${component.name}`];
      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (!pods.length) {
          throw new Error('Pod not found');
        } // to return the generic error message
      } catch (error) {
        RemoteConfigValidator.throwValidationError('Consensus node', component, error);
      }
    });
  }

  private static validateMirrorNodeExplorers(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
  ): Promise<void>[] {
    return Object.values(components.mirrorNodeExplorers).map(async component => {
      const context = localConfig.clusterRefs[component.cluster];
      const labels = [constants.SOLO_HEDERA_EXPLORER_LABEL];
      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (!pods.length) {
          throw new Error('Pod not found');
        } // to return the generic error message
      } catch (error) {
        RemoteConfigValidator.throwValidationError('Mirror node explorer', component, error);
      }
    });
  }

  /**
   * Generic handler that throws errors.
   *
   * @param type - name to display in error message
   * @param component - component which is not found in the cluster
   * @param error - original error for the kube client
   */
  private static throwValidationError(type: string, component: BaseComponent, error: Error | unknown): never {
    throw new SoloError(
      `${type} in remote config with name ${component.name} ` +
        `was not found in namespace: ${component.namespace}, cluster: ${component.cluster}`,
      error,
      {component: component.toObject()},
    );
  }
}

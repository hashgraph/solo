/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as constants from '../../constants.js';
import {SoloError} from '../../errors.js';

import {type K8Factory} from '../../kube/k8_factory.js';
import {type ComponentsDataWrapper} from './components_data_wrapper.js';
import {type BaseComponent} from './components/base_component.js';
import {type NamespaceName} from '../../kube/resources/namespace/namespace_name.js';
import {type V1Pod} from '@kubernetes/client-node';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  /**
   * Gathers together and handles validation of all components.
   *
   * @param namespace - namespace to validate the components in.
   * @param components - components which to validate.
   * @param k8Factory - to validate the elements.
   * TODO: Make compatible with multi-cluster K8 implementation
   */
  public static async validateComponents(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void> {
    await Promise.all([
      ...RemoteConfigValidator.validateRelays(namespace, components, k8Factory),
      ...RemoteConfigValidator.validateHaProxies(namespace, components, k8Factory),
      ...RemoteConfigValidator.validateMirrorNodes(namespace, components, k8Factory),
      ...RemoteConfigValidator.validateEnvoyProxies(namespace, components, k8Factory),
      ...RemoteConfigValidator.validateConsensusNodes(namespace, components, k8Factory),
      ...RemoteConfigValidator.validateMirrorNodeExplorers(namespace, components, k8Factory),
    ]);
  }

  private static validateRelays(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void>[] {
    return Object.values(components.relays).map(async component => {
      try {
        const pods: V1Pod[] = await k8Factory.default().pods().list(namespace, [constants.SOLO_RELAY_LABEL]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Relay', component, e);
      }
    });
  }

  private static validateHaProxies(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void>[] {
    return Object.values(components.haProxies).map(async component => {
      try {
        const pods: V1Pod[] = await k8Factory
          .default()
          .pods()
          .list(namespace, [`app=${component.name}`]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('HaProxy', component, e);
      }
    });
  }

  private static validateMirrorNodes(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void>[] {
    return Object.values(components.mirrorNodes).map(async component => {
      try {
        const pods: V1Pod[] = await k8Factory.default().pods().list(namespace, constants.SOLO_HEDERA_MIRROR_IMPORTER);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Mirror node', component, e);
      }
    });
  }

  private static validateEnvoyProxies(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void>[] {
    return Object.values(components.envoyProxies).map(async component => {
      try {
        const pods: V1Pod[] = await k8Factory
          .default()
          .pods()
          .list(namespace, [`app=${component.name}`]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Envoy proxy', component, e);
      }
    });
  }

  private static validateConsensusNodes(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void>[] {
    return Object.values(components.consensusNodes).map(async component => {
      try {
        const pods: V1Pod[] = await k8Factory
          .default()
          .pods()
          .list(namespace, [`app=network-${component.name}`]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Consensus node', component, e);
      }
    });
  }

  private static validateMirrorNodeExplorers(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
  ): Promise<void>[] {
    return Object.values(components.mirrorNodeExplorers).map(async component => {
      try {
        const pods: V1Pod[] = await k8Factory.default().pods().list(namespace, [constants.SOLO_HEDERA_EXPLORER_LABEL]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Mirror node explorer', component, e);
      }
    });
  }

  /**
   * Generic handler that throws errors.
   *
   * @param type - name to display in error message
   * @param component - component which is not found in the cluster
   * @param e - original error for the kube client
   */
  private static throwValidationError(type: string, component: BaseComponent, e: Error | unknown): never {
    throw new SoloError(
      `${type} in remote config with name ${component.name} ` +
        `was not found in namespace: ${component.namespace}, cluster: ${component.cluster}`,
      e,
      {component: component.toObject()},
    );
  }
}

/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as constants from '../../constants.js';
import {SoloError} from '../../errors.js';

import {type K8} from '../../kube/k8.js';
import {type ComponentsDataWrapper} from './components_data_wrapper.js';
import {type BaseComponent} from './components/base_component.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  /**
   * Gathers together and handles validation of all components.
   *
   * @param components - components which to validate.
   * @param k8 - to validate the elements.
   * TODO: Make compatible with multi-cluster K8 implementation
   */
  public static async validateComponents(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all([
      ...RemoteConfigValidator.validateRelays(components, k8),
      ...RemoteConfigValidator.validateHaProxies(components, k8),
      ...RemoteConfigValidator.validateMirrorNodes(components, k8),
      ...RemoteConfigValidator.validateEnvoyProxies(components, k8),
      ...RemoteConfigValidator.validateConsensusNodes(components, k8),
      ...RemoteConfigValidator.validateMirrorNodeExplorers(components, k8),
    ]);
  }

  private static validateRelays(components: ComponentsDataWrapper, k8: K8): Promise<void>[] {
    return Object.values(components.relays).map(async component => {
      try {
        const pods = await k8.getPodsByLabel([constants.SOLO_RELAY_LABEL]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Relay', component, e);
      }
    });
  }

  private static validateHaProxies(components: ComponentsDataWrapper, k8: K8): Promise<void>[] {
    return Object.values(components.haProxies).map(async component => {
      try {
        const pods = await k8.getPodsByLabel([`app=${component.name}`]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('HaProxy', component, e);
      }
    });
  }

  private static validateMirrorNodes(components: ComponentsDataWrapper, k8: K8): Promise<void>[] {
    return Object.values(components.mirrorNodes).map(async component => {
      try {
        const pods = await k8.getPodsByLabel(constants.SOLO_HEDERA_MIRROR_IMPORTER);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Mirror node', component, e);
      }
    });
  }

  private static validateEnvoyProxies(components: ComponentsDataWrapper, k8: K8): Promise<void>[] {
    return Object.values(components.envoyProxies).map(async component => {
      try {
        const pods = await k8.getPodsByLabel([`app=${component.name}`]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Envoy proxy', component, e);
      }
    });
  }

  private static validateConsensusNodes(components: ComponentsDataWrapper, k8: K8): Promise<void>[] {
    return Object.values(components.consensusNodes).map(async component => {
      try {
        const pods = await k8.getPodsByLabel([`app=network-${component.name}`]);

        // to return the generic error message
        if (!pods.length) throw new Error('Pod not found');
      } catch (e) {
        RemoteConfigValidator.throwValidationError('Consensus node', component, e);
      }
    });
  }

  private static validateMirrorNodeExplorers(components: ComponentsDataWrapper, k8: K8): Promise<void>[] {
    return Object.values(components.mirrorNodeExplorers).map(async component => {
      try {
        const pods = await k8.getPodsByLabel([constants.SOLO_HEDERA_EXPLORER_LABEL]);

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

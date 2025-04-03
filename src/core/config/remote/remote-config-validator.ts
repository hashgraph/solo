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
import {type Context} from './types.js';
import {type ConsensusNodeComponent} from './components/consensus-node-component.js';

type validationCallback = (
  namespace: NamespaceName,
  components: ComponentsDataWrapper,
  k8Factory: K8Factory,
  localConfig: LocalConfig,
) => Promise<void>[];

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  private static componentValidations: Record<
    string,
    {label: string[] | ((c: BaseComponent) => string[]); type: string; skipCondition?: (c: BaseComponent) => boolean}
  > = {
    relays: {label: [constants.SOLO_RELAY_LABEL], type: 'Relay'},
    haProxies: {label: (c: BaseComponent): string[] => [`app=${c.name}`], type: 'HaProxy'},
    mirrorNodes: {label: constants.SOLO_HEDERA_MIRROR_IMPORTER, type: 'Block nodes'},
    envoyProxies: {label: (c: BaseComponent): string[] => [`app=${c.name}`], type: 'Envoy proxy'},
    mirrorNodeExplorers: {label: [constants.SOLO_HEDERA_EXPLORER_LABEL], type: 'Mirror node explorer'},
    blockNodes: {label: (c: BaseComponent): string[] => [`app.kubernetes.io/instance=${c.name}`], type: 'Block nodes'},
    consensusNodes: {
      label: (c: BaseComponent): string[] => [`app=network-${c.name}`],
      type: 'Consensus node',
      skipCondition(c: ConsensusNodeComponent): boolean {
        return c.state === ConsensusNodeStates.REQUESTED || c.state === ConsensusNodeStates.NON_DEPLOYED;
      },
    },
  };

  public static async validateComponents(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    skipConsensusNodes: boolean
  ): Promise<void> {
    const validations = Object.entries(this.componentValidations)
      .filter(([key]) => key !== 'consensusNodes' || !skipConsensusNodes)
      .flatMap(([key, { label, type, skipCondition }]) =>
        this.validateComponentList(namespace, components[key as keyof ComponentsDataWrapper], k8Factory, localConfig, label, type, skipCondition)
      )

    await Promise.all(validations)
  }

  private static validateComponentList(
    namespace: NamespaceName,
    components: Record<string, BaseComponent>,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    label: string[] | ((c: BaseComponent) => string[]),
    type: string,
    skipCondition?: (component: BaseComponent) => boolean
  ): Promise<void>[] {
    return Object.values(components).map(async (component) => {
      if (skipCondition?.(component)) return

      await this.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        typeof label === 'function' ? label(component) : label,
        type
      )
    })
  }

  //

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
    const validationCallbacks: validationCallback[] = [
      RemoteConfigValidator.validateRelays,
      RemoteConfigValidator.validateHaProxies,
      RemoteConfigValidator.validateMirrorNodes,
      RemoteConfigValidator.validateEnvoyProxies,
      RemoteConfigValidator.validateMirrorNodeExplorers,
      RemoteConfigValidator.validateBlockNodes,
    ];

    if (!skipConsensusNodes) {
      validationCallbacks.push(RemoteConfigValidator.validateConsensusNodes);
    }

    await Promise.all(
      validationCallbacks.flatMap((validator): Promise<void>[] =>
        validator(namespace, components, k8Factory, localConfig),
      ),
    );
  }

  private static validateRelays: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.relays).map(async (component): Promise<void> => {
      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        [constants.SOLO_RELAY_LABEL],
        'Relay',
      );
    });
  };

  private static validateHaProxies: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.haProxies).map(async (component): Promise<void> => {
      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        [`app=${component.name}`],
        'HaProxy',
      );
    });
  };

  private static validateMirrorNodes: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.mirrorNodes).map(async (component): Promise<void> => {
      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        constants.SOLO_HEDERA_MIRROR_IMPORTER,
        'Block nodes',
      );
    });
  };

  private static validateEnvoyProxies: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.envoyProxies).map(async (component): Promise<void> => {
      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        [`app=${component.name}`],
        'Envoy proxy',
      );
    });
  };

  private static validateConsensusNodes: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.consensusNodes).map(async (component): Promise<void> => {
      if (component.state === ConsensusNodeStates.REQUESTED || component.state === ConsensusNodeStates.NON_DEPLOYED) {
        return;
      }

      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        [`app=network-${component.name}`],
        'Consensus node',
      );
    });
  };

  private static validateMirrorNodeExplorers: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.mirrorNodeExplorers).map(async (component): Promise<void> => {
      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        [constants.SOLO_HEDERA_EXPLORER_LABEL],
        'Mirror node explorer',
      );
    });
  };

  private static validateBlockNodes: validationCallback = (
    namespace,
    components,
    k8Factory,
    localConfig,
  ): Promise<void>[] => {
    return Object.values(components.blockNodes).map(async (component): Promise<void> => {
      await RemoteConfigValidator.validateComponent(
        namespace,
        component,
        k8Factory,
        localConfig.clusterRefs[component.cluster],
        [`app.kubernetes.io/instance=${component.name}`],
        'Block nodes',
      );
    });
  };

  private static async validateComponent(
    namespace: NamespaceName,
    component: BaseComponent,
    k8Factory: K8Factory,
    context: Context,
    labels: string[],
    errorType: string,
  ): Promise<void> {
    try {
      const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

      if (pods.length === 0) {
        throw new Error('Pod not found'); // to return the generic error message
      }
    } catch (error) {
      RemoteConfigValidator.throwValidationError(errorType, component, error);
    }
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

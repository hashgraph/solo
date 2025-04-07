// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../constants.js';
import {SoloError} from '../../errors/solo-error.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {ComponentStates} from './enumerations/component-states.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type BaseComponent} from './components/base-component.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type LocalConfig} from '../local/local-config.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';
import {type Context} from './types.js';
import {type ConsensusNodeComponent} from './components/consensus-node-component.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  private static getRelayLabels(): string[] {
    return [constants.SOLO_RELAY_LABEL];
  }

  private static getHaProxyLabels(component: BaseComponent): string[] {
    return [`app=${component.name}`];
  }

  private static getMirrorNodeLabels(): string[] {
    return constants.SOLO_HEDERA_MIRROR_IMPORTER;
  }

  private static getEnvoyProxyLabels(component: BaseComponent): string[] {
    return [`app=${component.name}`];
  }

  private static getMirrorNodeExplorerLabels(): string[] {
    return [constants.SOLO_HEDERA_EXPLORER_LABEL];
  }

  private static getBlockNodeLabels(component: BaseComponent): string[] {
    return [`app.kubernetes.io/instance=${component.name}`];
  }

  private static getConsensusNodeLabels(component: BaseComponent): string[] {
    return [`app=network-${component.name}`];
  }

  private static consensusNodeSkipConditionCallback(nodeComponent: ConsensusNodeComponent): boolean {
    return (
      nodeComponent.nodeState === ConsensusNodeStates.REQUESTED ||
      nodeComponent.nodeState === ConsensusNodeStates.NON_DEPLOYED
    );
  }

  private static componentValidations: Record<
    string,
    {
      getLabelsCallback: (component: BaseComponent) => string[];
      type: string;
      skipCondition?: (component: BaseComponent) => boolean;
    }
  > = {
    relays: {
      type: 'Relay',
      getLabelsCallback: RemoteConfigValidator.getRelayLabels,
    },
    haProxies: {
      type: 'HaProxy',
      getLabelsCallback: RemoteConfigValidator.getHaProxyLabels,
    },
    mirrorNodes: {
      type: 'Block nodes',
      getLabelsCallback: RemoteConfigValidator.getMirrorNodeLabels,
    },
    envoyProxies: {
      type: 'Envoy proxy',
      getLabelsCallback: RemoteConfigValidator.getEnvoyProxyLabels,
    },
    mirrorNodeExplorers: {
      type: 'Mirror node explorer',
      getLabelsCallback: RemoteConfigValidator.getMirrorNodeExplorerLabels,
    },
    blockNodes: {
      type: 'Block nodes',
      getLabelsCallback: RemoteConfigValidator.getBlockNodeLabels,
    },
    consensusNodes: {
      type: 'Consensus node',
      getLabelsCallback: RemoteConfigValidator.getConsensusNodeLabels,
      skipCondition: RemoteConfigValidator.consensusNodeSkipConditionCallback,
    },
  };

  public static async validateComponents(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    skipConsensusNodes: boolean,
  ): Promise<void> {
    const validationPromises: Promise<void>[] = Object.entries(RemoteConfigValidator.componentValidations)
      .filter(([key]) => key !== 'consensusNodes' || !skipConsensusNodes)
      .flatMap(([key, {getLabelsCallback, type, skipCondition}]): Promise<void>[] =>
        RemoteConfigValidator.validateComponentList(
          namespace,
          components[key],
          k8Factory,
          localConfig,
          getLabelsCallback,
          type,
          skipCondition,
        ),
      );

    await Promise.all(validationPromises);
  }

  private static validateComponentList(
    namespace: NamespaceName,
    components: Record<string, BaseComponent>,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    getLabelsCallback: (component: BaseComponent) => string[],
    type: string,
    skipCondition?: (component: BaseComponent) => boolean,
  ): Promise<void>[] {
    return Object.values(components).map(async (component): Promise<void> => {
      if (component.state === ComponentStates.DELETED) {
        return;
      }
      if (skipCondition?.(component)) {
        return;
      }

      const context: Context = localConfig.clusterRefs[component.cluster];
      const labels: string[] = getLabelsCallback(component);

      await RemoteConfigValidator.validateComponent(namespace, component, k8Factory, context, labels, type);
    });
  }

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
      throw RemoteConfigValidator.buildValidationError(errorType, component, error);
    }
  }

  /**
   * Generic handler that throws errors.
   *
   * @param type - name to display in error message
   * @param component - component which is not found in the cluster
   * @param error - original error for the kube client
   */
  private static buildValidationError(type: string, component: BaseComponent, error: Error | unknown): SoloError {
    return new SoloError(
      `${type} in remote config with name ${component.name} ` +
        `was not found in namespace: ${component.namespace}, cluster: ${component.cluster}`,
      error,
      {component: component.toObject()},
    );
  }
}

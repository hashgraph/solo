// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../constants.js';
import {SoloError} from '../../errors/solo-error.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {ComponentStates} from './enumerations/component-states.js';
import {type ConsensusNodeComponent} from './components/consensus-node-component.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type BaseComponent} from './components/base-component.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type LocalConfig} from '../local/local-config.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';
import {type Context} from './types.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  private static getRelayLabels(): string[] {
    return [constants.SOLO_RELAY_LABEL];
  }

  private static getHaProxyLabels(component: BaseComponent): string[] {
    const name: string = component.name.split('-').slice(0, -1).join('-');
    return [`app=${name}`];
  }

  private static getMirrorNodeLabels(): string[] {
    return constants.SOLO_HEDERA_MIRROR_IMPORTER;
  }

  private static getEnvoyProxyLabels(component: BaseComponent): string[] {
    const name: string = component.name.split('-').slice(0, -1).join('-');
    return [`app=${name}`];
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

  private static componentValidationsMapping: Record<
    string,
    {
      getLabelsCallback: (component: BaseComponent) => string[];
      displayName: string;
      skipCondition?: (component: BaseComponent) => boolean;
    }
  > = {
    relays: {
      displayName: 'Relay',
      getLabelsCallback: RemoteConfigValidator.getRelayLabels,
    },
    haProxies: {
      displayName: 'HaProxy',
      getLabelsCallback: RemoteConfigValidator.getHaProxyLabels,
    },
    mirrorNodes: {
      displayName: 'Mirror node',
      getLabelsCallback: RemoteConfigValidator.getMirrorNodeLabels,
    },
    envoyProxies: {
      displayName: 'Envoy proxy',
      getLabelsCallback: RemoteConfigValidator.getEnvoyProxyLabels,
    },
    mirrorNodeExplorers: {
      displayName: 'Mirror node explorer',
      getLabelsCallback: RemoteConfigValidator.getMirrorNodeExplorerLabels,
    },
    blockNodes: {
      displayName: 'Block node',
      getLabelsCallback: RemoteConfigValidator.getBlockNodeLabels,
    },
    consensusNodes: {
      displayName: 'Consensus node',
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
    const validationPromises: Promise<void>[] = Object.entries(RemoteConfigValidator.componentValidationsMapping)
      .filter(([key]) => key !== 'consensusNodes' || !skipConsensusNodes)
      .flatMap(([key, {getLabelsCallback, displayName, skipCondition}]): Promise<void>[] =>
        RemoteConfigValidator.validateComponentGroup(
          namespace,
          components[key],
          k8Factory,
          localConfig,
          getLabelsCallback,
          displayName,
          skipCondition,
        ),
      );

    await Promise.all(validationPromises);
  }

  private static validateComponentGroup(
    namespace: NamespaceName,
    components: Record<string, BaseComponent>,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    getLabelsCallback: (component: BaseComponent) => string[],
    displayName: string,
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

      try {
        const pods: Pod[] = await k8Factory.getK8(context).pods().list(namespace, labels);

        if (pods.length === 0) {
          throw new Error('Pod not found'); // to return the generic error message
        }
      } catch (error) {
        throw RemoteConfigValidator.buildValidationError(displayName, component, error);
      }
    });
  }

  /**
   * Generic handler that throws errors.
   *
   * @param displayName - name to display in error message
   * @param component - component which is not found in the cluster
   * @param error - original error for the kube client
   */
  private static buildValidationError(
    displayName: string,
    component: BaseComponent,
    error: Error | unknown,
  ): SoloError {
    return new SoloError(
      RemoteConfigValidator.buildValidationErrorMessage(displayName, component),
      error,
      component.toObject(),
    );
  }

  public static buildValidationErrorMessage(displayName: string, component: BaseComponent): string {
    return (
      `${displayName} in remote config with name ${component.name} was not found in ` +
      `namespace: ${component.namespace}, ` +
      `cluster: ${component.cluster}`
    );
  }
}

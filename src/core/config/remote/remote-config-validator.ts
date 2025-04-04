// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../constants.js';
import {SoloError} from '../../errors/solo-error.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type BaseComponent} from './components/base-component.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type LocalConfig} from '../local/local-config.js';
import {type Pod} from '../../../integration/kube/resources/pod/pod.js';
import {type Context} from './types.js';
import {type ConsensusNodeComponent} from './components/consensus-node-component.js';
import {ConsensusNodeStates} from './enumerations/consensus-node-states.js';
import {ComponentStates} from './enumerations/component-states.js';

/**
 * Static class is used to validate that components in the remote config
 * are present in the kubernetes cluster, and throw errors if there is mismatch.
 */
export class RemoteConfigValidator {
  private static componentValidations: Record<
    string,
    {
      label: string[] | ((c: BaseComponent) => string[]);
      type: string;
      skipCondition?: (c: BaseComponent) => boolean;
    }
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
        return c.nodeState === ConsensusNodeStates.REQUESTED || c.nodeState === ConsensusNodeStates.NON_DEPLOYED;
      },
    },
  };

  public static async validateComponents(
    namespace: NamespaceName,
    components: ComponentsDataWrapper,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    skipConsensusNodes: boolean,
  ): Promise<void> {
    const validations: Promise<void>[] = Object.entries(this.componentValidations)
      .filter(([key]): boolean => key !== 'consensusNodes' || !skipConsensusNodes)
      .flatMap(([key, {label, type, skipCondition}]): Promise<void>[] =>
        this.validateComponentList(namespace, components[key], k8Factory, localConfig, label, type, skipCondition),
      );

    await Promise.all(validations);
  }

  private static validateComponentList(
    namespace: NamespaceName,
    components: Record<string, BaseComponent>,
    k8Factory: K8Factory,
    localConfig: LocalConfig,
    label: string[] | ((c: BaseComponent) => string[]),
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
      const labels: string[] = typeof label === 'function' ? label(component) : label;

      await this.validateComponent(namespace, component, k8Factory, context, labels, type);
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

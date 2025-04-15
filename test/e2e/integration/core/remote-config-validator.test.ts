// SPDX-License-Identifier: Apache-2.0

import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {RemoteConfigValidator} from '../../../../src/core/config/remote/remote-config-validator.js';
import {ComponentsDataWrapper} from '../../../../src/core/config/remote/components-data-wrapper.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {type RelayComponent} from '../../../../src/core/config/remote/components/relay-component.js';
import {type HaProxyComponent} from '../../../../src/core/config/remote/components/ha-proxy-component.js';
import {type MirrorNodeComponent} from '../../../../src/core/config/remote/components/mirror-node-component.js';
import {type ConsensusNodeComponent} from '../../../../src/core/config/remote/components/consensus-node-component.js';
import {type MirrorNodeExplorerComponent} from '../../../../src/core/config/remote/components/mirror-node-explorer-component.js';
import {type EnvoyProxyComponent} from '../../../../src/core/config/remote/components/envoy-proxy-component.js';

import {type NodeAlias, type NodeAliases} from '../../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {LocalConfig} from '../../../../src/core/config/local/local-config.js';
import {getTestCacheDirectory} from '../../../test-utility.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {LocalConfigDataWrapper} from '../../../../src/core/config/local/local-config-data-wrapper.js';
import {ConsensusNodeStates} from '../../../../src/core/config/remote/enumerations/consensus-node-states.js';
import {type ClusterReference, type ComponentName} from '../../../../src/core/config/remote/types.js';
import {ComponentFactory} from '../../../../src/core/config/remote/components/component-factory.js';
import {type BaseComponent} from '../../../../src/core/config/remote/components/base-component.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';

interface ComponentsRecord {
  explorer: MirrorNodeExplorerComponent;
  mirrorNode: MirrorNodeComponent;
  relay: RelayComponent;
  consensusNode: ConsensusNodeComponent;
  haProxy: HaProxyComponent;
  envoyProxy: EnvoyProxyComponent;
}

interface LabelRecord {
  explorer: string[];
  mirrorNode: string[];
  relay: string[];
  consensusNode: string[];
  haProxy: string[];
  envoyProxy: string[];
}

interface ComponentsData {
  namespace: NamespaceName;
  components: ComponentsRecord;
  labelRecord: LabelRecord;
  componentsDataWrapper: ComponentsDataWrapper;
}

function prepareComponentsData(namespace: NamespaceName): ComponentsData {
  const remoteConfigManagerMock: any = {components: {getNewComponentIndex: (): number => 1}};

  const clusterReference: ClusterReference = 'cluster';
  const nodeState: ConsensusNodeStates = ConsensusNodeStates.STARTED;
  const nodeAlias: NodeAlias = 'node1';

  const components: ComponentsRecord = {
    explorer: ComponentFactory.createNewExplorerComponent(remoteConfigManagerMock, clusterReference, namespace),
    mirrorNode: ComponentFactory.createNewMirrorNodeComponent(remoteConfigManagerMock, clusterReference, namespace),
    relay: ComponentFactory.createNewRelayComponent(remoteConfigManagerMock, clusterReference, namespace, [nodeAlias]),
    consensusNode: ComponentFactory.createNewConsensusNodeComponent(nodeAlias, clusterReference, namespace, nodeState),
    haProxy: ComponentFactory.createNewHaProxyComponent(
      remoteConfigManagerMock,
      clusterReference,
      namespace,
      nodeAlias,
    ),
    envoyProxy: ComponentFactory.createNewEnvoyProxyComponent(
      remoteConfigManagerMock,
      clusterReference,
      namespace,
      nodeAlias,
    ),
  };

  const labelRecord: LabelRecord = {
    // @ts-expect-error - to access private property
    relay: RemoteConfigValidator.getRelayLabels(),
    // @ts-expect-error - to access private property
    haProxy: RemoteConfigValidator.getHaProxyLabels(components.haProxy),
    // @ts-expect-error - to access private property
    mirrorNode: RemoteConfigValidator.getMirrorNodeLabels(),
    // @ts-expect-error - to access private property
    envoyProxy: RemoteConfigValidator.getEnvoyProxyLabels(components.envoyProxy),
    // @ts-expect-error - to access private property
    explorer: RemoteConfigValidator.getMirrorNodeExplorerLabels(),
    // @ts-expect-error - to access private property
    consensusNode: RemoteConfigValidator.getConsensusNodeLabels(components.consensusNode),
  };

  const componentsDataWrapper: ComponentsDataWrapper = ComponentsDataWrapper.initializeEmpty();

  return {namespace, components, labelRecord, componentsDataWrapper};
}

describe('RemoteConfigValidator', () => {
  const namespace: NamespaceName = NamespaceName.of('remote-config-validator');

  let k8Factory: K8Factory;
  let localConfig: LocalConfig;
  const filePath: string = `${getTestCacheDirectory('LocalConfig')}/localConfig.yaml`;

  let components: ComponentsRecord;
  let labelRecord: LabelRecord;
  let componentsDataWrapper: ComponentsDataWrapper;

  before(async () => {
    k8Factory = container.resolve(InjectTokens.K8Factory);
    localConfig = new LocalConfig(filePath);
    // @ts-expect-error - TS2341: to mock
    localConfig.localConfigData = new LocalConfigDataWrapper('test@test.com', '0.0.1', {}, {});
    await k8Factory.default().namespaces().create(namespace);
  });

  beforeEach(() => {
    const testData: ComponentsData = prepareComponentsData(namespace);
    components = testData.components;
    labelRecord = testData.labelRecord;
    componentsDataWrapper = testData.componentsDataWrapper;
  });

  after(async function () {
    this.timeout(Duration.ofMinutes(5).toMillis());
    await k8Factory.default().namespaces().delete(namespace);
  });

  async function createPod(name: string, labelsRaw: string[]): Promise<void> {
    const labels: Record<string, string> = {};

    for (const rawLabel of labelsRaw) {
      const [key, value] = rawLabel.split('=');
      labels[key] = value;
    }

    await k8Factory
      .default()
      .pods()
      .create(
        PodReference.of(namespace, PodName.of(name)),
        labels,
        ContainerName.of(name),
        'alpine:latest',
        ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200'],
        ['bash', '-c', 'exit 0'],
      );
  }

  const testCasesForIndividualComponents: Array<{
    componentKey: keyof ComponentsRecord;
    displayName: string;
  }> = [
    {componentKey: 'relay', displayName: 'Relay'},
    {componentKey: 'haProxy', displayName: 'HaProxy'},
    {componentKey: 'mirrorNode', displayName: 'Mirror node'},
    {componentKey: 'envoyProxy', displayName: 'Envoy proxy'},
    {componentKey: 'consensusNode', displayName: 'Consensus node'},
    {componentKey: 'explorer', displayName: 'Mirror node explorer'},
  ];

  for (const {componentKey, displayName} of testCasesForIndividualComponents) {
    describe(`${displayName} validation`, () => {
      it('should fail if component is not present', async () => {
        const component: BaseComponent = components[componentKey];

        componentsDataWrapper.addNewComponent(component);

        try {
          await RemoteConfigValidator.validateComponents(
            namespace,
            componentsDataWrapper,
            k8Factory,
            localConfig,
            false,
          );
          expect.fail();
        } catch (error) {
          expect(error).to.be.instanceOf(SoloError);
          expect(error.message).to.equal(RemoteConfigValidator.buildValidationErrorMessage(displayName, component));
        }
      });

      it('should succeed if component is present', async () => {
        const component: BaseComponent = components[componentKey];

        await createPod(component.name, labelRecord[componentKey]);

        await RemoteConfigValidator.validateComponents(namespace, componentsDataWrapper, k8Factory, localConfig, false);
      });
    });
  }

  describe('Additional test cases', () => {
    it('Should not validate disabled components', async () => {
      const component: MirrorNodeComponent = components.mirrorNode;

      componentsDataWrapper.addNewComponent(component);
      componentsDataWrapper.disableComponent(component.name, ComponentTypes.MirrorNode);

      await RemoteConfigValidator.validateComponents(namespace, componentsDataWrapper, k8Factory, localConfig, false);
    });

    it('Should not validate consensus nodes if skipConsensusNodes is enabled', async () => {
      const skipConsensusNodes: boolean = true;

      const nodeAliases: NodeAliases = ['node1', 'node2', 'node3'];

      const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> =
        ComponentFactory.createConsensusNodeComponentsFromNodeAliases(nodeAliases, 'cluster-ref', namespace);

      const componentsDataWrapper: ComponentsDataWrapper =
        ComponentsDataWrapper.initializeWithNodes(consensusNodeComponents);

      for (const nodeAlias of nodeAliases) {
        // Make sure the status is STARTED
        componentsDataWrapper.changeNodeState(nodeAlias, ConsensusNodeStates.STARTED);
      }

      await RemoteConfigValidator.validateComponents(
        namespace,
        componentsDataWrapper,
        k8Factory,
        localConfig,
        skipConsensusNodes,
      );
    });

    const nodeStates: ConsensusNodeStates[] = [ConsensusNodeStates.REQUESTED, ConsensusNodeStates.NON_DEPLOYED];

    for (const nodeState of nodeStates) {
      it(`Should not validate consensus nodes if status is ${nodeState} `, async () => {
        const nodeAliases: NodeAliases = ['node1', 'node2', 'node3'];

        const consensusNodeComponents: Record<ComponentName, ConsensusNodeComponent> =
          ComponentFactory.createConsensusNodeComponentsFromNodeAliases(nodeAliases, 'cluster-ref', namespace);

        const componentsDataWrapper: ComponentsDataWrapper =
          ComponentsDataWrapper.initializeWithNodes(consensusNodeComponents);

        for (const nodeAlias of nodeAliases) {
          componentsDataWrapper.changeNodeState(nodeAlias, nodeState);
        }

        await RemoteConfigValidator.validateComponents(namespace, componentsDataWrapper, k8Factory, localConfig, false);
      });
    }
  });
});

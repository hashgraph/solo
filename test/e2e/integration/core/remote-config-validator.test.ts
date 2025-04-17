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
import {type NodeId} from '../../../../src/types/aliases.js';
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
import {type ClusterReference, type ComponentId} from '../../../../src/core/config/remote/types.js';
import {ComponentFactory} from '../../../../src/core/config/remote/components/component-factory.js';
import {type BaseComponent} from '../../../../src/core/config/remote/components/base-component.js';
import {DeploymentPhase} from '../../../../src/data/schema/model/remote/deployment-phase.js';
import {Templates} from '../../../../src/core/templates.js';

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
  podNames: Record<string, string>;
}

function prepareComponentsData(namespace: NamespaceName): ComponentsData {
  const remoteConfigManagerMock: any = {components: {getNewComponentId: (): number => 1}};

  const clusterReference: ClusterReference = 'cluster';
  const nodeState: DeploymentPhase = DeploymentPhase.STARTED;
  const nodeId: NodeId = 0;

  const components: ComponentsRecord = {
    explorer: ComponentFactory.createNewExplorerComponent(remoteConfigManagerMock, clusterReference, namespace),
    mirrorNode: ComponentFactory.createNewMirrorNodeComponent(remoteConfigManagerMock, clusterReference, namespace),
    relay: ComponentFactory.createNewRelayComponent(remoteConfigManagerMock, clusterReference, namespace, [0]),
    consensusNode: ComponentFactory.createNewConsensusNodeComponent(nodeId, clusterReference, namespace, nodeState),
    haProxy: ComponentFactory.createNewHaProxyComponent(remoteConfigManagerMock, clusterReference, namespace),
    envoyProxy: ComponentFactory.createNewEnvoyProxyComponent(remoteConfigManagerMock, clusterReference, namespace),
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

  const podNames: Record<string, string> = {
    explorer: `hedera-explorer-${components.explorer.id}`,
    mirrorNode: `mirror-importer-${components.mirrorNode.id}`,
    relay: `relay-${components.relay.id}`,
    consensusNode: Templates.renderNetworkPodName(Templates.renderNodeAliasFromNumber(components.consensusNode.id + 1))
      .name,
    haProxy: `haproxy-node1-${Templates.renderNodeAliasFromNumber(components.haProxy.id + 1)}`,
    envoyProxy: `envoy-proxy-${Templates.renderNodeAliasFromNumber(components.envoyProxy.id + 1)}`,
  };

  const componentsDataWrapper: ComponentsDataWrapper = ComponentsDataWrapper.initializeEmpty();

  return {namespace, components, labelRecord, componentsDataWrapper, podNames};
}

describe('RemoteConfigValidator', () => {
  const namespace: NamespaceName = NamespaceName.of('remote-config-validator');

  let k8Factory: K8Factory;
  let localConfig: LocalConfig;
  const filePath: string = `${getTestCacheDirectory('LocalConfig')}/localConfig.yaml`;

  let components: ComponentsRecord;
  let labelRecord: LabelRecord;
  let componentsDataWrapper: ComponentsDataWrapper;
  let podNames: Record<string, string>;

  before(async () => {
    k8Factory = container.resolve(InjectTokens.K8Factory);
    localConfig = new LocalConfig(filePath);
    // @ts-expect-error - TS2341: to mock
    localConfig.localConfigData = new LocalConfigDataWrapper('test@test.com', '0.0.1', {}, {});
    await k8Factory.default().namespaces().create(namespace);
  });

  beforeEach(() => {
    const testData: ComponentsData = prepareComponentsData(namespace);
    podNames = testData.podNames;
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
        await createPod(podNames[componentKey], labelRecord[componentKey]);

        await RemoteConfigValidator.validateComponents(namespace, componentsDataWrapper, k8Factory, localConfig, false);
      });
    });
  }

  describe('Additional test cases', () => {
    it('Should not validate consensus nodes if skipConsensusNodes is enabled', async () => {
      const skipConsensusNodes: boolean = true;

      const nodeIds: NodeId[] = [0, 1, 2];

      const consensusNodeComponents: Record<ComponentId, ConsensusNodeComponent> =
        ComponentFactory.createConsensusNodeComponentsFromNodeIds(nodeIds, 'cluster-ref', namespace);

      const componentsDataWrapper: ComponentsDataWrapper =
        ComponentsDataWrapper.initializeWithNodes(consensusNodeComponents);

      for (const nodeId of nodeIds) {
        // Make sure the status is STARTED
        componentsDataWrapper.changeNodePhase(nodeId, DeploymentPhase.STARTED);
      }

      await RemoteConfigValidator.validateComponents(
        namespace,
        componentsDataWrapper,
        k8Factory,
        localConfig,
        skipConsensusNodes,
      );
    });

    const nodeStates: DeploymentPhase[] = [DeploymentPhase.REQUESTED, DeploymentPhase.STOPPED];

    for (const nodeState of nodeStates) {
      it(`Should not validate consensus nodes if status is ${nodeState} `, async () => {
        const nodeIds: NodeId[] = [0, 1, 2];

        const consensusNodeComponents: Record<ComponentId, ConsensusNodeComponent> =
          ComponentFactory.createConsensusNodeComponentsFromNodeIds(nodeIds, 'cluster-ref', namespace);

        const componentsDataWrapper: ComponentsDataWrapper =
          ComponentsDataWrapper.initializeWithNodes(consensusNodeComponents);

        for (const nodeId of nodeIds) {
          componentsDataWrapper.changeNodePhase(nodeId, nodeState);
        }

        await RemoteConfigValidator.validateComponents(namespace, componentsDataWrapper, k8Factory, localConfig, false);
      });
    }
  });
});

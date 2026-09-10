// SPDX-License-Identifier: Apache-2.0

import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {RemoteConfigValidator} from '../../../../src/core/config/remote/remote-config-validator.js';
import {ComponentsDataWrapper} from '../../../../src/core/config/remote/components-data-wrapper.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {type NodeId} from '../../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {getTestCacheDirectory} from '../../../test-utility.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type ClusterReferenceName, type ComponentId} from '../../../../src/types/index.js';
import {DeploymentPhase} from '../../../../src/data/schema/model/remote/deployment-phase.js';
import {Templates} from '../../../../src/core/templates.js';
import {type BaseStateSchema} from '../../../../src/data/schema/model/remote/state/base-state-schema.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';
import {type ComponentFactoryApi} from '../../../../src/core/config/remote/api/component-factory-api.js';
import {ComponentFactory} from '../../../../src/core/config/remote/component-factory.js';
import {type ComponentsDataWrapperApi} from '../../../../src/core/config/remote/api/components-data-wrapper-api.js';
import {type ExplorerStateSchema} from '../../../../src/data/schema/model/remote/state/explorer-state-schema.js';
import {type MirrorNodeStateSchema} from '../../../../src/data/schema/model/remote/state/mirror-node-state-schema.js';
import {type RelayNodeStateSchema} from '../../../../src/data/schema/model/remote/state/relay-node-state-schema.js';
import {type ConsensusNodeStateSchema} from '../../../../src/data/schema/model/remote/state/consensus-node-state-schema.js';
import {type HaProxyStateSchema} from '../../../../src/data/schema/model/remote/state/ha-proxy-state-schema.js';
import {type EnvoyProxyStateSchema} from '../../../../src/data/schema/model/remote/state/envoy-proxy-state-schema.js';
import {DeploymentStateSchema} from '../../../../src/data/schema/model/remote/deployment-state-schema.js';
import {RemoteConfigSchema} from '../../../../src/data/schema/model/remote/remote-config-schema.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type BlockNodeStateSchema} from '../../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {resetForTest} from '../../../test-container.js';

interface ComponentsRecord {
  explorers: ExplorerStateSchema;
  mirrorNodes: MirrorNodeStateSchema;
  relayNodes: RelayNodeStateSchema;
  consensusNodes: ConsensusNodeStateSchema;
  haProxies: HaProxyStateSchema;
  envoyProxies: EnvoyProxyStateSchema;
  blockNodes: BlockNodeStateSchema;
}

interface LabelRecord {
  explorers: string[];
  mirrorNodes: string[];
  relayNodes: string[];
  consensusNodes: string[];
  haProxies: string[];
  envoyProxies: string[];
  blockNodes: string[];
}

interface ComponentsData {
  namespace: NamespaceName;
  components: ComponentsRecord;
  labelRecord: LabelRecord;
  componentsDataWrapper: ComponentsDataWrapperApi;
  podNames: Record<string, string>;
  componentFactory: ComponentFactoryApi;
}

function prepareComponentsData(namespace: NamespaceName): ComponentsData {
  const remoteConfigMock: any = {configuration: {components: {getNewComponentId: (): number => 1}}};

  const clusterReference: ClusterReferenceName = 'cluster';
  const nodeState: DeploymentPhase = DeploymentPhase.STARTED;
  const id: ComponentId = 1;

  const componentFactory: ComponentFactoryApi = new ComponentFactory(remoteConfigMock);

  const components: ComponentsRecord = {
    explorers: componentFactory.createNewExplorerComponent(clusterReference, namespace),
    mirrorNodes: componentFactory.createNewMirrorNodeComponent(clusterReference, namespace),
    relayNodes: componentFactory.createNewRelayComponent(clusterReference, namespace, [0]),
    consensusNodes: componentFactory.createNewConsensusNodeComponent(id, clusterReference, namespace, nodeState),
    haProxies: componentFactory.createNewHaProxyComponent(clusterReference, namespace),
    envoyProxies: componentFactory.createNewEnvoyProxyComponent(clusterReference, namespace),
    blockNodes: componentFactory.createNewBlockNodeComponent(clusterReference, namespace),
  };

  const labelRecord: LabelRecord = {
    relayNodes: Templates.renderRelayLabels(components.relayNodes.metadata.id),
    haProxies: Templates.renderHaProxyLabels(components.haProxies.metadata.id),
    mirrorNodes: Templates.renderMirrorNodeLabels(components.mirrorNodes.metadata.id),
    envoyProxies: Templates.renderEnvoyProxyLabels(components.envoyProxies.metadata.id),
    explorers: Templates.renderExplorerLabels(components.explorers.metadata.id),
    consensusNodes: Templates.renderConsensusNodeLabels(components.consensusNodes.metadata.id),
    blockNodes: Templates.renderBlockNodeLabels(components.blockNodes.metadata.id),
  };

  const podNames: Record<string, string> = {
    explorers: `hedera-explorer-${components.explorers.metadata.id}`,
    mirrorNodes: `mirror-importer-${components.mirrorNodes.metadata.id}`,
    relayNodes: `relay-${components.relayNodes.metadata.id}`,
    consensusNodes: Templates.renderNetworkPodName(
      Templates.renderNodeAliasFromNumber(components.consensusNodes.metadata.id),
    ).name,
    haProxies: `haproxy-node1-${Templates.renderNodeAliasFromNumber(components.haProxies.metadata.id)}`,
    envoyProxies: `envoy-proxy-${Templates.renderNodeAliasFromNumber(components.envoyProxies.metadata.id)}`,
  };

  const state: DeploymentStateSchema = new DeploymentStateSchema();
  const remoteConfig: RemoteConfigSchema = new RemoteConfigSchema(undefined, undefined, undefined, undefined, state);

  const componentsDataWrapper: ComponentsDataWrapperApi = new ComponentsDataWrapper(remoteConfig.state);

  return {namespace, components, labelRecord, componentsDataWrapper, podNames, componentFactory};
}

describe('RemoteConfigValidator', (): void => {
  const namespace: NamespaceName = NamespaceName.of('remote-config-validator');

  let k8Factory: K8Factory;
  let localConfig: LocalConfigRuntimeState;

  let components: ComponentsRecord;
  let labelRecord: LabelRecord;
  let componentsDataWrapper: ComponentsDataWrapperApi;
  let podNames: Record<string, string>;
  let componentFactory: ComponentFactoryApi;
  let state: any;
  let remoteConfigValidator: RemoteConfigValidator;

  before(async (): Promise<void> => {
    resetForTest(namespace.name, `${getTestCacheDirectory('LocalConfig')}`, false);
    k8Factory = container.resolve(InjectTokens.K8Factory);
    localConfig = container.resolve(InjectTokens.LocalConfigRuntimeState);
    await localConfig.load();
    await k8Factory.default().namespaces().create(namespace);
    remoteConfigValidator = new RemoteConfigValidator(k8Factory, localConfig);
  });

  beforeEach((): void => {
    const testData: ComponentsData = prepareComponentsData(namespace);
    podNames = testData.podNames;
    components = testData.components;
    labelRecord = testData.labelRecord;
    componentsDataWrapper = testData.componentsDataWrapper;
    componentFactory = testData.componentFactory;
    state = componentsDataWrapper.state;
  });

  after(async (): Promise<void> => {
    await k8Factory.default().namespaces().delete(namespace);
  }).timeout(Duration.ofMinutes(5).toMillis());

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
    type: ComponentTypes;
  }> = [
    {componentKey: 'relayNodes', displayName: 'Relay Nodes', type: ComponentTypes.RelayNodes},
    {componentKey: 'haProxies', displayName: 'HaProxy', type: ComponentTypes.HaProxy},
    {componentKey: 'mirrorNodes', displayName: 'Mirror Node', type: ComponentTypes.MirrorNode},
    {componentKey: 'envoyProxies', displayName: 'Envoy Proxy', type: ComponentTypes.EnvoyProxy},
    {componentKey: 'consensusNodes', displayName: 'Consensus Node', type: ComponentTypes.ConsensusNode},
    {componentKey: 'explorers', displayName: 'Explorer', type: ComponentTypes.Explorer},
  ];

  for (const {componentKey, displayName, type} of testCasesForIndividualComponents) {
    describe(`${displayName} validation`, (): void => {
      it('should fail if component is not present', async (): Promise<void> => {
        const component: BaseStateSchema = components[componentKey];

        componentsDataWrapper.addNewComponent(component, type);

        try {
          await remoteConfigValidator.validateComponents(namespace, true, state);
          if (type !== ComponentTypes.ConsensusNode) {
            expect.fail();
          }
        } catch (error) {
          expect(error).to.be.instanceOf(SoloError);
          expect(error.message).to.include(RemoteConfigValidator.buildValidationErrorMessage(displayName, component));
        }
      });

      it('should succeed if component is present', async (): Promise<void> => {
        await createPod(podNames[componentKey], labelRecord[componentKey]);

        await remoteConfigValidator.validateComponents(namespace, false, state);
      });
    });
  }

  describe('Additional test cases', (): void => {
    it('Should not validate consensus nodes if skipConsensusNodes is enabled', async (): Promise<void> => {
      const skipConsensusNodes: boolean = true;

      const nodeIds: NodeId[] = [0, 1, 2];

      const consensusNodeComponents: ConsensusNodeStateSchema[] =
        componentFactory.createConsensusNodeComponentsFromNodeIds(nodeIds, 'cluster-ref', namespace);

      // @ts-expect-error - to mock
      const componentsDataWrapper: ComponentsDataWrapperApi = new ComponentsDataWrapper({
        consensusNodes: consensusNodeComponents,
      });

      for (const nodeId of nodeIds) {
        // Make sure the status is STARTED
        componentsDataWrapper.changeNodePhase(Templates.renderComponentIdFromNodeId(nodeId), DeploymentPhase.STARTED);
      }

      await remoteConfigValidator.validateComponents(namespace, skipConsensusNodes, state);
    });

    const nodeStates: DeploymentPhase[] = [DeploymentPhase.REQUESTED, DeploymentPhase.STOPPED];

    for (const nodeState of nodeStates) {
      it(`Should not validate consensus nodes if status is ${nodeState} `, async (): Promise<void> => {
        const nodeIds: NodeId[] = [0, 1, 2];

        const consensusNodeComponents: ConsensusNodeStateSchema[] =
          componentFactory.createConsensusNodeComponentsFromNodeIds(nodeIds, 'cluster-ref', namespace);

        // @ts-expect-error - to mock
        const componentsDataWrapper: ComponentsDataWrapperApi = new ComponentsDataWrapper({
          consensusNodes: consensusNodeComponents,
        });

        for (const nodeId of nodeIds) {
          componentsDataWrapper.changeNodePhase(Templates.renderComponentIdFromNodeId(nodeId), nodeState);
        }

        await remoteConfigValidator.validateComponents(namespace, false, state);
      });
    }
  });
});

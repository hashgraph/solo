// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ComponentsDataWrapper} from '../../../../../src/core/config/remote/components-data-wrapper.js';
import {SoloError} from '../../../../../src/core/errors/solo-error.js';
import {ComponentTypes} from '../../../../../src/core/config/remote/enumerations/component-types.js';
import {type AnyObject, type NodeId} from '../../../../../src/types/aliases.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type NamespaceNameAsString,
} from '../../../../../src/types/index.js';
import {DeploymentPhase} from '../../../../../src/data/schema/model/remote/deployment-phase.js';
import {ComponentStateMetadataSchema} from '../../../../../src/data/schema/model/remote/state/component-state-metadata-schema.js';
import {LedgerPhase} from '../../../../../src/data/schema/model/remote/ledger-phase.js';
import {type ComponentsDataWrapperApi} from '../../../../../src/core/config/remote/api/components-data-wrapper-api.js';
import {RelayNodeStateSchema} from '../../../../../src/data/schema/model/remote/state/relay-node-state-schema.js';
import {HaProxyStateSchema} from '../../../../../src/data/schema/model/remote/state/ha-proxy-state-schema.js';
import {MirrorNodeStateSchema} from '../../../../../src/data/schema/model/remote/state/mirror-node-state-schema.js';
import {EnvoyProxyStateSchema} from '../../../../../src/data/schema/model/remote/state/envoy-proxy-state-schema.js';
import {ConsensusNodeStateSchema} from '../../../../../src/data/schema/model/remote/state/consensus-node-state-schema.js';
import {ExplorerStateSchema} from '../../../../../src/data/schema/model/remote/state/explorer-state-schema.js';
import {BlockNodeStateSchema} from '../../../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {DeploymentStateSchema} from '../../../../../src/data/schema/model/remote/deployment-state-schema.js';
import {RemoteConfigSchema} from '../../../../../src/data/schema/model/remote/remote-config-schema.js';

export function createComponentsDataWrapper(): {
  values: {
    id: ComponentId;
    cluster: ClusterReferenceName;
    namespace: NamespaceNameAsString;
    phase: DeploymentPhase.DEPLOYED;
    consensusNodeIds: NodeId[];
  };
  components: {
    relays: RelayNodeStateSchema[];
    haProxies: HaProxyStateSchema[];
    mirrorNodes: MirrorNodeStateSchema[];
    envoyProxies: EnvoyProxyStateSchema[];
    consensusNodes: ConsensusNodeStateSchema[];
    explorers: ExplorerStateSchema[];
    blockNodes: BlockNodeStateSchema[];
  };
  wrapper: {componentsDataWrapper: ComponentsDataWrapperApi};
  componentId: ComponentId;
} {
  const id: ComponentId = 1;
  const componentId: ComponentId = id;

  const cluster: ClusterReferenceName = 'cluster';
  const namespace: NamespaceNameAsString = 'namespace';
  const phase: DeploymentPhase = DeploymentPhase.DEPLOYED;
  const consensusNodeIds: NodeId[] = [0, 1];

  const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(id, namespace, cluster, phase);

  const relays: RelayNodeStateSchema[] = [new RelayNodeStateSchema(metadata, consensusNodeIds)];
  const haProxies: HaProxyStateSchema[] = [new HaProxyStateSchema(metadata)];
  const mirrorNodes: MirrorNodeStateSchema[] = [new MirrorNodeStateSchema(metadata)];
  const envoyProxies: EnvoyProxyStateSchema[] = [new EnvoyProxyStateSchema(metadata)];
  const consensusNodes: ConsensusNodeStateSchema[] = [new ConsensusNodeStateSchema(metadata)];
  const explorers: ExplorerStateSchema[] = [new ExplorerStateSchema(metadata)];
  const blockNodes: BlockNodeStateSchema[] = [new BlockNodeStateSchema(metadata)];

  const deploymentState: DeploymentStateSchema = new DeploymentStateSchema(
    LedgerPhase.INITIALIZED,
    undefined,
    consensusNodes,
    blockNodes,
    mirrorNodes,
    relays,
    haProxies,
    envoyProxies,
    explorers,
  );

  const remoteConfig: RemoteConfigSchema = new RemoteConfigSchema(
    undefined,
    undefined,
    undefined,
    undefined,
    deploymentState,
  );

  const componentsDataWrapper: ComponentsDataWrapperApi = new ComponentsDataWrapper(remoteConfig.state);

  return {
    values: {id, cluster, namespace, phase, consensusNodeIds},
    components: {consensusNodes, haProxies, envoyProxies, mirrorNodes, explorers, relays, blockNodes},
    wrapper: {componentsDataWrapper},
    componentId,
  };
}

describe('ComponentsDataWrapper', (): void => {
  it('should be able to create a instance', (): AnyObject => createComponentsDataWrapper());

  it('should skip adding a component with the .addNewComponent() method if it already exists', (): void => {
    const {
      wrapper: {componentsDataWrapper},
      components: {consensusNodes},
    } = createComponentsDataWrapper();

    const existingComponent: ConsensusNodeStateSchema = consensusNodes[0];

    const componentAdded: boolean = componentsDataWrapper.addNewComponent(
      existingComponent,
      ComponentTypes.ConsensusNode,
    );

    expect(componentAdded).to.be.false;
    expect(componentsDataWrapper.state.consensusNodes).to.have.lengthOf(1);
  });

  it('should be able to add new component with the .addNewComponent() method', (): void => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newComponentId: ComponentId = 2;
    const {id, cluster, namespace, phase} = {
      id: newComponentId,
      cluster: 'cluster',
      namespace: 'new-namespace',
      phase: DeploymentPhase.DEPLOYED,
    };

    const metadata: ComponentStateMetadataSchema = new ComponentStateMetadataSchema(id, namespace, cluster, phase);
    const newComponent: EnvoyProxyStateSchema = new EnvoyProxyStateSchema(metadata);

    const componentAdded: boolean = componentsDataWrapper.addNewComponent(newComponent, ComponentTypes.EnvoyProxy);

    expect(componentAdded).to.be.true;
    expect(componentsDataWrapper.state.envoyProxies).to.have.lengthOf(2);
  });

  it('should not increment component id counter when existing component is skipped', (): void => {
    const {
      wrapper: {componentsDataWrapper},
      components: {consensusNodes},
    } = createComponentsDataWrapper();

    const existingComponent: ConsensusNodeStateSchema = consensusNodes[0];
    const originalComponentIdCounter: number = componentsDataWrapper.componentIds[ComponentTypes.ConsensusNode];

    const componentAdded: boolean = componentsDataWrapper.addNewComponent(
      existingComponent,
      ComponentTypes.ConsensusNode,
      false,
      true,
    );

    expect(componentAdded).to.be.false;
    expect(componentsDataWrapper.state.consensusNodes).to.have.lengthOf(1);
    expect(componentsDataWrapper.componentIds[ComponentTypes.ConsensusNode]).to.equal(originalComponentIdCounter);
  });

  it('should be able to change node state with the .changeNodeState(()', (): void => {
    const {
      wrapper: {componentsDataWrapper},
      componentId,
    } = createComponentsDataWrapper();

    const newNodeState: DeploymentPhase = DeploymentPhase.STOPPED;

    componentsDataWrapper.changeNodePhase(componentId, newNodeState);

    expect(componentsDataWrapper.state.consensusNodes[0].metadata.phase).to.equal(newNodeState);
  });

  it("should not be able to edit component with the .editComponent() if it doesn't exist ", (): void => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();
    const notFoundComponentId: ComponentId = 9;

    expect((): void => componentsDataWrapper.changeNodePhase(notFoundComponentId, DeploymentPhase.FROZEN)).to.throw(
      SoloError,
      'not found',
    );
  });

  it('should be able to remove component with the .removeComponent()', (): void => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      componentId,
    } = createComponentsDataWrapper();

    componentsDataWrapper.removeComponent(componentId, ComponentTypes.RelayNodes);

    expect(relays).to.not.have.own.property(componentId.toString());
  });

  it("should not be able to remove component with the .removeComponent() if it doesn't exist ", (): void => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentId: ComponentId = 9;

    expect((): void => componentsDataWrapper.removeComponent(notFoundComponentId, ComponentTypes.RelayNodes)).to.throw(
      SoloError,
      'not found',
    );
  });

  it('should be able to get components with .getComponent()', (): void => {
    const {
      wrapper: {componentsDataWrapper},
      componentId,
      components: {mirrorNodes},
    } = createComponentsDataWrapper();

    const mirrorNodeComponent: MirrorNodeStateSchema = componentsDataWrapper.getComponent<MirrorNodeStateSchema>(
      ComponentTypes.MirrorNode,
      componentId,
    );

    expect(mirrorNodes.find((component): boolean => component.metadata.id === componentId).metadata.id).to.deep.equal(
      mirrorNodeComponent.metadata.id,
    );
  });

  it("should fail if trying to get component that doesn't exist with .getComponent()", (): void => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentId: ComponentId = 9;
    const type: ComponentTypes = ComponentTypes.MirrorNode;

    expect((): MirrorNodeStateSchema =>
      componentsDataWrapper.getComponent<MirrorNodeStateSchema>(type, notFoundComponentId),
    ).to.throw('not found');
  });
});

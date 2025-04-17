// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {type RelayComponent} from '../../../../../../src/core/config/remote/components/relay-component.js';
import {BaseComponent} from '../../../../../../src/core/config/remote/components/base-component.js';
import {type ConsensusNodeComponent} from '../../../../../../src/core/config/remote/components/consensus-node-component.js';
import {HaProxyComponent} from '../../../../../../src/core/config/remote/components/ha-proxy-component.js';
import {EnvoyProxyComponent} from '../../../../../../src/core/config/remote/components/envoy-proxy-component.js';
import {MirrorNodeComponent} from '../../../../../../src/core/config/remote/components/mirror-node-component.js';
import {MirrorNodeExplorerComponent} from '../../../../../../src/core/config/remote/components/mirror-node-explorer-component.js';
import {type NodeAlias, type NodeId} from '../../../../../../src/types/aliases.js';
import {Templates} from '../../../../../../src/core/templates.js';
import {type ClusterReference, type ComponentId} from '../../../../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type BaseComponentStruct} from '../../../../../../src/core/config/remote/components/interfaces/base-component-struct.js';
import {type RelayComponentStruct} from '../../../../../../src/core/config/remote/components/interfaces/relay-component-struct.js';
import {ComponentFactory} from '../../../../../../src/core/config/remote/components/component-factory.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';

const remoteConfigManagerMock: any = {components: {getNewComponentIndex: (): number => 1}};

const componentId: ComponentId = 0;
const clusterReference: ClusterReference = 'cluster-reference';
const namespace: NamespaceName = NamespaceName.of('valid');
const phase: DeploymentPhase = DeploymentPhase.DEPLOYED;

function testBaseComponentData(classComponent: any): void {
  it('should be an instance of BaseComponent', () => {
    const component: any = new classComponent(componentId, clusterReference, namespace.name, phase);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const data: BaseComponentStruct = {
      id: componentId,
      cluster: clusterReference,
      namespace: namespace.name,
      phase: DeploymentPhase.DEPLOYED,
    };

    const component: any = new classComponent(data.id, data.cluster, data.namespace, data.phase);
    expect(component.toObject()).to.deep.equal(data);
  });
}

describe('HaProxyComponent', () => testBaseComponentData(HaProxyComponent));

describe('EnvoyProxyComponent', () => testBaseComponentData(EnvoyProxyComponent));

describe('MirrorNodeComponent', () => testBaseComponentData(MirrorNodeComponent));

describe('MirrorNodeExplorerComponent', () => testBaseComponentData(MirrorNodeExplorerComponent));

describe('RelayComponent', () => {
  it('should successfully create ', () => {
    ComponentFactory.createNewRelayComponent(remoteConfigManagerMock, clusterReference, namespace, []);
  });

  it('should be an instance of BaseComponent', () => {
    const component: RelayComponent = ComponentFactory.createNewRelayComponent(
      remoteConfigManagerMock,
      clusterReference,
      namespace,
      [],
    );
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const id: ComponentId = remoteConfigManagerMock.components.getNewComponentIndex();

    const values: RelayComponentStruct = {
      id,
      cluster: clusterReference,
      namespace: namespace.name,
      phase: DeploymentPhase.DEPLOYED,
      consensusNodeIds: [0],
    };

    const component: RelayComponent = ComponentFactory.createNewRelayComponent(
      remoteConfigManagerMock,
      values.cluster,
      namespace,
      values.consensusNodeIds,
    );

    expect(component.toObject()).to.deep.equal(values);
  });
});

describe('ConsensusNodeComponent', () => {
  const nodeAlias: NodeAlias = 'node1';
  const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
  const phase: DeploymentPhase.REQUESTED = DeploymentPhase.REQUESTED;

  it('should successfully create ', () => {
    ComponentFactory.createNewConsensusNodeComponent(nodeId, 'valid', namespace, phase);
  });

  it('should be an instance of BaseComponent', () => {
    const component: ConsensusNodeComponent = ComponentFactory.createNewConsensusNodeComponent(
      nodeId,
      clusterReference,
      namespace,
      phase,
    );

    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const values: BaseComponentStruct = {
      id: nodeId,
      cluster: clusterReference,
      namespace: namespace.name,
      phase,
    };

    const component: ConsensusNodeComponent = ComponentFactory.createNewConsensusNodeComponent(
      values.id,
      values.cluster,
      namespace,
      phase,
    );

    expect(component.toObject()).to.deep.equal(values);
  });
});

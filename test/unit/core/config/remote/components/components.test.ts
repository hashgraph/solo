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
import {type NodeAlias} from '../../../../../../src/types/aliases.js';
import {Templates} from '../../../../../../src/core/templates.js';
import {type ClusterReference, type ComponentName} from '../../../../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type BaseComponentStruct} from '../../../../../../src/core/config/remote/components/interfaces/base-component-struct.js';
import {type RelayComponentStruct} from '../../../../../../src/core/config/remote/components/interfaces/relay-component-struct.js';
import {type ConsensusNodeComponentStruct} from '../../../../../../src/core/config/remote/components/interfaces/consensus-node-component-struct.js';
import {ComponentFactory} from '../../../../../../src/core/config/remote/components/component-factory.js';
import {ComponentNameTemplates} from '../../../../../../src/core/config/remote/components/component-name-templates.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';

const remoteConfigManagerMock: any = {components: {getNewComponentIndex: (): number => 1}};

const componentName: ComponentName = 'componentName';
const clusterReference: ClusterReference = 'cluster-reference';
const namespace: NamespaceName = NamespaceName.of('valid');
const phase: DeploymentPhase = DeploymentPhase.DEPLOYED;

function testBaseComponentData(classComponent: any): void {
  it('should be an instance of BaseComponent', () => {
    const component: any = new classComponent(componentName, clusterReference, namespace.name, phase);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const data: BaseComponentStruct = {
      name: componentName,
      cluster: clusterReference,
      namespace: namespace.name,
      phase: DeploymentPhase.DEPLOYED,
    };

    const component: any = new classComponent(data.name, data.cluster, data.namespace, data.phase);
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
    const name: ComponentName = ComponentNameTemplates.renderRelayName(
      remoteConfigManagerMock.components.getNewComponentIndex(),
    );

    const values: RelayComponentStruct = {
      name,
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
  const phase: DeploymentPhase.REQUESTED = DeploymentPhase.REQUESTED;

  it('should successfully create ', () => {
    ComponentFactory.createNewConsensusNodeComponent(nodeAlias, 'valid', namespace, phase);
  });

  it('should be an instance of BaseComponent', () => {
    const component: ConsensusNodeComponent = ComponentFactory.createNewConsensusNodeComponent(
      nodeAlias,
      clusterReference,
      namespace,
      phase,
    );

    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const nodeAlias: NodeAlias = 'node1';
    const values: ConsensusNodeComponentStruct = {
      name: nodeAlias,
      cluster: clusterReference,
      namespace: namespace.name,
      phase,
      nodeId: Templates.nodeIdFromNodeAlias(nodeAlias),
    };

    const component: ConsensusNodeComponent = ComponentFactory.createNewConsensusNodeComponent(
      values.name as NodeAlias,
      values.cluster,
      namespace,
      phase,
    );

    expect(component.toObject()).to.deep.equal(values);
  });
});

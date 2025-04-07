// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {RelayComponent} from '../../../../../../src/core/config/remote/components/relay-component.js';
import {BaseComponent} from '../../../../../../src/core/config/remote/components/base-component.js';
import {ConsensusNodeComponent} from '../../../../../../src/core/config/remote/components/consensus-node-component.js';
import {HaProxyComponent} from '../../../../../../src/core/config/remote/components/ha-proxy-component.js';
import {EnvoyProxyComponent} from '../../../../../../src/core/config/remote/components/envoy-proxy-component.js';
import {MirrorNodeComponent} from '../../../../../../src/core/config/remote/components/mirror-node-component.js';
import {MirrorNodeExplorerComponent} from '../../../../../../src/core/config/remote/components/mirror-node-explorer-component.js';
import {type NodeAlias} from '../../../../../../src/types/aliases.js';
import {Templates} from '../../../../../../src/core/templates.js';
import {ConsensusNodeStates} from '../../../../../../src/core/config/remote/enumerations/consensus-node-states.js';
import {ComponentStates} from '../../../../../../src/core/config/remote/enumerations/component-states.js';
import {BlockNodeComponent} from '../../../../../../src/core/config/remote/components/block-node-component.js';
import {type ClusterReference, type ComponentName} from '../../../../../../src/core/config/remote/types.js';
import {NamespaceName} from '../../../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type BaseComponentStructure} from '../../../../../../src/core/config/remote/components/interface/base-component-structure.js';
import {type RelayComponentStructure} from '../../../../../../src/core/config/remote/components/interface/relay-component-structure.js';
import {type ConsensusNodeComponentStructure} from '../../../../../../src/core/config/remote/components/interface/consensus-node-component-structure.js';

const remoteConfigManagerMock: any = {components: {getNewComponentIndex: (): number => 1}};

const componentName: ComponentName = 'componentName';
const clusterReference: ClusterReference = 'cluster-reference';
const namespace: NamespaceName = NamespaceName.of('valid');

function testBaseComponentData(classComponent: any): void {
  it('should be an instance of BaseComponent', () => {
    const component: any = new classComponent(componentName, clusterReference, namespace.name, ComponentStates.ACTIVE);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const data: BaseComponentStructure = {
      name: componentName,
      cluster: clusterReference,
      namespace: namespace.name,
      state: ComponentStates.ACTIVE,
    };

    const component: any = new classComponent(data.name, data.cluster, data.namespace, data.state);
    expect(component.toObject()).to.deep.equal(data);
  });
}

describe('HaProxyComponent', () => testBaseComponentData(HaProxyComponent));

describe('EnvoyProxyComponent', () => testBaseComponentData(EnvoyProxyComponent));

describe('MirrorNodeComponent', () => testBaseComponentData(MirrorNodeComponent));

describe('MirrorNodeExplorerComponent', () => testBaseComponentData(MirrorNodeExplorerComponent));

describe('BlockNodeComponent', () => testBaseComponentData(BlockNodeComponent));

describe('RelayComponent', () => {
  it('should successfully create ', () => {
    RelayComponent.createNew(remoteConfigManagerMock, clusterReference, namespace, []);
  });

  it('should be an instance of BaseComponent', () => {
    const component: RelayComponent = RelayComponent.createNew(
      remoteConfigManagerMock,
      clusterReference,
      namespace,
      [],
    );
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    // @ts-expect-error: to access private property
    const name: ComponentName = RelayComponent.renderRelayName(
      remoteConfigManagerMock.components.getNewComponentIndex(),
    );

    const values: RelayComponentStructure = {
      name,
      cluster: clusterReference,
      namespace: namespace.name,
      state: ComponentStates.ACTIVE,
      consensusNodeAliases: ['node1'],
    };

    const component: RelayComponent = RelayComponent.createNew(
      remoteConfigManagerMock,
      values.cluster,
      namespace,
      values.consensusNodeAliases,
    );

    expect(component.toObject()).to.deep.equal(values);
  });
});

describe('ConsensusNodeComponent', () => {
  const nodeAlias: NodeAlias = 'node1';
  const nodeState: ConsensusNodeStates = ConsensusNodeStates.STARTED;

  it('should successfully create ', () => {
    ConsensusNodeComponent.createNew(nodeAlias, 'valid', namespace, nodeState);
  });

  it('should be an instance of BaseComponent', () => {
    const component: ConsensusNodeComponent = ConsensusNodeComponent.createNew(
      nodeAlias,
      clusterReference,
      namespace,
      nodeState,
    );

    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const nodeAlias: NodeAlias = 'node1';
    const values: ConsensusNodeComponentStructure = {
      name: nodeAlias,
      cluster: clusterReference,
      namespace: namespace.name,
      state: ComponentStates.ACTIVE,
      nodeState,
      nodeId: Templates.nodeIdFromNodeAlias(nodeAlias),
    };

    const component: ConsensusNodeComponent = ConsensusNodeComponent.createNew(
      values.name as NodeAlias,
      values.cluster,
      namespace,
      values.nodeState as ConsensusNodeStates.STARTED,
    );

    expect(component.toObject()).to.deep.equal(values);
  });
});

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
import {
  type Component,
  type IConsensusNodeComponent,
  type IRelayComponent,
} from '../../../../../../src/core/config/remote/types.js';

function testBaseComponentData(classComponent: any): void {
  it('should be an instance of BaseComponent', () => {
    const component: any = new classComponent('service-name', 'cluster-reference', 'namespace', ComponentStates.ACTIVE);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const data: Component = {name: 'name', cluster: 'cluster', namespace: 'namespace', state: ComponentStates.ACTIVE};

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
    new RelayComponent('valid', 'valid', 'valid', ComponentStates.ACTIVE);
  });

  it('should be an instance of BaseComponent', () => {
    const component: RelayComponent = new RelayComponent('valid', 'valid', 'valid', ComponentStates.ACTIVE);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const values: IRelayComponent = {
      name: 'name',
      cluster: 'cluster',
      namespace: 'namespace',
      state: ComponentStates.ACTIVE,
      consensusNodeAliases: ['node1'],
    };

    const component: RelayComponent = new RelayComponent(
      values.name,
      values.cluster,
      values.namespace,
      values.state,
      values.consensusNodeAliases,
    );

    expect(component.toObject()).to.deep.equal(values);
  });
});

describe('ConsensusNodeComponent', () => {
  it('should successfully create ', () => {
    new ConsensusNodeComponent('valid', 'valid', 'valid', ComponentStates.ACTIVE, ConsensusNodeStates.STARTED, 0);
  });

  it('should be an instance of BaseComponent', () => {
    const component: ConsensusNodeComponent = new ConsensusNodeComponent(
      'valid',
      'valid',
      'valid',
      ComponentStates.ACTIVE,
      ConsensusNodeStates.STARTED,
      0,
    );
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const nodeAlias: NodeAlias = 'node1';
    const values: IConsensusNodeComponent = {
      name: nodeAlias,
      cluster: 'cluster',
      namespace: 'namespace',
      state: ComponentStates.ACTIVE,
      nodeState: ConsensusNodeStates.STARTED,
      nodeId: Templates.nodeIdFromNodeAlias(nodeAlias),
    };

    const component: ConsensusNodeComponent = new ConsensusNodeComponent(
      values.name,
      values.cluster,
      values.namespace,
      values.state,
      values.nodeState,
      values.nodeId,
    );
    expect(component.toObject()).to.deep.equal(values);
  });
});

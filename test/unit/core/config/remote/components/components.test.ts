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
import {SoloError} from '../../../../../../src/core/errors/solo-error.js';
import {type NodeAliases} from '../../../../../../src/types/aliases.js';
import {Templates} from '../../../../../../src/core/templates.js';
import {ConsensusNodeStates} from '../../../../../../src/core/config/remote/enumerations/consensus-node-states.js';

function testBaseComponentData(classComponent: any) {
  const validNamespace = 'valid';
  it('should fail if name is not provided', () => {
    const name = '';
    expect(() => new classComponent(name, 'valid', validNamespace)).to.throw(SoloError, `Invalid name: ${name}`);
  });

  it('should fail if name is string', () => {
    const name = 1; // @ts-ignore
    expect(() => new classComponent(name, 'valid', validNamespace)).to.throw(SoloError, `Invalid name: ${name}`);
  });

  it('should fail if cluster is not provided', () => {
    const cluster = '';
    expect(() => new classComponent('valid', cluster, validNamespace)).to.throw(
      SoloError,
      `Invalid cluster: ${cluster}`,
    );
  });

  it('should fail if cluster is string', () => {
    const cluster = 1;
    expect(() => new classComponent('valid', cluster, validNamespace)).to.throw(
      SoloError,
      `Invalid cluster: ${cluster}`,
    );
  });

  it('should fail if namespace is not provided', () => {
    const namespace = '';
    expect(() => new classComponent('valid', 'valid', namespace)).to.throw(
      SoloError,
      `Invalid namespace: ${namespace}`,
    );
  });

  it('should fail if namespace is string', () => {
    const namespace = 1;
    expect(() => new classComponent('valid', 'valid', namespace)).to.throw(
      SoloError,
      `Invalid namespace: ${namespace}`,
    );
  });

  it('should successfully create ', () => {
    new classComponent('valid', 'valid', 'valid');
  });

  it('should be an instance of BaseComponent', () => {
    const component = new classComponent('valid', 'valid', validNamespace);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const {name, cluster, namespace} = {name: 'name', cluster: 'cluster', namespace: 'namespace'};
    const component = new classComponent(name, cluster, namespace);
    expect(component.toObject()).to.deep.equal({name, cluster, namespace});
  });
}

describe('HaProxyComponent', () => testBaseComponentData(HaProxyComponent));

describe('EnvoyProxyComponent', () => testBaseComponentData(EnvoyProxyComponent));

describe('MirrorNodeComponent', () => testBaseComponentData(MirrorNodeComponent));

describe('MirrorNodeExplorerComponent', () => testBaseComponentData(MirrorNodeExplorerComponent));

describe('RelayComponent', () => {
  it('should fail if name is not provided', () => {
    const name = '';
    expect(() => new RelayComponent(name, 'valid', 'valid', [])).to.throw(SoloError, `Invalid name: ${name}`);
  });

  it('should fail if name is string', () => {
    const name = 1;
    // @ts-expect-error - TS2345: Argument of type number is not assignable to parameter of type string
    expect(() => new RelayComponent(name, 'valid', 'valid', [])).to.throw(SoloError, `Invalid name: ${name}`);
  });

  it('should fail if cluster is not provided', () => {
    const cluster = '';
    expect(() => new RelayComponent('valid', cluster, 'valid', [])).to.throw(SoloError, `Invalid cluster: ${cluster}`);
  });

  it('should fail if cluster is string', () => {
    const cluster = 1;
    // @ts-expect-error - TS2345: Argument of type number is not assignable to parameter of type string
    expect(() => new RelayComponent('valid', cluster, 'valid', [])).to.throw(SoloError, `Invalid cluster: ${cluster}`);
  });

  it('should fail if namespace is not provided', () => {
    const namespace = null;
    expect(() => new RelayComponent('valid', 'valid', namespace, [])).to.throw(
      SoloError,
      `Invalid namespace: ${namespace}`,
    );
  });

  it('should fail if namespace is string', () => {
    const namespace = 1;
    // @ts-expect-error - forcefully provide namespace as a number to create an error
    expect(() => new RelayComponent('valid', 'valid', namespace, [])).to.throw(
      SoloError,
      `Invalid namespace: ${namespace}`,
    );
  });

  it('should fail if consensusNodeAliases is not valid', () => {
    const consensusNodeAliases = [undefined] as NodeAliases;
    expect(() => new RelayComponent('valid', 'valid', 'valid', consensusNodeAliases)).to.throw(
      SoloError,
      `Invalid consensus node alias: ${consensusNodeAliases[0]}, aliases ${consensusNodeAliases}`,
    );
  });

  it('should fail if consensusNodeAliases is not valid', () => {
    const consensusNodeAliases = ['node1', 1] as NodeAliases;
    expect(() => new RelayComponent('valid', 'valid', 'valid', consensusNodeAliases)).to.throw(
      SoloError,
      `Invalid consensus node alias: 1, aliases ${consensusNodeAliases}`,
    );
  });

  it('should successfully create ', () => {
    new RelayComponent('valid', 'valid', 'valid');
  });

  it('should be an instance of BaseComponent', () => {
    const component = new RelayComponent('valid', 'valid', 'valid');
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const {name, cluster, namespace, consensusNodeAliases} = {
      name: 'name',
      cluster: 'cluster',
      namespace: 'namespace',
      consensusNodeAliases: ['node1'] as NodeAliases,
    };

    const component = new RelayComponent(name, cluster, namespace, consensusNodeAliases);
    expect(component.toObject()).to.deep.equal({name, cluster, namespace: namespace, consensusNodeAliases});
  });
});

describe('ConsensusNodeComponent', () => {
  it('should fail if name is not provided', () => {
    const name = '';
    expect(() => new ConsensusNodeComponent(name, 'valid', 'valid', ConsensusNodeStates.STARTED, 0)).to.throw(
      SoloError,
      `Invalid name: ${name}`,
    );
  });

  it('should fail if name is not a string', () => {
    const name = 1; // @ts-ignore
    expect(() => new ConsensusNodeComponent(name, 'valid', 'valid', ConsensusNodeStates.STARTED, 0)).to.throw(
      SoloError,
      `Invalid name: ${name}`,
    );
  });

  it('should fail if cluster is not provided', () => {
    const cluster = '';
    expect(() => new ConsensusNodeComponent('valid', cluster, 'valid', ConsensusNodeStates.STARTED, 0)).to.throw(
      SoloError,
      `Invalid cluster: ${cluster}`,
    );
  });

  it('should fail if cluster is not a string', () => {
    const cluster = 1; // @ts-ignore
    expect(() => new ConsensusNodeComponent('valid', cluster, 'valid', ConsensusNodeStates.STARTED, 0)).to.throw(
      SoloError,
      `Invalid cluster: ${cluster}`,
    );
  });

  it('should fail if namespace is not provided', () => {
    const namespace = null;
    expect(() => new ConsensusNodeComponent('valid', 'valid', namespace, ConsensusNodeStates.STARTED, 0)).to.throw(
      SoloError,
      `Invalid namespace: ${namespace}`,
    );
  });

  it('should fail if namespace is not a string', () => {
    const namespace = 1; // @ts-ignore
    expect(() => new ConsensusNodeComponent('valid', 'valid', namespace, ConsensusNodeStates.STARTED, 0)).to.throw(
      SoloError,
      `Invalid namespace: ${namespace}`,
    );
  });

  it('should fail if state is not valid', () => {
    const state = 'invalid' as ConsensusNodeStates.STARTED;
    expect(() => new ConsensusNodeComponent('valid', 'valid', 'valid', state, 0)).to.throw(
      SoloError,
      `Invalid consensus node state: ${state}`,
    );
  });

  it('should fail if nodeId is not a number', () => {
    const nodeId = 'invalid'; // @ts-ignore
    expect(() => new ConsensusNodeComponent('valid', 'valid', 'valid', ConsensusNodeStates.STARTED, nodeId)).to.throw(
      SoloError,
      `Invalid node id. It must be a number: ${nodeId}`,
    );
  });

  it('should fail if nodeId is negative', () => {
    const nodeId = -1; // @ts-ignore
    expect(() => new ConsensusNodeComponent('valid', 'valid', 'valid', ConsensusNodeStates.STARTED, nodeId)).to.throw(
      SoloError,
      `Invalid node id. It cannot be negative: ${nodeId}`,
    );
  });

  it('should successfully create ', () => {
    new ConsensusNodeComponent('valid', 'valid', 'valid', ConsensusNodeStates.STARTED, 0);
  });

  it('should be an instance of BaseComponent', () => {
    const component = new ConsensusNodeComponent('valid', 'valid', 'valid', ConsensusNodeStates.STARTED, 0);
    expect(component).to.be.instanceOf(BaseComponent);
  });

  it('calling toObject() should return a valid data', () => {
    const nodeAlias = 'node1';
    const nodeInfo = {
      name: nodeAlias,
      cluster: 'cluster',
      namespace: 'namespace',
      state: ConsensusNodeStates.STARTED,
      nodeId: Templates.nodeIdFromNodeAlias(nodeAlias),
    };

    const {name, cluster, namespace, state, nodeId} = nodeInfo;
    const component = new ConsensusNodeComponent(name, cluster, namespace, state, nodeId);
    expect(component.toObject()).to.deep.equal(nodeInfo);
  });
});

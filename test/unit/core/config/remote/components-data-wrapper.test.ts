// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ComponentsDataWrapper} from '../../../../../src/core/config/remote/components-data-wrapper.js';
import {HaProxyComponent} from '../../../../../src/core/config/remote/components/ha-proxy-component.js';
import {MirrorNodeComponent} from '../../../../../src/core/config/remote/components/mirror-node-component.js';
import {EnvoyProxyComponent} from '../../../../../src/core/config/remote/components/envoy-proxy-component.js';
import {ConsensusNodeComponent} from '../../../../../src/core/config/remote/components/consensus-node-component.js';
import {MirrorNodeExplorerComponent} from '../../../../../src/core/config/remote/components/mirror-node-explorer-component.js';
import {RelayComponent} from '../../../../../src/core/config/remote/components/relay-component.js';
import {SoloError} from '../../../../../src/core/errors/solo-error.js';
import {type NodeAliases} from '../../../../../src/types/aliases.js';
import {ComponentTypes} from '../../../../../src/core/config/remote/enumerations/component-types.js';
import {ConsensusNodeStates} from '../../../../../src/core/config/remote/enumerations/consensus-node-states.js';

export function createComponentsDataWrapper() {
  const name = 'name';
  const serviceName = name;

  const cluster = 'cluster';
  const namespace = 'namespace';
  const state = ConsensusNodeStates.STARTED;
  const consensusNodeAliases = ['node1', 'node2'] as NodeAliases;

  const relays = {[serviceName]: new RelayComponent(name, cluster, namespace, consensusNodeAliases)};
  const haProxies = {
    [serviceName]: new HaProxyComponent(name, cluster, namespace),
    ['serviceName2']: new HaProxyComponent('name2', 'cluster2', namespace),
  };
  const mirrorNodes = {[serviceName]: new MirrorNodeComponent(name, cluster, namespace)};
  const envoyProxies = {
    [serviceName]: new EnvoyProxyComponent(name, cluster, namespace),
    ['serviceName2']: new EnvoyProxyComponent('name2', 'cluster2', namespace),
  };
  const consensusNodes = {
    [serviceName]: new ConsensusNodeComponent(name, cluster, namespace, state, 0),
    ['serviceName2']: new ConsensusNodeComponent('node2', 'cluster2', namespace, state, 1),
  };
  const mirrorNodeExplorers = {[serviceName]: new MirrorNodeExplorerComponent(name, cluster, namespace)};

  // @ts-expect-error - TS267: to access private constructor
  const componentsDataWrapper = new ComponentsDataWrapper(
    relays,
    haProxies,
    mirrorNodes,
    envoyProxies,
    consensusNodes,
    mirrorNodeExplorers,
  );
  /*
    ? The class after calling the toObject() method
    * RELAY: { serviceName: { name: 'name', cluster: 'cluster', namespace: 'namespace' consensusNodeAliases: ['node1', 'node2'] } },
    * HAPROXY: { serviceName: { name: 'name', cluster: 'cluster', namespace: 'namespace' } },
    * MIRROR_NODE: { serviceName: { name: 'name', cluster: 'cluster', namespace: 'namespace' } },
    * ENVOY_PROXY: { serviceName: { name: 'name', cluster: 'cluster', namespace: 'namespace' } },
    * CONSENSUS_NODE: { serviceName: { state: 'started', name: 'name', cluster: 'cluster', namespace: 'namespace'} },
    * MIRROR_NODE_EXPLORER: { serviceName: { name: 'name', cluster: 'cluster', namespace: 'namespace' } },
    */
  return {
    values: {name, cluster, namespace, state, consensusNodeAliases},
    components: {consensusNodes, haProxies, envoyProxies, mirrorNodes, mirrorNodeExplorers, relays},
    wrapper: {componentsDataWrapper},
    serviceName,
  };
}

describe('ComponentsDataWrapper', () => {
  it('should be able to create a instance', () => createComponentsDataWrapper());

  it('should not be able to create a instance if wrong data is passed to constructor', () => {
    // @ts-expect-error - TS267: to access private constructor
    expect(() => new ComponentsDataWrapper({serviceName: {}})).to.throw(SoloError, 'Invalid component type');
  });

  it('toObject method should return a object that can be parsed with fromObject', () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newComponentsDataWrapper = ComponentsDataWrapper.fromObject(componentsDataWrapper.toObject());
    const componentsDataWrapperObject = componentsDataWrapper.toObject();

    expect(componentsDataWrapperObject).to.deep.equal(newComponentsDataWrapper.toObject());

    for (const type of Object.values(ComponentTypes)) {
      expect(componentsDataWrapperObject).to.have.ownProperty(type);
    }

    expect(componentsDataWrapper);
  });

  it('should not be able to add new component with the .add() method if it already exist', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {consensusNodes},
      serviceName,
    } = createComponentsDataWrapper();

    const existingComponent = consensusNodes[serviceName];

    expect(() => componentsDataWrapper.addNewComponent(existingComponent)).to.throw(SoloError, 'Component exists');
  });

  it('should be able to add new component with the .add() method', () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newServiceName = 'envoy';
    const {name, cluster, namespace} = {
      name: newServiceName,
      cluster: 'cluster',
      namespace: 'new-namespace',
    };
    const newComponent = new EnvoyProxyComponent(name, cluster, namespace);

    componentsDataWrapper.addNewComponent(newComponent);

    const componentDataWrapperObject = componentsDataWrapper.toObject();

    expect(componentDataWrapperObject[ComponentTypes.EnvoyProxy]).has.own.property(newServiceName);

    expect(componentDataWrapperObject[ComponentTypes.EnvoyProxy][newServiceName]).to.deep.equal({
      name,
      cluster,
      namespace,
    });

    expect(Object.values(componentDataWrapperObject[ComponentTypes.EnvoyProxy])).to.have.lengthOf(3);
  });

  it('should be able to edit component with the .edit()', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      values: {cluster, namespace},
      serviceName,
    } = createComponentsDataWrapper();
    const relayComponent = relays[serviceName];

    componentsDataWrapper.editComponent(relayComponent);

    const newCluster = 'newCluster';

    const newReplayComponent = new RelayComponent(relayComponent.name, newCluster, namespace);

    componentsDataWrapper.editComponent(newReplayComponent);

    expect(componentsDataWrapper.toObject()[ComponentTypes.Relay][relayComponent.name].cluster).to.equal(newCluster);
  });

  it("should not be able to edit component with the .edit() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      serviceName,
    } = createComponentsDataWrapper();
    const notFoundServiceName = 'not_found';
    const relay = relays[serviceName];
    relay.name = notFoundServiceName;

    expect(() => componentsDataWrapper.editComponent(relay)).to.throw(
      SoloError,
      `Component doesn't exist, name: ${notFoundServiceName}`,
    );
  });

  it('should be able to remove component with the .remove()', () => {
    const {
      wrapper: {componentsDataWrapper},
      serviceName,
    } = createComponentsDataWrapper();

    componentsDataWrapper.removeComponent(serviceName, ComponentTypes.Relay);

    expect(componentsDataWrapper.relays).not.to.have.own.property(serviceName);
  });

  it("should not be able to remove component with the .remove() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundServiceName = 'not_found';

    expect(() => componentsDataWrapper.removeComponent(notFoundServiceName, ComponentTypes.Relay)).to.throw(
      SoloError,
      `Component ${notFoundServiceName} of type ${ComponentTypes.Relay} not found while attempting to remove`,
    );
  });
});

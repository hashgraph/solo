/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ComponentsDataWrapper} from '../../../../../src/core/config/remote/components_data_wrapper.js';
import {HaProxyComponent} from '../../../../../src/core/config/remote/components/ha_proxy_component.js';
import {MirrorNodeComponent} from '../../../../../src/core/config/remote/components/mirror_node_component.js';
import {EnvoyProxyComponent} from '../../../../../src/core/config/remote/components/envoy_proxy_component.js';
import {ConsensusNodeComponent} from '../../../../../src/core/config/remote/components/consensus_node_component.js';
import {MirrorNodeExplorerComponent} from '../../../../../src/core/config/remote/components/mirror_node_explorer_component.js';
import {RelayComponent} from '../../../../../src/core/config/remote/components/relay_component.js';
import {ComponentType, ConsensusNodeStates} from '../../../../../src/core/config/remote/enumerations.js';
import {SoloError} from '../../../../../src/core/errors.js';
import {type NodeAliases} from '../../../../../src/types/aliases.js';

export function createComponentsDataWrapper() {
  const serviceName = 'serviceName';

  const name = 'name';
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

  // @ts-ignore
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
    // @ts-ignore
    expect(() => new ComponentsDataWrapper({serviceName: {}})).to.throw(SoloError, 'Invalid component type');
  });

  it('toObject method should return a object that can be parsed with fromObject', () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newComponentsDataWrapper = ComponentsDataWrapper.fromObject(componentsDataWrapper.toObject());
    const componentsDataWrapperObject = componentsDataWrapper.toObject();

    expect(componentsDataWrapperObject).to.deep.equal(newComponentsDataWrapper.toObject());

    Object.values(ComponentType).forEach(type => {
      expect(componentsDataWrapperObject).to.have.ownProperty(type);
    });

    expect(componentsDataWrapper);
  });

  it('should not be able to add new component with the .add() method if it already exist', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {consensusNodes},
      serviceName,
    } = createComponentsDataWrapper();

    const existingComponent = consensusNodes[serviceName];

    expect(() => componentsDataWrapper.add(existingComponent)).to.throw(SoloError, 'Component exists');
  });

  it('should be able to add new component with the .add() method', () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newServiceName = 'newServiceName';
    const {name, cluster, namespace} = {
      name: 'envoy',
      cluster: 'cluster',
      namespace: 'new-namespace',
    };
    const newComponent = new EnvoyProxyComponent(name, cluster, namespace);

    componentsDataWrapper.add(newComponent);

    const componentDataWrapperObject = componentsDataWrapper.toObject();

    expect(componentDataWrapperObject[ComponentType.EnvoyProxy]).has.own.property(newServiceName);

    expect(componentDataWrapperObject[ComponentType.EnvoyProxy][newServiceName]).to.deep.equal({
      name,
      cluster,
      namespace,
    });

    expect(Object.values(componentDataWrapperObject[ComponentType.EnvoyProxy])).to.have.lengthOf(3);
  });

  it('should be able to edit component with the .edit()', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      values: {cluster, namespace},
      serviceName,
    } = createComponentsDataWrapper();
    const relayComponent = relays[serviceName];

    componentsDataWrapper.edit(relayComponent);

    const newName = 'newName';

    const newReplayComponent = new RelayComponent(newName, cluster, namespace);

    componentsDataWrapper.edit(newReplayComponent);

    expect(componentsDataWrapper.toObject()[ComponentType.Relay][serviceName].name).to.equal(newName);
  });

  it("should not be able to edit component with the .edit() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      serviceName,
    } = createComponentsDataWrapper();
    const notFoundServiceName = 'not_found';
    const relay = relays[serviceName];

    expect(() => componentsDataWrapper.edit(relay)).to.throw(
      SoloError,
      `Component doesn't exist, name: ${notFoundServiceName}`,
    );
  });

  it('should be able to remove component with the .remove()', () => {
    const {
      wrapper: {componentsDataWrapper},
      serviceName,
    } = createComponentsDataWrapper();

    componentsDataWrapper.remove(serviceName, ComponentType.Relay);

    // @ts-ignore
    expect(componentsDataWrapper.relays).not.to.have.own.property(serviceName);
  });

  it("should not be able to remove component with the .remove() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundServiceName = 'not_found';

    expect(() => componentsDataWrapper.remove(notFoundServiceName, ComponentType.Relay)).to.throw(
      SoloError,
      `Component ${notFoundServiceName} of type ${ComponentType.Relay} not found while attempting to remove`,
    );
  });
});

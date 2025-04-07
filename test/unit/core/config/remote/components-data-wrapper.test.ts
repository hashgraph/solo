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
import {ComponentTypes} from '../../../../../src/core/config/remote/enumerations/component-types.js';
import {ConsensusNodeStates} from '../../../../../src/core/config/remote/enumerations/consensus-node-states.js';
import {ComponentStates} from '../../../../../src/core/config/remote/enumerations/component-states.js';
import {type NodeAliases} from '../../../../../src/types/aliases.js';
import {
  type ClusterReference,
  type ComponentsDataStructure,
  type NamespaceNameAsString,
} from '../../../../../src/core/config/remote/types.js';
import {BlockNodeComponent} from '../../../../../src/core/config/remote/components/block-node-component.js';

export function createComponentsDataWrapper(): {
  values: {
    name: string;
    cluster: ClusterReference;
    namespace: NamespaceNameAsString;
    nodeState: ConsensusNodeStates;
    consensusNodeAliases: NodeAliases;
    state: ComponentStates;
  };
  components: {
    relays: Record<string, RelayComponent>;
    haProxies: Record<string, HaProxyComponent>;
    mirrorNodes: Record<string, MirrorNodeComponent>;
    envoyProxies: Record<string, EnvoyProxyComponent>;
    consensusNodes: Record<string, ConsensusNodeComponent>;
    mirrorNodeExplorers: Record<string, MirrorNodeExplorerComponent>;
    blockNodes: Record<string, BlockNodeComponent>;
  };
  wrapper: {componentsDataWrapper: ComponentsDataWrapper};
  componentName: string;
} {
  const name: string = 'name';
  const componentName: string = name;

  const cluster: ClusterReference = 'cluster';
  const namespace: NamespaceNameAsString = 'namespace';
  const nodeState: ConsensusNodeStates = ConsensusNodeStates.STARTED;
  const consensusNodeAliases: NodeAliases = ['node1', 'node2'];
  const state: ComponentStates = ComponentStates.ACTIVE;

  const relays: Record<string, RelayComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new RelayComponent(name, cluster, namespace, state, consensusNodeAliases),
  };

  const haProxies: Record<string, HaProxyComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new HaProxyComponent(name, cluster, namespace, state),
  };

  const mirrorNodes: Record<string, MirrorNodeComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new MirrorNodeComponent(name, cluster, namespace, state),
  };

  const envoyProxies: Record<string, EnvoyProxyComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new EnvoyProxyComponent(name, cluster, namespace, state),
  };

  const consensusNodes: Record<string, ConsensusNodeComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new ConsensusNodeComponent(name, cluster, namespace, state, nodeState, 0),
  };

  const mirrorNodeExplorers: Record<string, MirrorNodeExplorerComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new MirrorNodeExplorerComponent(name, cluster, namespace, state),
  };

  const blockNodes: Record<string, BlockNodeComponent> = {
    // @ts-expect-error - to access private constructor
    [componentName]: new BlockNodeComponent(name, cluster, namespace, state),
  };

  // @ts-expect-error - TS267: to access private constructor
  const componentsDataWrapper: ComponentsDataWrapper = new ComponentsDataWrapper(
    relays,
    haProxies,
    mirrorNodes,
    envoyProxies,
    consensusNodes,
    mirrorNodeExplorers,
    blockNodes,
  );

  return {
    values: {name, cluster, namespace, nodeState, consensusNodeAliases, state},
    components: {consensusNodes, haProxies, envoyProxies, mirrorNodes, mirrorNodeExplorers, relays, blockNodes},
    wrapper: {componentsDataWrapper},
    componentName,
  };
}

describe('ComponentsDataWrapper', () => {
  it('should be able to create a instance', () => createComponentsDataWrapper());

  it('should not be able to create a instance if wrong data is passed to constructor', () => {
    // @ts-expect-error - TS267: to access private constructor
    expect((): ComponentsDataWrapper => new ComponentsDataWrapper({componentName: {}})).to.throw(
      SoloError,
      'Invalid component type',
    );
  });

  it('toObject method should return a object that can be parsed with fromObject', () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const newComponentsDataWrapper: ComponentsDataWrapper = ComponentsDataWrapper.fromObject(
      componentsDataWrapper.toObject(),
    );

    const componentsDataWrapperObject: ComponentsDataStructure = componentsDataWrapper.toObject();

    expect(componentsDataWrapperObject).to.deep.equal(newComponentsDataWrapper.toObject());

    for (const type of Object.values(ComponentTypes)) {
      expect(componentsDataWrapperObject).to.have.ownProperty(type);
    }

    expect(componentsDataWrapper);
  });

  it('should not be able to add new component with the .addNewComponent() method if it already exist', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {consensusNodes},
      componentName,
    } = createComponentsDataWrapper();

    const existingComponent: ConsensusNodeComponent = consensusNodes[componentName];

    expect(() => componentsDataWrapper.addNewComponent(existingComponent)).to.throw(SoloError, 'Component exists');
  });

  it('should be able to add new component with the .addNewComponent() method', () => {
    const {
      wrapper: {componentsDataWrapper},
      values: {state},
    } = createComponentsDataWrapper();

    const newComponentName: string = 'envoy';
    const {name, cluster, namespace} = {
      name: newComponentName,
      cluster: 'cluster',
      namespace: 'new-namespace',
    };
    // @ts-expect-error - to access private constructor
    const newComponent: EnvoyProxyComponent = new EnvoyProxyComponent(name, cluster, namespace, state);

    componentsDataWrapper.addNewComponent(newComponent);

    const componentDataWrapperObject: ComponentsDataStructure = componentsDataWrapper.toObject();

    expect(componentDataWrapperObject[ComponentTypes.EnvoyProxy]).has.own.property(newComponentName);

    expect(componentDataWrapperObject[ComponentTypes.EnvoyProxy][newComponentName]).to.deep.equal({
      name,
      cluster,
      namespace,
      state,
    });

    expect(Object.values(componentDataWrapperObject[ComponentTypes.EnvoyProxy])).to.have.lengthOf(2);
  });

  it('should be able to change node state with the .changeNodeState(()', () => {
    const {
      wrapper: {componentsDataWrapper},
      componentName,
    } = createComponentsDataWrapper();

    const newNodeState: ConsensusNodeStates = ConsensusNodeStates.STOPPED;

    componentsDataWrapper.changeNodeState(componentName, newNodeState);

    expect(componentsDataWrapper.consensusNodes[componentName].nodeState).to.equal(newNodeState);
  });

  it("should not be able to edit component with the .editComponent() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();
    const notFoundComponentName: string = 'not_found';

    expect(() =>
      componentsDataWrapper.changeNodeState(notFoundComponentName, ConsensusNodeStates.NON_DEPLOYED),
    ).to.throw(SoloError, `Consensus node ${notFoundComponentName} doesn't exist`);
  });

  it('should be able to disable component with the .disableComponent()', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      componentName,
    } = createComponentsDataWrapper();

    componentsDataWrapper.disableComponent(componentName, ComponentTypes.Relay);

    expect(relays[componentName].state).to.equal(ComponentStates.DELETED);
  });

  it("should not be able to disable component with the .disableComponent() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentName: string = 'not_found';

    expect(() => componentsDataWrapper.disableComponent(notFoundComponentName, ComponentTypes.Relay)).to.throw(
      SoloError,
      `Component ${notFoundComponentName} of type ${ComponentTypes.Relay} not found while attempting to remove`,
    );
  });
});

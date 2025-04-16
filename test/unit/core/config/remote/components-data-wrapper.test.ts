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
import {type NodeId} from '../../../../../src/types/aliases.js';
import {
  type ClusterReference,
  type ComponentName,
  type NamespaceNameAsString,
} from '../../../../../src/core/config/remote/types.js';
import {type ComponentsDataStruct} from '../../../../../src/core/config/remote/interfaces/components-data-struct.js';
import {DeploymentPhase} from '../../../../../src/data/schema/model/remote/deployment-phase.js';

export function createComponentsDataWrapper(): {
  values: {
    name: string;
    cluster: ClusterReference;
    namespace: NamespaceNameAsString;
    phase: DeploymentPhase.DEPLOYED;
    consensusNodeIds: NodeId[];
  };
  components: {
    relays: Record<string, RelayComponent>;
    haProxies: Record<string, HaProxyComponent>;
    mirrorNodes: Record<string, MirrorNodeComponent>;
    envoyProxies: Record<string, EnvoyProxyComponent>;
    consensusNodes: Record<string, ConsensusNodeComponent>;
    mirrorNodeExplorers: Record<string, MirrorNodeExplorerComponent>;
  };
  wrapper: {componentsDataWrapper: ComponentsDataWrapper};
  componentName: string;
} {
  const name: string = 'name';
  const componentName: string = name;

  const cluster: ClusterReference = 'cluster';
  const namespace: NamespaceNameAsString = 'namespace';
  const phase: DeploymentPhase = DeploymentPhase.DEPLOYED;
  const consensusNodeIds: NodeId[] = [0, 1];

  const relays: Record<string, RelayComponent> = {
    [componentName]: new RelayComponent(name, cluster, namespace, phase, consensusNodeIds),
  };

  const haProxies: Record<string, HaProxyComponent> = {
    [componentName]: new HaProxyComponent(name, cluster, namespace, phase),
  };

  const mirrorNodes: Record<string, MirrorNodeComponent> = {
    [componentName]: new MirrorNodeComponent(name, cluster, namespace, phase),
  };

  const envoyProxies: Record<string, EnvoyProxyComponent> = {
    [componentName]: new EnvoyProxyComponent(name, cluster, namespace, phase),
  };

  const consensusNodes: Record<string, ConsensusNodeComponent> = {
    [componentName]: new ConsensusNodeComponent(name, cluster, namespace, phase, 0),
  };

  const mirrorNodeExplorers: Record<string, MirrorNodeExplorerComponent> = {
    [componentName]: new MirrorNodeExplorerComponent(name, cluster, namespace, phase),
  };

  // @ts-expect-error - TS267: to access private constructor
  const componentsDataWrapper: ComponentsDataWrapper = new ComponentsDataWrapper(
    relays,
    haProxies,
    mirrorNodes,
    envoyProxies,
    consensusNodes,
    mirrorNodeExplorers,
  );

  return {
    values: {name, cluster, namespace, phase, consensusNodeIds},
    components: {consensusNodes, haProxies, envoyProxies, mirrorNodes, mirrorNodeExplorers, relays},
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

    const componentsDataWrapperObject: ComponentsDataStruct = componentsDataWrapper.toObject();

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
    } = createComponentsDataWrapper();

    const newComponentName: string = 'envoy';
    const {name, cluster, namespace, phase} = {
      name: newComponentName,
      cluster: 'cluster',
      namespace: 'new-namespace',
      phase: DeploymentPhase.DEPLOYED,
    };
    const newComponent: EnvoyProxyComponent = new EnvoyProxyComponent(name, cluster, namespace, phase);

    componentsDataWrapper.addNewComponent(newComponent);

    const componentDataWrapperObject: ComponentsDataStruct = componentsDataWrapper.toObject();

    expect(componentDataWrapperObject[ComponentTypes.EnvoyProxy]).has.own.property(newComponentName);

    expect(componentDataWrapperObject[ComponentTypes.EnvoyProxy][newComponentName]).to.deep.equal({
      name,
      cluster,
      namespace,
      phase,
    });

    expect(Object.values(componentDataWrapperObject[ComponentTypes.EnvoyProxy])).to.have.lengthOf(2);
  });

  it('should be able to change node state with the .changeNodeState(()', () => {
    const {
      wrapper: {componentsDataWrapper},
      componentName,
    } = createComponentsDataWrapper();

    const newNodeState: DeploymentPhase = DeploymentPhase.STOPPED;

    componentsDataWrapper.changeNodePhase(componentName, newNodeState);

    expect(componentsDataWrapper.consensusNodes[componentName].phase).to.equal(newNodeState);
  });

  it("should not be able to edit component with the .editComponent() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();
    const notFoundComponentName: string = 'not_found';

    expect(() => componentsDataWrapper.changeNodePhase(notFoundComponentName, DeploymentPhase.FROZEN)).to.throw(
      SoloError,
      `Consensus node ${notFoundComponentName} doesn't exist`,
    );
  });

  it('should be able to remove component with the .removeComponent()', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {relays},
      componentName,
    } = createComponentsDataWrapper();

    componentsDataWrapper.removeComponent(componentName, ComponentTypes.Relay);

    expect(relays).to.not.have.own.property(componentName);
  });

  it("should not be able to remove component with the .removeComponent() if it doesn't exist ", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentName: string = 'not_found';

    expect(() => componentsDataWrapper.removeComponent(notFoundComponentName, ComponentTypes.Relay)).to.throw(
      SoloError,
      `Component ${notFoundComponentName} of type ${ComponentTypes.Relay} not found while attempting to remove`,
    );
  });

  it('should be able to get components with .getComponent()', () => {
    const {
      wrapper: {componentsDataWrapper},
      componentName,
      components: {mirrorNodes},
    } = createComponentsDataWrapper();

    const mirrorNodeComponent: MirrorNodeComponent = componentsDataWrapper.getComponent<MirrorNodeComponent>(
      ComponentTypes.MirrorNode,
      componentName,
    );

    expect(mirrorNodes[componentName].toObject()).to.deep.equal(mirrorNodeComponent.toObject());
  });

  it("should fail if trying to get component that doesn't exist with .getComponent()", () => {
    const {
      wrapper: {componentsDataWrapper},
    } = createComponentsDataWrapper();

    const notFoundComponentName: ComponentName = 'not_found';
    const type: ComponentTypes = ComponentTypes.MirrorNode;

    expect(() => componentsDataWrapper.getComponent<MirrorNodeComponent>(type, notFoundComponentName)).to.throw(
      `Component ${notFoundComponentName} of type ${type} not found while attempting to read`,
    );
  });

  it('should be able to get components with .applyCallbackToComponentGroup()', () => {
    const {
      wrapper: {componentsDataWrapper},
      components: {mirrorNodes},
      values: {cluster},
    } = createComponentsDataWrapper();

    const mirrorNodeComponents: MirrorNodeComponent[] =
      componentsDataWrapper.getComponentsByClusterReference<MirrorNodeComponent>(ComponentTypes.MirrorNode, cluster);

    for (const mirrorNodeComponent of mirrorNodeComponents) {
      expect(mirrorNodeComponent.toObject()).to.deep.equal(mirrorNodes[mirrorNodeComponent.name].toObject());
      expect(mirrorNodeComponent.cluster).to.equal(cluster);
    }

    expect(Object.keys(mirrorNodes).length).to.equal(mirrorNodeComponents.length);
  });
});

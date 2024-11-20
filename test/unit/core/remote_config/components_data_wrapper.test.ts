/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { expect } from 'chai'
import { describe, it } from 'mocha'

import { ComponentsDataWrapper } from '../../../../src/core/config/remote/components_data_wrapper.ts'
import {
  ConsensusNodeComponent,
  EnvoyProxyComponent,
  HaProxyComponent,
  MirrorNodeComponent,
  MirrorNodeExplorerComponent,
  RelayComponent
} from '../../../../src/core/config/remote/components/index.ts'
import { ComponentTypeEnum, ConsensusNodeStates } from '../../../../src/core/config/remote/enumerations.ts'
import { SoloError } from '../../../../src/core/errors.ts'
import type { NodeAliases } from '../../../../src/types/aliases.ts'

export function createComponentsDataWrapper () {
  const serviceName = 'serviceName'

  const name = 'name'
  const cluster  = 'cluster'
  const namespace = 'namespace'
  const state = ConsensusNodeStates.STARTED
  const consensusNodeAliases = ['node1', 'node2'] as NodeAliases

  const relays = { [serviceName]: new RelayComponent(name, cluster, namespace, consensusNodeAliases) }
  const haProxies = { [serviceName]: new HaProxyComponent(name, cluster, namespace) }
  const mirrorNodes = { [serviceName]: new MirrorNodeComponent(name, cluster, namespace) }
  const envoyProxies = { [serviceName]: new EnvoyProxyComponent(name, cluster, namespace) }
  const consensusNodes = { [serviceName]: new ConsensusNodeComponent(name, cluster, namespace, state) }
  const mirrorNodeExplorers = { [serviceName]: new MirrorNodeExplorerComponent(name, cluster, namespace) }

  // @ts-ignore
  const componentsDataWrapper = new ComponentsDataWrapper(
    relays,
    haProxies,
    mirrorNodes,
    envoyProxies,
    consensusNodes,
    mirrorNodeExplorers,
  )
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
    values: { name, cluster, namespace, state, consensusNodeAliases },
    components: { consensusNodes, haProxies, envoyProxies, mirrorNodes, mirrorNodeExplorers, relays },
    wrapper: { componentsDataWrapper },
    serviceName,
  }
}

describe('ComponentsDataWrapper', () => {
  it ('should be able to create a instance', () => createComponentsDataWrapper())

  it ('should not be able to create a instance if wrong data is passed to constructor', () => {
    // @ts-ignore
    expect(() => new ComponentsDataWrapper({ serviceName: {} }))
      .to.throw(SoloError, 'Invalid component type')
  })

  it ('toObject method should return a object that can be parsed with fromObject', () => {
    const { wrapper: { componentsDataWrapper } } = createComponentsDataWrapper()

    const newComponentsDataWrapper = ComponentsDataWrapper.fromObject(componentsDataWrapper.toObject())
    const componentsDataWrapperObject = componentsDataWrapper.toObject()

    expect(componentsDataWrapperObject).to.deep.equal(newComponentsDataWrapper.toObject())

    Object.values(ComponentTypeEnum).forEach((type) => {
      expect(componentsDataWrapperObject).to.have.ownProperty(type)
    })

    expect(componentsDataWrapper)
  })

  it ('should not be able to add new component with the .add() method if it already exist', () => {
    const { wrapper: { componentsDataWrapper } } = createComponentsDataWrapper()

    const newServiceName = 'newServiceName'
    const { name, cluster, namespace } = { name: 'envoy', cluster: 'cluster', namespace: 'namespace' }
    const newComponent = new EnvoyProxyComponent(name, cluster, namespace)

    expect(() => componentsDataWrapper.add(newServiceName, newComponent))
      .to.throw(SoloError, 'Component exists')
  })

  it ('should be able to add new component with the .add() method', () => {
    const { wrapper: { componentsDataWrapper } } = createComponentsDataWrapper()

    const newServiceName = 'newServiceName'
    const { name, cluster, namespace } = { name: 'envoy', cluster: 'cluster', namespace: 'newNamespace' }
    const newComponent = new EnvoyProxyComponent(name, cluster, namespace)

    componentsDataWrapper.add(newServiceName, newComponent)

    const componentDataWrapperObject = componentsDataWrapper.toObject()

    expect(componentDataWrapperObject[ComponentTypeEnum.EnvoyProxy]).has.own.property(newServiceName)

    expect(componentDataWrapperObject[ComponentTypeEnum.EnvoyProxy][newServiceName])
      .to.deep.equal({ name, cluster, namespace })

    expect(Object.values(componentDataWrapperObject[ComponentTypeEnum.EnvoyProxy])).to.have.lengthOf(2)
  })

  it ('should be able to edit component with the .edit()', () => {
    const {
      wrapper: { componentsDataWrapper },
      components: { relays },
      values: { cluster, namespace },
      serviceName,
    } = createComponentsDataWrapper()
    const relayComponent = relays[serviceName]

    componentsDataWrapper.edit(serviceName, relayComponent)

    const newName = 'newName'

    const newReplayComponent = new RelayComponent(newName, cluster, namespace)

    componentsDataWrapper.edit(serviceName, newReplayComponent)

    expect(componentsDataWrapper.toObject()[ComponentTypeEnum.Relay][serviceName].name).to.equal(newName)
  })

  it ('should not be able to edit component with the .edit() if it doesn\'t exist ', () => {
    const {
      wrapper: { componentsDataWrapper },
      components: { relays },
      serviceName
    } = createComponentsDataWrapper()
    const notFoundServiceName = 'not_found'
    const relay = relays[serviceName]

    expect(() => componentsDataWrapper.edit(notFoundServiceName, relay))
      .to.throw(SoloError, `Component doesn't exist, name: ${notFoundServiceName}`)
  })

  it ('should be able to remove component with the .remove()', () => {
    const { wrapper: { componentsDataWrapper }, serviceName } = createComponentsDataWrapper()

    componentsDataWrapper.remove(serviceName, ComponentTypeEnum.Relay)

    // @ts-ignore
    expect(componentsDataWrapper.relays).not.to.have.own.property(serviceName)
  })

  it ('should not be able to remove component with the .remove() if it doesn\'t exist ', () => {
    const { wrapper: { componentsDataWrapper } } = createComponentsDataWrapper()

    const notFoundServiceName = 'not_found'

    expect(() => componentsDataWrapper.remove(notFoundServiceName, ComponentTypeEnum.Relay))
      .to.throw(
      SoloError,
      `Component ${notFoundServiceName} of type ${ComponentTypeEnum.Relay} not found while attempting to remove`
    )
  })

})
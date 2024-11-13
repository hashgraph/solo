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
import { ComponentTypeEnum } from './enumerations.ts'
import { SoloError } from '../../errors.ts'
import {
  BaseComponent, ConsensusNodeComponent, HaProxyComponent, EnvoyProxyComponent,
  MirrorNodeComponent, MirrorNodeExplorerComponent, RelayComponent,
} from './components/index.ts'
import type { Component, IConsensusNodeComponent, IRelayComponent, ServiceName } from './types.ts'

export class ComponentsDataWrapper {
  private constructor (
    private readonly consensusNodes: Record<ServiceName, ConsensusNodeComponent> = {},
    private readonly haProxies: Record<ServiceName, HaProxyComponent> = {},
    private readonly envoyProxies: Record<ServiceName, EnvoyProxyComponent> = {},
    private readonly mirrorNodes: Record<ServiceName, MirrorNodeComponent> = {},
    private readonly mirrorNodeExplorers: Record<ServiceName, MirrorNodeExplorerComponent> = {},
    private readonly relays: Record<ServiceName, RelayComponent> = {},
  ) {
    this.validate()
  }

  private validate () {
    function testComponentsObject (components: Record<ServiceName, BaseComponent>, expectedInstance: any) {
      Object.entries(components).forEach(([serviceName, component]: [ServiceName, BaseComponent]) => {
        if (!serviceName || typeof serviceName !== 'string') {
          throw new SoloError(`Invalid component service name ${{ [serviceName]: component }}`)
        }

        if (!(component instanceof expectedInstance)) {
          throw new SoloError('Invalid component type', null, { component })
        }
      })
    }

    testComponentsObject(this.consensusNodes, ConsensusNodeComponent)
    testComponentsObject(this.haProxies, HaProxyComponent)
    testComponentsObject(this.envoyProxies, EnvoyProxyComponent)
    testComponentsObject(this.mirrorNodes, MirrorNodeComponent)
    testComponentsObject(this.mirrorNodeExplorers, MirrorNodeExplorerComponent)
    testComponentsObject(this.relays, RelayComponent)
  }

  static fromObject (components: Record<ComponentTypeEnum, Record<ServiceName, Component>>): ComponentsDataWrapper {

    const consensusNodes: Record<ServiceName, ConsensusNodeComponent> = {}
    const haProxies: Record<ServiceName, HaProxyComponent> = {}
    const envoyProxies: Record<ServiceName, EnvoyProxyComponent> = {}
    const mirrorNodes: Record<ServiceName, MirrorNodeComponent> = {}
    const mirrorNodeExplorers: Record<ServiceName, MirrorNodeExplorerComponent> = {}
    const relays: Record<ServiceName, RelayComponent> = {}

    Object.entries(components).forEach(([type, components]: [ComponentTypeEnum, Record<ServiceName, Component>]) => {
      type Params = [ServiceName, Component]

      switch (type) {
        case ComponentTypeEnum.ConsensusNode:

          Object.entries(components).forEach(([serviceName, component]: [ServiceName, IConsensusNodeComponent]) => {
            const { name, cluster, namespace, state } = component
            consensusNodes[serviceName] = new ConsensusNodeComponent(name, cluster, namespace, state)
          })

          break
        case ComponentTypeEnum.Relay:

          Object.entries(components).forEach(([serviceName, component]: [ServiceName, IRelayComponent]) => {
            const { name, cluster, namespace, consensusNodeAliases } = component
            relays[serviceName] = new RelayComponent(name, cluster, namespace, consensusNodeAliases)
          })

          break
        case ComponentTypeEnum.HaProxy:

          Object.entries(components).forEach(([serviceName, component]: Params) => {
            const { name, cluster, namespace } = component
            haProxies[serviceName] = new HaProxyComponent(name, cluster, namespace)
          })

          break
        case ComponentTypeEnum.EnvoyProxy:

          Object.entries(components).forEach(([serviceName, component]: Params) => {
            const { name, cluster, namespace } = component
            envoyProxies[serviceName] = new EnvoyProxyComponent(name, cluster, namespace)
          })

          break
        case ComponentTypeEnum.MirrorNode:

          Object.entries(components).forEach(([serviceName, component]: Params) => {
            const { name, cluster, namespace } = component
            mirrorNodes[serviceName] = new MirrorNodeComponent(name, cluster, namespace)
          })

          break
        case ComponentTypeEnum.MirrorNodeExplorer:

          Object.entries(components).forEach(([serviceName, component]: Params) => {
            const { name, cluster, namespace } = component
            mirrorNodeExplorers[serviceName] = new MirrorNodeExplorerComponent(name, cluster, namespace)
          })

          break
        default:
          throw new SoloError(`Unknown component type ${type}`)
      }
    })

    return new ComponentsDataWrapper(
      consensusNodes,
      haProxies,
      envoyProxies,
      mirrorNodes,
      mirrorNodeExplorers,
      relays
    )
  }

  toObject () {
    function transform (components: Record<ServiceName, BaseComponent>) {
      const transformedComponents: Record<ServiceName, Component> = {}

      Object.entries(components).forEach(([serviceName, component]) => {
        transformedComponents[serviceName] = component.toObject() as Component
      })

      return transformedComponents
    }

    return {
      [ComponentTypeEnum.ConsensusNode]: transform(this.consensusNodes),
      [ComponentTypeEnum.HaProxy]: transform(this.haProxies),
      [ComponentTypeEnum.EnvoyProxy]: transform(this.envoyProxies),
      [ComponentTypeEnum.MirrorNode]: transform(this.mirrorNodes),
      [ComponentTypeEnum.MirrorNodeExplorer]: transform(this.mirrorNodeExplorers),
      [ComponentTypeEnum.Relay]: transform(this.relays),
    }
  }

  add (serviceName: ServiceName, component: BaseComponent) {
    const self = this

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent)
    }

    function addComponent (components: Record<ServiceName, BaseComponent>) {
      if (self.exists(components, component)) {
        throw new SoloError('Component exists', null, component.toObject())
      }

      components[serviceName] = component
    }

    switch (component.type) {
      case ComponentTypeEnum.ConsensusNode:
        addComponent(self.consensusNodes)
        break
      case ComponentTypeEnum.HaProxy:
        addComponent(self.haProxies)
        break
      case ComponentTypeEnum.EnvoyProxy:
        addComponent(self.envoyProxies)
        break
      case ComponentTypeEnum.MirrorNode:
        addComponent(self.mirrorNodes)
        break
      case ComponentTypeEnum.MirrorNodeExplorer:
        addComponent(self.mirrorNodeExplorers)
        break
      case ComponentTypeEnum.Relay:
        addComponent(self.relays)
        break
      default:
        throw new SoloError(`Unknown component type ${component.type}, service name: ${serviceName}`)
    }

    this.validate()
  }

  edit (serviceName: ServiceName, component: BaseComponent) {
    const self = this

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent)
    }

    function editComponent (components: Record<ServiceName, BaseComponent>) {
      if (!components.hasOwnProperty(serviceName)) {
        throw new SoloError(`Component doesn't exist, name: ${serviceName}`, null, { component })
      }

      components[serviceName] = component
    }

    switch (component.type) {
      case ComponentTypeEnum.ConsensusNode:
        editComponent(self.consensusNodes)
        break
      case ComponentTypeEnum.HaProxy:
        editComponent(self.haProxies)
        break
      case ComponentTypeEnum.EnvoyProxy:
        editComponent(self.envoyProxies)
        break
      case ComponentTypeEnum.MirrorNode:
        editComponent(self.mirrorNodes)
        break
      case ComponentTypeEnum.MirrorNodeExplorer:
        editComponent(self.mirrorNodeExplorers)
        break
      case ComponentTypeEnum.Relay:
        editComponent(self.relays)
        break
      default:
        throw new SoloError(`Unknown component type ${component.type}, service name: ${serviceName}`)
    }

    this.validate()
  }

  remove (serviceName: ServiceName, type: ComponentTypeEnum) {
    const self = this

    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }

    if (!Object.values(ComponentTypeEnum).includes(type)) {
      throw new SoloError(`Invalid component type ${type}`)
    }

    function deleteComponent (components: Record<ServiceName, BaseComponent>) {
      if (!components.hasOwnProperty(serviceName)) {
        throw new SoloError(`Component ${serviceName} of type ${type} not found while attempting to remove`)
      }

      delete components[serviceName]
    }

    switch (type) {
      case ComponentTypeEnum.ConsensusNode:
        deleteComponent(self.consensusNodes)
        break
      case ComponentTypeEnum.HaProxy:
        deleteComponent(self.haProxies)
        break
      case ComponentTypeEnum.EnvoyProxy:
        deleteComponent(self.envoyProxies)
        break
      case ComponentTypeEnum.MirrorNode:
        deleteComponent(self.mirrorNodes)
        break
      case ComponentTypeEnum.MirrorNodeExplorer:
        deleteComponent(self.mirrorNodeExplorers)
        break
      case ComponentTypeEnum.Relay:
        deleteComponent(self.relays)
        break
      default:
        throw new SoloError(`Unknown component type ${type}, service name: ${serviceName}`)
    }

    this.validate()
  }

  private exists (components: Record<ServiceName, BaseComponent>, newComponent: BaseComponent) {
    return Object.values(components)
      .some(component => BaseComponent.compare(component, newComponent))
  }
}
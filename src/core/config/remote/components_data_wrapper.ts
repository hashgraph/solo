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
import { SoloError } from '../../errors.js'
import type { Component, IRelayComponent, ServiceName } from './types.ts'
import {
  BaseComponent, ConsensusNodeComponent, HaProxyComponent, EnvoyProxyComponent,
  MirrorNodeComponent, MirrorNodeExplorerComponent, RelayComponent,
} from './components/index.js'

export class ComponentsDataWrapper {
  constructor (
    private readonly consensusNodes: Record<ServiceName, ConsensusNodeComponent> = {},
    private readonly haProxies: Record<ServiceName, HaProxyComponent> = {},
    private readonly envoyProxies: Record<ServiceName, EnvoyProxyComponent> = {},
    private readonly mirrorNodes: Record<ServiceName, MirrorNodeComponent> = {},
    private readonly mirrorNodeExplorers: Record<ServiceName, MirrorNodeExplorerComponent> = {},
    private readonly relays: Record<ServiceName, RelayComponent> = {},
  ) {}

  static fromObject (components: Record<ComponentTypeEnum, Record<ServiceName, Component>>) {

    const consensusNodes: Record<ServiceName, ConsensusNodeComponent> = {}
    const haProxies: Record<ServiceName, HaProxyComponent> = {}
    const envoyProxies: Record<ServiceName, EnvoyProxyComponent> = {}
    const mirrorNodes: Record<ServiceName, MirrorNodeComponent> = {}
    const mirrorNodeExplorers: Record<ServiceName, MirrorNodeExplorerComponent> = {}
    const relays: Record<ServiceName, RelayComponent> = {}

    Object.entries(components)
      .forEach(([type, components]: [ComponentTypeEnum, Record<ServiceName, Component>]) => {
        switch (type) {
          case ComponentTypeEnum.ConsensusNode:
            Object.entries(components).forEach(([name, component] : [ServiceName, Component]) => {
              consensusNodes[name] = new ConsensusNodeComponent(component.name, component.cluster, component.namespace)
            })

            break
          case ComponentTypeEnum.HaProxy:

            Object.entries(components).forEach(([name, component] : [ServiceName, Component]) => {
              haProxies[name] = new HaProxyComponent(component.name, component.cluster, component.namespace)
            })

            break
          case ComponentTypeEnum.EnvoyProxy:
            Object.entries(components).forEach(([name, component] : [ServiceName, Component]) => {
              envoyProxies[name] = new EnvoyProxyComponent(component.name, component.cluster, component.namespace)
            })

            break
          case ComponentTypeEnum.MirrorNode:
            Object.entries(components).forEach(([name, component] : [ServiceName, Component]) => {
              mirrorNodes[name] = new MirrorNodeComponent(component.name, component.cluster, component.namespace)
            })

            break
          case ComponentTypeEnum.MirrorNodeExplorer:
            Object.entries(components).forEach(([name, component] : [ServiceName, Component]) => {
              mirrorNodeExplorers[name] = new MirrorNodeExplorerComponent(component.name, component.cluster, component.namespace)
            })

            break
          case ComponentTypeEnum.Relay:
            Object.entries(components).forEach(([name, component] : [ServiceName, IRelayComponent]) => {
              relays[name] = new RelayComponent(component.name, component.cluster, component.namespace, component.consensusNodeAliases)
            })

            break
          default:
            throw new SoloError(`Unknown component type ${type}`)
        }
      })
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

  add (component: BaseComponent, serviceName: ServiceName) {
    if (!serviceName || typeof serviceName !== 'string') {
      throw new SoloError(`Service name is required ${serviceName}`)
    }

    if (!(component instanceof BaseComponent)) {
      throw new SoloError('Component must be instance of BaseComponent', undefined, BaseComponent)
    }

    const throwIfItExists = (components: Record<ServiceName, BaseComponent>) => {
      if (this.exists(components, component)) {
        throw new SoloError(`Component exists ${component.toObject()}`)
      }
    }

    switch (component.type) {
      case ComponentTypeEnum.ConsensusNode:
        throwIfItExists(this.consensusNodes)
        this.consensusNodes[serviceName] = component as ConsensusNodeComponent
        break
      case ComponentTypeEnum.HaProxy:
        throwIfItExists(this.haProxies)
        this.haProxies[serviceName] = component as HaProxyComponent
        break
      case ComponentTypeEnum.EnvoyProxy:
        throwIfItExists(this.envoyProxies)
        this.envoyProxies[serviceName] = component as EnvoyProxyComponent
        break
      case ComponentTypeEnum.MirrorNode:
        throwIfItExists(this.mirrorNodes)
        this.mirrorNodes[serviceName] = component as MirrorNodeComponent
        break
      case ComponentTypeEnum.MirrorNodeExplorer:
        throwIfItExists(this.mirrorNodeExplorers)
        this.mirrorNodeExplorers[serviceName] = component as MirrorNodeExplorerComponent
        break
      case ComponentTypeEnum.Relay:
        throwIfItExists(this.relays)
        this.relays[serviceName] = component as RelayComponent
        break
      default:
        throw new SoloError(`Unknown component type ${component.type}`)
    }
  }

  private exists (components: Record<ServiceName, BaseComponent>, newComponent: BaseComponent) {
    const list = Object.values(components)

    return list.some((component: BaseComponent) => (
      component.type === newComponent.type &&
      component.cluster === newComponent.cluster &&
      component.namespace === newComponent.namespace
    ))
  }
}








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
export class NetworkNodeServices {
  constructor (builder) {
    this.nodeName = builder.nodeName
    this.nodePodName = builder.nodePodName
    this.haProxyName = builder.haProxyName
    this.haProxyLoadBalancerIp = builder.haProxyLoadBalancerIp
    this.haProxyClusterIp = builder.haProxyClusterIp
    this.haProxyGrpcPort = builder.haProxyGrpcPort
    this.haProxyGrpcsPort = builder.haProxyGrpcsPort
    this.accountId = builder.accountId
    this.haProxyAppSelector = builder.haProxyAppSelector
    this.haProxyPodName = builder.haProxyPodName
    this.nodeServiceName = builder.nodeServiceName
    this.nodeServiceClusterIp = builder.nodeServiceClusterIp
    this.nodeServiceLoadBalancerIp = builder.nodeServiceLoadBalancerIp
    this.nodeServiceGossipPort = builder.nodeServiceGossipPort
    this.nodeServiceGrpcPort = builder.nodeServiceGrpcPort
    this.nodeServiceGrpcsPort = builder.nodeServiceGrpcsPort
    this.envoyProxyName = builder.envoyProxyName
    this.envoyProxyClusterIp = builder.envoyProxyClusterIp
    this.envoyProxyLoadBalancerIp = builder.envoyProxyLoadBalancerIp
    this.envoyProxyGrpcWebPort = builder.envoyProxyGrpcWebPort
  }

  key () {
    return this.nodeName
  }
}

export class NetworkNodeServicesBuilder {
  constructor (nodeName) {
    this.nodeName = nodeName
  }

  withAccountId (accountId) {
    this.accountId = accountId
    return this
  }

  withHaProxyName (haProxyName) {
    this.haProxyName = haProxyName
    return this
  }

  withHaProxyClusterIp (haProxyClusterIp) {
    this.haProxyClusterIp = haProxyClusterIp
    return this
  }

  withHaProxyLoadBalancerIp (haProxyLoadBalancerIp) {
    this.haProxyLoadBalancerIp = haProxyLoadBalancerIp
    return this
  }

  withHaProxyGrpcPort (haProxyGrpcPort) {
    this.haProxyGrpcPort = haProxyGrpcPort
    return this
  }

  withHaProxyGrpcsPort (haProxyGrpcsPort) {
    this.haProxyGrpcsPort = haProxyGrpcsPort
    return this
  }

  withHaProxyAppSelector (haProxyAppSelector) {
    this.haProxyAppSelector = haProxyAppSelector
    return this
  }

  withHaProxyPodName (haProxyPodName) {
    this.haProxyPodName = haProxyPodName
    return this
  }

  withNodePodName (nodePodName) {
    this.nodePodName = nodePodName
    return this
  }

  withNodeServiceName (nodeServiceName) {
    this.nodeServiceName = nodeServiceName
    return this
  }

  withNodeServiceClusterIp (nodeServiceClusterIp) {
    this.nodeServiceClusterIp = nodeServiceClusterIp
    return this
  }

  withNodeServiceLoadBalancerIp (nodeServiceLoadBalancerIp) {
    this.nodeServiceLoadBalancerIp = nodeServiceLoadBalancerIp
    return this
  }

  withNodeServiceGossipPort (nodeServiceGossipPort) {
    this.nodeServiceGossipPort = nodeServiceGossipPort
    return this
  }

  withNodeServiceGrpcPort (nodeServiceGrpcPort) {
    this.nodeServiceGrpcPort = nodeServiceGrpcPort
    return this
  }

  withNodeServiceGrpcsPort (nodeServiceGrpcsPort) {
    this.nodeServiceGrpcsPort = nodeServiceGrpcsPort
    return this
  }

  withEnvoyProxyName (envoyProxyName) {
    this.envoyProxyName = envoyProxyName
    return this
  }

  withEnvoyProxyClusterIp (envoyProxyClusterIp) {
    this.envoyProxyClusterIp = envoyProxyClusterIp
    return this
  }

  withEnvoyProxyLoadBalancerIp (envoyProxyLoadBalancerIp) {
    this.envoyProxyLoadBalancerIp = envoyProxyLoadBalancerIp
    return this
  }

  withEnvoyProxyGrpcWebPort (envoyProxyGrpcWebPort) {
    this.envoyProxyGrpcWebPort = envoyProxyGrpcWebPort
    return this
  }

  build () {
    return new NetworkNodeServices(this)
  }

  key () {
    return this.nodeName
  }
}

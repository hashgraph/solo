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
'use strict'
export class NetworkNodeServices {
  /**
   * @param {Object} builder
   * @param {string} builder.nodeName
   * @param {string} builder.nodePodName
   * @param {string} builder.haProxyName
   * @param {string} builder.haProxyLoadBalancerIp
   * @param {string} builder.haProxyClusterIp
   * @param {string|number} builder.haProxyGrpcPort
   * @param {string|number} builder.haProxyGrpcsPort
   * @param {string} builder.accountId
   * @param {string} builder.haProxyAppSelector
   * @param {string} builder.haProxyPodName
   * @param {string} builder.nodeServiceName
   * @param {string} builder.nodeServiceClusterIp
   * @param {string} builder.nodeServiceLoadBalancerIp
   * @param {string|number} builder.nodeServiceGossipPort
   * @param {string|number} builder.nodeServiceGrpcPort
   * @param {string|number} builder.nodeServiceGrpcsPort
   * @param {string} builder.envoyProxyName
   * @param {string} builder.envoyProxyClusterIp
   * @param {string} builder.envoyProxyLoadBalancerIp
   * @param {string|number} builder.envoyProxyGrpcWebPort
   */
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

  /**
   * @returns {string}
   */
  key () {
    return this.nodeName
  }
}

export class NetworkNodeServicesBuilder {
  /**
   * @param {string} nodeName
   */
  constructor (nodeName) {
    this.nodeName = nodeName
  }

  /**
   * @param {string} accountId
   * @returns {this}
   */
  withAccountId (accountId) {
    this.accountId = accountId
    return this
  }

  /**
   * @param {string} haProxyName
   * @returns {this}
   */
  withHaProxyName (haProxyName) {
    this.haProxyName = haProxyName
    return this
  }

  /**
   * @param {string} haProxyClusterIp
   * @returns {this}
   */
  withHaProxyClusterIp (haProxyClusterIp) {
    this.haProxyClusterIp = haProxyClusterIp
    return this
  }

  /**
   * @param {string} haProxyLoadBalancerIp
   * @returns {this}
   */
  withHaProxyLoadBalancerIp (haProxyLoadBalancerIp) {
    this.haProxyLoadBalancerIp = haProxyLoadBalancerIp
    return this
  }

  /**
   * @param {string|number} haProxyGrpcPort
   * @returns {this}
   */
  withHaProxyGrpcPort (haProxyGrpcPort) {
    this.haProxyGrpcPort = haProxyGrpcPort
    return this
  }

  /**
   * @param {string|number} haProxyGrpcsPort
   * @returns {this}
   */
  withHaProxyGrpcsPort (haProxyGrpcsPort) {
    this.haProxyGrpcsPort = haProxyGrpcsPort
    return this
  }

  /**
   * @param {string} haProxyAppSelector
   * @returns {this}
   */
  withHaProxyAppSelector (haProxyAppSelector) {
    this.haProxyAppSelector = haProxyAppSelector
    return this
  }

  /**
   * @param {string} haProxyPodName
   * @returns {this}
   */
  withHaProxyPodName (haProxyPodName) {
    this.haProxyPodName = haProxyPodName
    return this
  }

  /**
   * @param {string} nodePodName
   * @returns {this}
   */
  withNodePodName (nodePodName) {
    this.nodePodName = nodePodName
    return this
  }

  /**
   * @param {string} nodeServiceName
   * @returns {this}
   */
  withNodeServiceName (nodeServiceName) {
    this.nodeServiceName = nodeServiceName
    return this
  }

  /**
   * @param {string} nodeServiceClusterIp
   * @returns {this}
   */
  withNodeServiceClusterIp (nodeServiceClusterIp) {
    this.nodeServiceClusterIp = nodeServiceClusterIp
    return this
  }

  /**
   * @param {string} nodeServiceLoadBalancerIp
   * @returns {this}
   */
  withNodeServiceLoadBalancerIp (nodeServiceLoadBalancerIp) {
    this.nodeServiceLoadBalancerIp = nodeServiceLoadBalancerIp
    return this
  }

  /**
   * @param {string|number} nodeServiceGossipPort
   * @returns {this}
   */
  withNodeServiceGossipPort (nodeServiceGossipPort) {
    this.nodeServiceGossipPort = nodeServiceGossipPort
    return this
  }

  /**
   * @param {string|number} nodeServiceGrpcPort
   * @returns {this}
   */
  withNodeServiceGrpcPort (nodeServiceGrpcPort) {
    this.nodeServiceGrpcPort = nodeServiceGrpcPort
    return this
  }

  /**
   * @param {string|number} nodeServiceGrpcsPort
   * @returns {this}
   */
  withNodeServiceGrpcsPort (nodeServiceGrpcsPort) {
    this.nodeServiceGrpcsPort = nodeServiceGrpcsPort
    return this
  }

  /**
   * @param {string} envoyProxyName
   * @returns {this}
   */
  withEnvoyProxyName (envoyProxyName) {
    this.envoyProxyName = envoyProxyName
    return this
  }

  /**
   * @param {string} envoyProxyClusterIp
   * @returns {this}
   */
  withEnvoyProxyClusterIp (envoyProxyClusterIp) {
    this.envoyProxyClusterIp = envoyProxyClusterIp
    return this
  }

  /**
   * @param {string} envoyProxyLoadBalancerIp
   * @returns {this}
   */
  withEnvoyProxyLoadBalancerIp (envoyProxyLoadBalancerIp) {
    this.envoyProxyLoadBalancerIp = envoyProxyLoadBalancerIp
    return this
  }

  /**
   * @param {string|number} envoyProxyGrpcWebPort
   * @returns {this}
   */
  withEnvoyProxyGrpcWebPort (envoyProxyGrpcWebPort) {
    this.envoyProxyGrpcWebPort = envoyProxyGrpcWebPort
    return this
  }

  /**
   * @returns {NetworkNodeServices}
   */
  build () {
    return new NetworkNodeServices(this)
  }

  /**
   * @returns {string}
   */
  key () {
    return this.nodeName
  }
}

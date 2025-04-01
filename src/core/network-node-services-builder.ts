// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterReference, type Context, type DeploymentName} from './config/remote/types.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {type NodeAlias} from '../types/aliases.js';
import {NetworkNodeServices} from './network-node-services.js';

export class NetworkNodeServicesBuilder {
  public namespace: NamespaceName;
  public clusterRef: ClusterReference;
  public context: Context;
  public deployment: DeploymentName;
  public nodeId: string | number;
  public haProxyName: string;
  public accountId: string;
  public haProxyClusterIp!: string;
  public envoyProxyGrpcWebPort!: number;
  public envoyProxyLoadBalancerIp: string;
  public haProxyLoadBalancerIp: string;
  public haProxyGrpcPort!: string | number;
  public haProxyGrpcsPort!: string | number;
  public haProxyAppSelector!: string;
  public haProxyPodName!: PodName;
  public nodeServiceName!: any;
  public nodeServiceClusterIp!: string;
  public nodeServiceGrpcsPort!: string | number;
  public envoyProxyClusterIp: string;
  public envoyProxyName!: string;
  public nodeServiceLoadBalancerIp!: string;
  public nodeServiceGossipPort!: string | number;
  public nodeServiceGrpcPort!: string | number;
  public externalAddress!: string;
  public nodePodName: PodName;

  public constructor(public readonly nodeAlias: NodeAlias) {}

  public withNamespace(namespace: NamespaceName) {
    this.namespace = namespace;
    return this;
  }

  public withClusterRef(clusterReference: ClusterReference) {
    this.clusterRef = clusterReference;
    return this;
  }

  public withContext(context: Context) {
    this.context = context;
    return this;
  }

  public withDeployment(deployment: DeploymentName) {
    this.deployment = deployment;
    return this;
  }

  public withNodeId(nodeId: string | number) {
    this.nodeId = nodeId;
    return this;
  }

  public withAccountId(accountId: string) {
    this.accountId = accountId;
    return this;
  }

  public withHaProxyName(haProxyName: string) {
    this.haProxyName = haProxyName;
    return this;
  }

  public withHaProxyClusterIp(haProxyClusterIp: string) {
    this.haProxyClusterIp = haProxyClusterIp;
    return this;
  }

  public withHaProxyLoadBalancerIp(haProxyLoadBalancerIp: string | undefined) {
    this.haProxyLoadBalancerIp = haProxyLoadBalancerIp;
    return this;
  }

  public withHaProxyGrpcPort(haProxyGrpcPort: string | number) {
    this.haProxyGrpcPort = haProxyGrpcPort;
    return this;
  }

  public withHaProxyGrpcsPort(haProxyGrpcsPort: string | number) {
    this.haProxyGrpcsPort = haProxyGrpcsPort;
    return this;
  }

  public withHaProxyAppSelector(haProxyAppSelector: string) {
    this.haProxyAppSelector = haProxyAppSelector;
    return this;
  }

  public withHaProxyPodName(haProxyPodName: PodName) {
    this.haProxyPodName = haProxyPodName;
    return this;
  }

  public withNodePodName(nodePodName: PodName) {
    this.nodePodName = nodePodName;
    return this;
  }

  public withNodeServiceName(nodeServiceName: string) {
    this.nodeServiceName = nodeServiceName;
    return this;
  }

  public withNodeServiceClusterIp(nodeServiceClusterIp: string) {
    this.nodeServiceClusterIp = nodeServiceClusterIp;
    return this;
  }

  public withNodeServiceLoadBalancerIp(nodeServiceLoadBalancerIp: string) {
    this.nodeServiceLoadBalancerIp = nodeServiceLoadBalancerIp;
    return this;
  }

  public withNodeServiceGossipPort(nodeServiceGossipPort: string | number) {
    this.nodeServiceGossipPort = nodeServiceGossipPort;
    return this;
  }

  public withNodeServiceGrpcPort(nodeServiceGrpcPort: string | number) {
    this.nodeServiceGrpcPort = nodeServiceGrpcPort;
    return this;
  }

  public withNodeServiceGrpcsPort(nodeServiceGrpcsPort: string | number) {
    this.nodeServiceGrpcsPort = nodeServiceGrpcsPort;
    return this;
  }

  public withEnvoyProxyName(envoyProxyName: string) {
    this.envoyProxyName = envoyProxyName;
    return this;
  }

  public withEnvoyProxyClusterIp(envoyProxyClusterIp: string | undefined) {
    this.envoyProxyClusterIp = envoyProxyClusterIp;
    return this;
  }

  public withEnvoyProxyLoadBalancerIp(envoyProxyLoadBalancerIp?: string) {
    this.envoyProxyLoadBalancerIp = envoyProxyLoadBalancerIp;
    return this;
  }

  public withEnvoyProxyGrpcWebPort(envoyProxyGrpcWebPort: number) {
    this.envoyProxyGrpcWebPort = envoyProxyGrpcWebPort;
    return this;
  }

  public withExternalAddress(externalAddress: string) {
    this.externalAddress = externalAddress;
    return this;
  }

  public build() {
    return new NetworkNodeServices(
      this.clusterRef,
      this.context,
      this.deployment,
      this.nodeAlias,
      this.namespace,
      this.nodeId,
      this.nodePodName,
      this.haProxyName,
      this.haProxyLoadBalancerIp,
      this.haProxyClusterIp,
      this.haProxyGrpcPort,
      this.haProxyGrpcsPort,
      this.accountId,
      this.haProxyAppSelector,
      this.haProxyPodName,
      this.nodeServiceName,
      this.nodeServiceClusterIp,
      this.nodeServiceLoadBalancerIp,
      this.nodeServiceGossipPort,
      this.nodeServiceGrpcPort,
      this.nodeServiceGrpcsPort,
      this.envoyProxyName,
      this.envoyProxyClusterIp,
      this.envoyProxyLoadBalancerIp,
      this.envoyProxyGrpcWebPort,
      this.externalAddress,
    );
  }

  public key() {
    return this.nodeAlias;
  }
}

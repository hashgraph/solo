/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {type NodeAlias} from '../types/aliases.js';
import {type PodName} from './kube/resources/pod/pod_name.js';
import {type NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {type ClusterRef, type Context, type DeploymentName} from './config/remote/types.js';

export class NetworkNodeServices {
  public readonly nodeAlias: NodeAlias;
  public readonly namespace: NamespaceName;
  public readonly nodeId: string | number;
  public readonly nodePodName?: PodName;
  public readonly haProxyName?: string;
  public readonly haProxyLoadBalancerIp?: string;
  public readonly haProxyClusterIp: string;
  public readonly haProxyGrpcPort: string | number;
  public readonly haProxyGrpcsPort: string | number;
  public readonly accountId?: string;
  public readonly haProxyAppSelector: string;
  public readonly haProxyPodName: PodName;
  public readonly nodeServiceName: string;
  public readonly nodeServiceClusterIp: string;
  public readonly nodeServiceLoadBalancerIp: string;
  public readonly nodeServiceGossipPort: string | number;
  public readonly nodeServiceGrpcPort: string | number;
  public readonly nodeServiceGrpcsPort: string | number;
  public readonly envoyProxyName: string;
  public readonly envoyProxyClusterIp?: string;
  public readonly envoyProxyLoadBalancerIp?: string;
  public readonly envoyProxyGrpcWebPort: number;

  constructor(builder: NetworkNodeServicesBuilder) {
    this.nodeAlias = builder.nodeAlias;
    this.namespace = builder.namespace;
    this.nodeId = builder.nodeId;
    this.nodePodName = builder.nodePodName;
    this.haProxyName = builder.haProxyName;
    this.haProxyLoadBalancerIp = builder.haProxyLoadBalancerIp;
    this.haProxyClusterIp = builder.haProxyClusterIp;
    this.haProxyGrpcPort = builder.haProxyGrpcPort;
    this.haProxyGrpcsPort = builder.haProxyGrpcsPort;
    this.accountId = builder.accountId;
    this.haProxyAppSelector = builder.haProxyAppSelector;
    this.haProxyPodName = builder.haProxyPodName;
    this.nodeServiceName = builder.nodeServiceName;
    this.nodeServiceClusterIp = builder.nodeServiceClusterIp;
    this.nodeServiceLoadBalancerIp = builder.nodeServiceLoadBalancerIp;
    this.nodeServiceGossipPort = builder.nodeServiceGossipPort;
    this.nodeServiceGrpcPort = builder.nodeServiceGrpcPort;
    this.nodeServiceGrpcsPort = builder.nodeServiceGrpcsPort;
    this.envoyProxyName = builder.envoyProxyName;
    this.envoyProxyClusterIp = builder.envoyProxyClusterIp;
    this.envoyProxyLoadBalancerIp = builder.envoyProxyLoadBalancerIp;
    this.envoyProxyGrpcWebPort = builder.envoyProxyGrpcWebPort;
  }

  key() {
    return this.nodeAlias;
  }
}

export class NetworkNodeServicesBuilder {
  public namespace?: NamespaceName;
  public clusterRef?: ClusterRef;
  public context?: Context;
  public deployment?: DeploymentName;
  public nodeId?: string | number;
  public haProxyName?: string;
  public accountId?: string;
  public haProxyClusterIp!: string;
  public envoyProxyGrpcWebPort!: number;
  public envoyProxyLoadBalancerIp?: string;
  public haProxyLoadBalancerIp?: string;
  public haProxyGrpcPort!: string | number;
  public haProxyGrpcsPort!: string | number;
  public haProxyAppSelector!: string;
  public haProxyPodName!: PodName;
  public nodeServiceName!: any;
  public nodeServiceClusterIp!: string;
  public nodeServiceGrpcsPort!: string | number;
  public envoyProxyClusterIp?: string;
  public envoyProxyName!: string;
  public nodeServiceLoadBalancerIp!: string;
  public nodeServiceGossipPort!: string | number;
  public nodeServiceGrpcPort!: string | number;

  public nodePodName?: PodName;

  constructor(public readonly nodeAlias: NodeAlias) {}

  withNamespace(namespace: NamespaceName) {
    this.namespace = namespace;
    return this;
  }

  withClusterRef(clusterRef: ClusterRef) {
    this.clusterRef = clusterRef;
    return this;
  }

  withContext(context: Context) {
    this.context = context;
    return this;
  }

  withDeployment(deployment: DeploymentName) {
    this.deployment = deployment;
    return this;
  }

  withNodeId(nodeId: string | number) {
    this.nodeId = nodeId;
    return this;
  }

  withAccountId(accountId: string) {
    this.accountId = accountId;
    return this;
  }

  withHaProxyName(haProxyName: string) {
    this.haProxyName = haProxyName;
    return this;
  }

  withHaProxyClusterIp(haProxyClusterIp: string) {
    this.haProxyClusterIp = haProxyClusterIp;
    return this;
  }

  withHaProxyLoadBalancerIp(haProxyLoadBalancerIp: string | undefined) {
    this.haProxyLoadBalancerIp = haProxyLoadBalancerIp;
    return this;
  }

  withHaProxyGrpcPort(haProxyGrpcPort: string | number) {
    this.haProxyGrpcPort = haProxyGrpcPort;
    return this;
  }

  withHaProxyGrpcsPort(haProxyGrpcsPort: string | number) {
    this.haProxyGrpcsPort = haProxyGrpcsPort;
    return this;
  }

  withHaProxyAppSelector(haProxyAppSelector: string) {
    this.haProxyAppSelector = haProxyAppSelector;
    return this;
  }

  withHaProxyPodName(haProxyPodName: PodName) {
    this.haProxyPodName = haProxyPodName;
    return this;
  }

  withNodePodName(nodePodName: PodName) {
    this.nodePodName = nodePodName;
    return this;
  }

  withNodeServiceName(nodeServiceName: string) {
    this.nodeServiceName = nodeServiceName;
    return this;
  }

  withNodeServiceClusterIp(nodeServiceClusterIp: string) {
    this.nodeServiceClusterIp = nodeServiceClusterIp;
    return this;
  }

  withNodeServiceLoadBalancerIp(nodeServiceLoadBalancerIp: string) {
    this.nodeServiceLoadBalancerIp = nodeServiceLoadBalancerIp;
    return this;
  }

  withNodeServiceGossipPort(nodeServiceGossipPort: string | number) {
    this.nodeServiceGossipPort = nodeServiceGossipPort;
    return this;
  }

  withNodeServiceGrpcPort(nodeServiceGrpcPort: string | number) {
    this.nodeServiceGrpcPort = nodeServiceGrpcPort;
    return this;
  }

  withNodeServiceGrpcsPort(nodeServiceGrpcsPort: string | number) {
    this.nodeServiceGrpcsPort = nodeServiceGrpcsPort;
    return this;
  }

  withEnvoyProxyName(envoyProxyName: string) {
    this.envoyProxyName = envoyProxyName;
    return this;
  }

  withEnvoyProxyClusterIp(envoyProxyClusterIp: string | undefined) {
    this.envoyProxyClusterIp = envoyProxyClusterIp;
    return this;
  }

  withEnvoyProxyLoadBalancerIp(envoyProxyLoadBalancerIp?: string) {
    this.envoyProxyLoadBalancerIp = envoyProxyLoadBalancerIp;
    return this;
  }

  withEnvoyProxyGrpcWebPort(envoyProxyGrpcWebPort: number) {
    this.envoyProxyGrpcWebPort = envoyProxyGrpcWebPort;
    return this;
  }

  build() {
    return new NetworkNodeServices(this);
  }

  key() {
    return this.nodeAlias;
  }
}

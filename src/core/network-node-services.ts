// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../types/aliases.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterRef, type Context, type DeploymentName} from './config/remote/types.js';
import {type NetworkNodeServicesBuilder} from './network-node-services-builder.js';

export class NetworkNodeServices {
  public readonly clusterRef?: ClusterRef;
  public readonly context?: Context;
  public readonly deployment?: DeploymentName;
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
  public readonly externalAddress: string;

  public constructor(public builder: NetworkNodeServicesBuilder) {
    this.clusterRef = builder.clusterRef;
    this.context = builder.context;
    this.deployment = builder.deployment;
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
    this.externalAddress = builder.externalAddress;
  }

  public key() {
    return this.nodeAlias;
  }
}

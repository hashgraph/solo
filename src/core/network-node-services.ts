// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../types/aliases.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterRef, type Context, type DeploymentName} from './config/remote/types.js';

export class NetworkNodeServices {
  public constructor(
    public readonly clusterRef: ClusterRef,
    public readonly context: Context,
    public readonly deployment: DeploymentName,
    public readonly nodeAlias: NodeAlias,
    public readonly namespace: NamespaceName,
    public readonly nodeId: string | number,
    public readonly nodePodName: PodName,
    public readonly haProxyName: string,
    public readonly haProxyLoadBalancerIp: string,
    public readonly haProxyClusterIp: string,
    public readonly haProxyGrpcPort: string | number,
    public readonly haProxyGrpcsPort: string | number,
    public readonly accountId: string,
    public readonly haProxyAppSelector: string,
    public readonly haProxyPodName: PodName,
    public readonly nodeServiceName: string,
    public readonly nodeServiceClusterIp: string,
    public readonly nodeServiceLoadBalancerIp: string,
    public readonly nodeServiceGossipPort: string | number,
    public readonly nodeServiceGrpcPort: string | number,
    public readonly nodeServiceGrpcsPort: string | number,
    public readonly envoyProxyName: string,
    public readonly envoyProxyClusterIp: string,
    public readonly envoyProxyLoadBalancerIp: string,
    public readonly envoyProxyGrpcWebPort: number,
    public readonly externalAddress: string,
  ) {}

  public key() {
    return this.nodeAlias;
  }
}

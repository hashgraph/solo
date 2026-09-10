// SPDX-License-Identifier: Apache-2.0

import {ipV4ToBase64, isIpV4Address} from '../../core/helpers.js';
import {type ConsensusNode} from '../../core/model/consensus-node.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type K8} from '../../integration/kube/k8.js';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {type Service} from '../../integration/kube/resources/service/service.js';
import {type LoadBalancerIngress} from '../../integration/kube/resources/load-balancer-ingress.js';
import {Templates} from '../../core/templates.js';

export class Address {
  public constructor(
    public readonly port: number,
    private readonly fqdnOrIpAddress?: string,
    public readonly ipAddressV4?: string,
    public readonly domainName?: string,
    public readonly ipAddressV4Base64?: string,
  ) {
    this.port = port;
    this.fqdnOrIpAddress = fqdnOrIpAddress;
    if (this.fqdnOrIpAddress) {
      if (isIpV4Address(fqdnOrIpAddress)) {
        this.ipAddressV4 = fqdnOrIpAddress;
        this.ipAddressV4Base64 = ipV4ToBase64(fqdnOrIpAddress);
        return;
      } else {
        this.domainName = fqdnOrIpAddress;
        return;
      }
    }

    if (this.domainName) {
      this.domainName = domainName;
      return;
    }

    this.ipAddressV4 = ipAddressV4;
    this.ipAddressV4Base64 = ipAddressV4Base64;

    if (this.ipAddressV4 && !this.ipAddressV4Base64) {
      this.ipAddressV4Base64 = ipV4ToBase64(this.ipAddressV4);
    }

    if (this.ipAddressV4Base64 && !this.ipAddressV4) {
      // TODO: implement base64 to IPv4 conversion if needed
      throw new Error('ipAddressV4 must be provided if ipAddressV4Base64 is set');
    }

    if (!this.ipAddressV4 && !this.ipAddressV4Base64) {
      throw new Error('Either domainName or ipAddressV4 must be provided');
    }
  }

  public formattedAddress(): string {
    if (this.domainName) {
      return `${this.domainName}:${this.port}`;
    } else if (this.ipAddressV4) {
      return `${this.ipAddressV4}:${this.port}`;
    } else {
      throw new Error('Address is not properly initialized');
    }
  }

  public hostString(): string {
    if (this.domainName) {
      return this.domainName;
    } else if (this.ipAddressV4) {
      return this.ipAddressV4;
    } else {
      throw new Error('Address is not properly initialized');
    }
  }

  public static async getExternalAddress(
    consensusNode: ConsensusNode,
    k8: K8,
    port: number,
    gossipFqdnRestricted: boolean = true,
  ): Promise<Address> {
    return Address.resolveLoadBalancerAddress(consensusNode, k8, port, gossipFqdnRestricted);
  }

  public static async getLoadBalancerAddress(
    consensusNode: ConsensusNode,
    k8: K8,
    port: number,
  ): Promise<Address | undefined> {
    const serviceList: Service[] = await Address.listNodeServices(consensusNode, k8);

    if (!serviceList || serviceList.length === 0) {
      return undefined;
    }

    const svc: Service = serviceList[0];

    if (!svc.metadata.name.startsWith('network-node')) {
      throw new SoloErrors.validation.serviceTypeMismatch(svc.metadata.name);
    }

    return Address.loadBalancerAddressFromService(svc, port);
  }

  private static async listNodeServices(consensusNode: ConsensusNode, k8: K8): Promise<Service[]> {
    const namespace: NamespaceName = NamespaceName.of(consensusNode.namespace);
    let serviceList: Service[] = await k8
      .services()
      .list(namespace, Templates.renderNodeSvcLabelsFromNodeId(consensusNode.nodeId));

    if (!serviceList || serviceList.length === 0) {
      serviceList = await k8
        .services()
        .list(namespace, [`solo.hedera.com/node-name=${consensusNode.name},solo.hedera.com/type=network-node-svc`]);
    }

    return serviceList;
  }

  private static loadBalancerAddressFromService(svc: Service, port: number): Address | undefined {
    if (
      svc.spec!.type !== 'LoadBalancer' ||
      !svc.status?.loadBalancer?.ingress ||
      svc.status.loadBalancer.ingress.length === 0
    ) {
      return undefined;
    }

    for (let index: number = 0; index < svc.status.loadBalancer.ingress.length; index++) {
      const ingress: LoadBalancerIngress = svc.status.loadBalancer.ingress[index];
      if (ingress.hostname) {
        return new Address(port, ingress.hostname);
      } else if (ingress.ip) {
        return new Address(port, ingress.ip);
      }
    }

    return undefined;
  }

  private static async resolveLoadBalancerAddress(
    consensusNode: ConsensusNode,
    k8: K8,
    port: number,
    gossipFqdnRestricted: boolean,
  ): Promise<Address> {
    try {
      const serviceList: Service[] = await Address.listNodeServices(consensusNode, k8);

      if (serviceList && serviceList.length > 0) {
        const svc: Service = serviceList[0];

        if (!svc.metadata.name.startsWith('network-node')) {
          throw new SoloErrors.validation.serviceTypeMismatch(svc.metadata.name);
        }

        const loadBalancerAddress: Address | undefined = Address.loadBalancerAddressFromService(svc, port);
        if (loadBalancerAddress) {
          return loadBalancerAddress;
        }

        // If gossip FQDN is allowed by node config, keep using the service FQDN fallback.
        if (!gossipFqdnRestricted) {
          return new Address(port, consensusNode.fullyQualifiedDomainName);
        }

        // When gossip FQDN is restricted and no LoadBalancer IP is available
        // (e.g., Kind/NodePort), use cluster IP to avoid CN validation failure.
        if (svc.spec?.clusterIP && svc.spec.clusterIP !== 'None') {
          return new Address(port, svc.spec.clusterIP);
        }
      }
    } catch {
      // Ignore and use FQDN
    }

    return new Address(port, consensusNode.fullyQualifiedDomainName);
  }
}

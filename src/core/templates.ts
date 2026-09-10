// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import * as x509 from '@peculiar/x509';
import * as constants from './constants.js';
import {type AccountId} from '@hiero-ledger/sdk';
import {type IP, type NodeAlias, type NodeAliases, type NodeId} from '../types/aliases.js';
import {PodName} from '../integration/kube/resources/pod/pod-name.js';
import {GrpcProxyTlsEnums} from './enumerations.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {
  type ClusterReferenceName,
  type ComponentId,
  type EndpointPortMapping,
  type NamespaceNameAsString,
  type NodeAliasToAddressMapping,
  type PriorityMapping,
} from './../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {HEDERA_PLATFORM_VERSION} from '../../version.js';
import {OperatingSystem} from '../business/utils/operating-system.js';

export class Templates {
  public static renderNetworkPodName(nodeAlias: NodeAlias): PodName {
    return PodName.of(`network-${nodeAlias}-0`);
  }

  public static renderNetworkSvcName(nodeAlias: NodeAlias): string {
    return `network-${nodeAlias}-svc`;
  }

  public static renderNetworkHeadlessSvcName(nodeAlias: NodeAlias): string {
    return `network-${nodeAlias}`;
  }

  public static renderNodeAliasFromNumber(number_: number): NodeAlias {
    return `node${number_}`;
  }

  public static renderPostgresPodName(number_: number): PodName {
    return PodName.of(`solo-shared-resources-postgres-${number_}`);
  }

  public static renderNodeAliasesFromCount(count: number, existingNodesCount: number): NodeAliases {
    const nodeAliases: NodeAliases = [];
    let nodeNumber: number = existingNodesCount + 1;

    for (let index: number = 1; index <= count; index++) {
      nodeAliases.push(Templates.renderNodeAliasFromNumber(nodeNumber));
      nodeNumber++;
    }

    return nodeAliases;
  }

  public static renderMirrorNodeDatabaseInitScriptUrl(release: string): string {
    return `https://raw.githubusercontent.com/hiero-ledger/hiero-mirror-node/refs/tags/${release}/importer/src/main/resources/db/scripts/init.sh`;
  }

  public static renderMirrorNodeIngressControllerUrl(mirrorNamespace: NamespaceNameAsString): string {
    return `http://${constants.MIRROR_INGRESS_CONTROLLER}-${mirrorNamespace}.${mirrorNamespace}.svc.cluster.local`;
  }

  public static renderMirrorNodeRestServiceUrl(
    mirrorNodeReleaseName: string,
    mirrorNamespace: NamespaceNameAsString,
  ): string {
    return Templates.renderMirrorNodeServiceUrl(mirrorNodeReleaseName, mirrorNamespace, 'rest');
  }

  public static renderMirrorNodeWeb3ServiceUrl(
    mirrorNodeReleaseName: string,
    mirrorNamespace: NamespaceNameAsString,
  ): string {
    return Templates.renderMirrorNodeServiceUrl(mirrorNodeReleaseName, mirrorNamespace, 'web3');
  }

  private static renderMirrorNodeServiceUrl(
    mirrorNodeReleaseName: string,
    mirrorNamespace: NamespaceNameAsString,
    serviceName: string,
  ): string {
    return `http://${mirrorNodeReleaseName}-${serviceName}.${mirrorNamespace}.svc.cluster.local`;
  }

  public static renderGossipPemPrivateKeyFile(nodeAlias: NodeAlias): string {
    return `${constants.SIGNING_KEY_PREFIX}-private-${nodeAlias}.pem`;
  }

  public static renderGossipPemPublicKeyFile(nodeAlias: NodeAlias): string {
    return `${constants.SIGNING_KEY_PREFIX}-public-${nodeAlias}.pem`;
  }

  public static renderTLSPemPrivateKeyFile(nodeAlias: NodeAlias): string {
    return `hedera-${nodeAlias}.key`;
  }

  public static renderTLSPemPublicKeyFile(nodeAlias: NodeAlias): string {
    return `hedera-${nodeAlias}.crt`;
  }

  public static renderNodeAdminKeyName(nodeAlias: NodeAlias): string {
    return `${nodeAlias}-admin`;
  }

  public static renderNodeFriendlyName(prefix: string, nodeAlias: NodeAlias, suffix: string = ''): string {
    const parts: string[] = [prefix, nodeAlias];
    if (suffix) {
      parts.push(suffix);
    }
    return parts.join('-');
  }

  public static extractNodeAliasFromPodName(podName: PodName): NodeAlias {
    const parts: string[] = podName.name.split('-');
    if (parts.length !== 3) {
      throw new SoloErrors.internal.dataValidation(`pod name is malformed : ${podName.name}`, 3, parts.length);
    }
    return parts[1].trim() as NodeAlias;
  }

  public static prepareReleasePrefix(tag: string): string {
    if (!tag) {
      throw new SoloErrors.validation.missingArgument('tag cannot be empty');
    }

    const parsed: string[] = tag.split('.');
    if (parsed.length < 3) {
      throw new Error(`tag (${tag}) must include major, minor and patch fields (e.g. v0.40.4)`);
    }
    return `${parsed[0]}.${parsed[1]}`;
  }

  /**
   * renders the name to be used to store the new account key as a Kubernetes secret
   * @param accountId
   * @returns the name of the Kubernetes secret to store the account key
   */
  public static renderAccountKeySecretName(accountId: AccountId | string): string {
    return `account-key-${accountId.toString()}`;
  }

  /**
   * renders the label selector to be used to fetch the new account key from the Kubernetes secret
   * @param accountId
   * @returns the label selector of the Kubernetes secret to retrieve the account key   */
  public static renderAccountKeySecretLabelSelector(accountId: AccountId | string): string {
    return `solo.hedera.com/account-id=${accountId.toString()}`;
  }

  /**
   * renders the label object to be used to store the new account key in the Kubernetes secret
   * @param accountId
   * @returns the label object to be used to store the new account key in the Kubernetes secret
   */
  public static renderAccountKeySecretLabelObject(accountId: AccountId | string): {
    'solo.hedera.com/account-id': string;
  } {
    return {
      'solo.hedera.com/account-id': accountId.toString(),
    };
  }

  public static renderDistinguishedName(
    nodeAlias: NodeAlias,
    state: string = 'TX',
    locality: string = 'Richardson',
    org: string = 'Hedera',
    orgUnit: string = 'Hedera',
    country: string = 'US',
  ): x509.Name {
    return new x509.Name(`CN=${nodeAlias},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`);
  }

  public static renderStagingDir(cacheDirectory: string, releaseTagOverride: string): string {
    let releaseTag: string = releaseTagOverride;
    if (!cacheDirectory) {
      throw new SoloErrors.validation.illegalArgument('cacheDirectory cannot be empty');
    }

    if (!releaseTag) {
      releaseTag = HEDERA_PLATFORM_VERSION;
    }

    const releasePrefix: string = this.prepareReleasePrefix(releaseTag);
    if (!releasePrefix) {
      throw new SoloErrors.validation.illegalArgument('releasePrefix cannot be empty');
    }

    return PathEx.resolve(PathEx.join(cacheDirectory, releasePrefix, 'staging', releaseTag));
  }

  public static localInstallationExecutableForDependency(
    dependency: string,
    installationDirectory: string = PathEx.join(constants.SOLO_HOME_DIR, 'bin'),
  ): string {
    switch (dependency) {
      case constants.HELM:
      case constants.KIND:
      case constants.PODMAN:
      case constants.VFKIT:
      case constants.GVPROXY:
      case constants.NETAVARK:
      case constants.AARDVARK_DNS:
      case constants.CRANE:
      case constants.KUBECTL: {
        if (OperatingSystem.isWin32()) {
          return PathEx.join(installationDirectory, `${dependency}.exe`);
        }

        return PathEx.join(installationDirectory, dependency);
      }

      default: {
        throw new SoloErrors.validation.unknownTemplateDependency(dependency);
      }
    }
  }

  public static renderFullyQualifiedNetworkPodName(namespace: NamespaceName, nodeAlias: NodeAlias): string {
    return `${Templates.renderNetworkPodName(nodeAlias)}.${Templates.renderNetworkHeadlessSvcName(nodeAlias)}.${namespace.name}.svc.cluster.local`;
  }

  public static renderFullyQualifiedNetworkSvcName(namespace: NamespaceName, nodeAlias: NodeAlias): string {
    return `${Templates.renderNetworkSvcName(nodeAlias)}.${namespace.name}.svc.cluster.local`;
  }

  public static nodeIdFromNodeAlias(nodeAlias: NodeAlias): NodeId {
    for (let index: number = nodeAlias.length - 1; index > 0; index--) {
      if (Number.isNaN(Number.parseInt(nodeAlias[index]))) {
        return Number.parseInt(nodeAlias.slice(index + 1)) - 1;
      }
    }

    throw new SoloErrors.validation.unknownNodeAlias(nodeAlias);
  }

  public static renderComponentIdFromNodeId(nodeId: NodeId): ComponentId {
    return nodeId + 1;
  }

  public static renderComponentIdFromNodeAlias(nodeAlias: NodeAlias): ComponentId {
    return this.nodeIdFromNodeAlias(nodeAlias) + 1;
  }

  public static renderNodeIdFromComponentId(componentId: ComponentId): NodeId {
    return componentId - 1;
  }

  public static renderGossipKeySecretName(nodeAlias: NodeAlias): string {
    return `network-${nodeAlias}-keys-secrets`;
  }

  public static renderGossipKeySecretLabelObject(nodeAlias: NodeAlias): {'solo.hedera.com/node-name': string} {
    return {'solo.hedera.com/node-name': nodeAlias};
  }

  /**
   * Creates the secret name based on the node alias type
   *
   * @param nodeAlias - node alias
   * @param type - whether is for gRPC or gRPC Web ( Haproxy or Envoy )
   *
   * @returns the appropriate secret name
   */
  public static renderGrpcTlsCertificatesSecretName(nodeAlias: NodeAlias, type: GrpcProxyTlsEnums): string {
    switch (type) {
      //? HAProxy Proxy
      case GrpcProxyTlsEnums.GRPC: {
        return `haproxy-proxy-secret-${nodeAlias}`;
      }

      //? Envoy Proxy
      case GrpcProxyTlsEnums.GRPC_WEB: {
        return `envoy-proxy-secret-${nodeAlias}`;
      }
    }
  }

  /**
   * Creates the secret labels based on the node alias type
   *
   * @param nodeAlias - node alias
   * @param type - whether is for gRPC or gRPC Web ( Haproxy or Envoy )
   *
   * @returns the appropriate secret labels
   */
  public static renderGrpcTlsCertificatesSecretLabelObject(
    nodeAlias: NodeAlias,
    type: GrpcProxyTlsEnums,
  ): Record<string, string> {
    switch (type) {
      //? HAProxy Proxy
      case GrpcProxyTlsEnums.GRPC: {
        return {'haproxy-proxy-secret': nodeAlias};
      }

      //? Envoy Proxy
      case GrpcProxyTlsEnums.GRPC_WEB: {
        return {'envoy-proxy-secret': nodeAlias};
      }
    }
  }

  public static parseNodeAliasToIpMapping(unparsed: string): Record<NodeAlias, IP> {
    const mapping: Record<NodeAlias, IP> = {};

    for (const data of unparsed.split(',')) {
      const [nodeAlias, ip] = data.split('=') as [NodeAlias, IP];
      mapping[nodeAlias] = ip;
    }

    return mapping;
  }

  /**
   * Parses a comma-separated string into a mapping of node aliases → address/port.
   *
   * Accepted input formats:
   * 1) Explicit alias → address[:port]
   *    Each entry provides the node alias and the target address, optionally with a port.
   *    Example: "node1=127.0.0.1:8080,node2=127.0.0.1:8081"
   *
   * 2) Explicit alias → address (no port)
   *    Same as above, but if the port is omitted it defaults to 8080.
   *    Example: "node1=localhost,node2=localhost:8081"
   *
   * 3) Address[:port] only (no aliases)
   *    Aliases are inferred from the `nodes` array by index order.
   *    If the port is omitted, it defaults to 8080.
   *    Example: "localhost,127.0.0.2:8081"
   *
   * @param unparsed - Input string describing alias/address[:port] mappings.
   * @param nodes - Used to infer aliases when not explicitly provided.
   * @returns Record keyed by NodeAlias with resolved address and port.
   *
   * @throws SoloError if an alias cannot be inferred.
   */
  public static parseNodeAliasToAddressAndPortMapping(
    unparsed: string,
    nodes: ConsensusNode[],
  ): NodeAliasToAddressMapping {
    const mapping: NodeAliasToAddressMapping = {};

    if (!unparsed || typeof unparsed !== 'string') {
      return mapping;
    }

    for (const [index, data] of unparsed.split(',').entries()) {
      const [nodeAlias, addressData] = data.includes('=')
        ? (data.split('=') as [NodeAlias, IP])
        : [nodes[index]?.name, data];

      if (!nodeAlias) {
        throw new SoloErrors.validation.nodeAliasInferenceFailed(addressData);
      }

      const [address, port] = addressData.includes(':') ? addressData.split(':') : [addressData, '8080'];

      mapping[nodeAlias] = {address, port: +port};
    }

    return mapping;
  }

  /**
   * Parses a port override used when building the consensus node endpoints written to the genesis network.
   *
   * Supported forms:
   *
   * 1) A single port applied to every consensus node
   *    Example: "50211"
   *
   * 2) Explicit alias → port pairs, with multiple nodes comma separated
   *    Example: "node1=50211,node2=50212"
   *
   * The two forms can be combined, in which case the alias-less port acts as the default for the nodes that were not
   * listed explicitly. Example: "50211,node2=50212"
   *
   * @param unparsed - input string describing the port override, may be undefined when the flag was not supplied
   * @returns the default port and the per node alias overrides
   * @throws SoloError if an alias cannot be parsed or a port is not an integer between 1 and 65535
   */
  public static parseNodeAliasToPortMapping(unparsed?: string): EndpointPortMapping {
    const mapping: EndpointPortMapping = {nodeAliasToPort: {}};

    if (!unparsed || typeof unparsed !== 'string') {
      return mapping;
    }

    for (const data of unparsed.split(',')) {
      if (data.includes('=')) {
        const [nodeAlias, port] = data.split('=') as [NodeAlias, string];

        if (!nodeAlias) {
          throw new SoloErrors.validation.nodeAliasParseFailed(data);
        }

        mapping.nodeAliasToPort[nodeAlias] = Templates.parsePort(port);
      } else {
        mapping.defaultPort = Templates.parsePort(data);
      }
    }

    return mapping;
  }

  /**
   * Resolves the port to use for a consensus node endpoint, preferring the per node override, then the port that the
   * user supplied for every node, and finally the built in default.
   *
   * @param portMapping - the parsed port override, undefined when the flag was not supplied
   * @param nodeAlias - the consensus node the endpoint is built for
   * @param defaultPort - the port to use when the user did not override it
   */
  public static resolveEndpointPort(
    portMapping: EndpointPortMapping | undefined,
    nodeAlias: NodeAlias,
    defaultPort: number,
  ): number {
    return portMapping?.nodeAliasToPort?.[nodeAlias] ?? portMapping?.defaultPort ?? defaultPort;
  }

  private static parsePort(unparsed: string): number {
    const port: number = Number(unparsed.trim());

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new SoloErrors.validation.invalidPortNumber(unparsed);
    }

    return port;
  }

  public static parseNodeAliasToDomainNameMapping(unparsed: string): Record<NodeAlias, string> {
    const mapping: Record<NodeAlias, string> = {};

    for (const data of unparsed.split(',')) {
      const [nodeAlias, domainName] = data.split('=') as [NodeAlias, string];

      if (!nodeAlias || typeof nodeAlias !== 'string') {
        throw new SoloErrors.validation.nodeAliasParseFailed(data);
      }
      if (!domainName || typeof domainName !== 'string') {
        throw new SoloErrors.validation.domainNameParseFailed(data);
      }

      mapping[nodeAlias] = domainName;
    }

    return mapping;
  }

  /**
   * Renders the fully qualified domain name for a consensus node. We support the following variables for templating
   * in the dnsConsensusNodePattern: {nodeAlias}, {nodeId}, {namespace}, {cluster}
   *
   * The end result will be `${dnsConsensusNodePattern}.${dnsBaseDomain}`.
   * For example, if the dnsConsensusNodePattern is `network-{nodeAlias}-svc.{namespace}.svc` and the dnsBaseDomain is `cluster.local`,
   * the fully qualified domain name will be `network-{nodeAlias}-svc.{namespace}.svc.cluster.local`.
   * @param nodeAlias - the alias of the consensus node
   * @param nodeId - the id of the consensus node
   * @param namespace - the namespace of the consensus node
   * @param cluster - the cluster of the consensus node
   * @param dnsBaseDomain - the base domain of the cluster
   * @param dnsConsensusNodePattern - the pattern to use for the consensus node
   */
  public static renderConsensusNodeFullyQualifiedDomainName(
    nodeAlias: string,
    nodeId: number,
    namespace: NamespaceNameAsString,
    cluster: ClusterReferenceName,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): string {
    const searchReplace: Record<string, string> = {
      '{nodeAlias}': nodeAlias,
      '{nodeId}': nodeId.toString(),
      '{namespace}': namespace,
      '{cluster}': cluster,
    };

    for (const [search, replace] of Object.entries(searchReplace)) {
      dnsConsensusNodePattern = dnsConsensusNodePattern.replace(search, replace);
    }

    return `${dnsConsensusNodePattern}.${dnsBaseDomain}`;
  }

  /**
   * @param serviceName - name of the service
   * @param namespace - the pattern to use for the consensus node
   * @param dnsBaseDomain - the base domain of the cluster
   */
  public static renderSvcFullyQualifiedDomainName(
    serviceName: string,
    namespace: NamespaceNameAsString,
    dnsBaseDomain: string,
  ): string {
    return `${serviceName}.${namespace}.svc.${dnsBaseDomain}`;
  }

  // Component Label Selectors

  public static renderRelayLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    return legacyReleaseName
      ? [`app.kubernetes.io/instance=${legacyReleaseName}`, 'app.kubernetes.io/name=relay']
      : [`app.kubernetes.io/instance=${constants.JSON_RPC_RELAY_RELEASE_NAME}-${id}`, 'app.kubernetes.io/name=relay'];
  }

  public static renderHaProxyLabels(id: ComponentId): string[] {
    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(id);
    return [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'];
  }

  public static renderMirrorNodeLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    const releaseName: string = legacyReleaseName ?? Templates.renderMirrorNodeName(id);

    return [
      'app.kubernetes.io/name=importer',
      'app.kubernetes.io/component=importer',
      `app.kubernetes.io/instance=${releaseName}`,
    ];
  }

  public static renderMirrorIngressControllerLabels(): string[] {
    return [constants.SOLO_INGRESS_CONTROLLER_NAME_LABEL];
  }

  public static renderEnvoyProxyLabels(id: ComponentId): string[] {
    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(id);
    return [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=envoy-proxy'];
  }

  public static renderExplorerLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    const releaseName: string = legacyReleaseName ?? `${constants.EXPLORER_RELEASE_NAME}-${id}`;

    return [`app.kubernetes.io/instance=${releaseName}`];
  }

  public static renderConsensusNodeLabels(id: ComponentId): string[] {
    return [`app=network-${Templates.renderNodeAliasFromNumber(id)}`];
  }

  public static renderBlockNodeLabels(id: ComponentId, legacyReleaseName?: string): string[] {
    const releaseName: string = legacyReleaseName ?? Templates.renderBlockNodeName(id);

    return [`app.kubernetes.io/instance=${releaseName}`];
  }

  public static renderExplorerName(id: ComponentId): string {
    return `${constants.EXPLORER_RELEASE_NAME}-${id}`;
  }

  public static renderRelayName(id: ComponentId): string {
    return `${constants.JSON_RPC_RELAY_RELEASE_NAME}-${id}`;
  }

  public static renderBlockNodeName(id: ComponentId): string {
    return `${constants.BLOCK_NODE_RELEASE_NAME}-${id}`;
  }

  public static renderMirrorNodeName(id: ComponentId): string {
    return `${constants.MIRROR_NODE_RELEASE_NAME}-${id}`;
  }

  public static renderConfigMapRemoteConfigLabels(): string[] {
    return ['solo.hedera.com/type=remote-config'];
  }

  public static renderNodeLabelsFromNodeAlias(nodeAlias: NodeAlias): string[] {
    return [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'];
  }

  public static renderNodeSvcLabelsFromNodeId(nodeId: NodeId): string[] {
    return [`solo.hedera.com/node-id=${nodeId},solo.hedera.com/type=network-node-svc`];
  }

  /**
   * Build label selectors for deployment refresh by component type.
   */
  public static renderComponentLabelSelectors(componentType: string, id: ComponentId): string[] {
    switch (componentType) {
      case 'ConsensusNode': {
        return Templates.renderHaProxyLabels(id);
      }
      case 'HaProxy': {
        return Templates.renderHaProxyLabels(id);
      }
      case 'BlockNode': {
        return Templates.renderBlockNodeLabels(id);
      }
      case 'MirrorNode': {
        return Templates.renderMirrorIngressControllerLabels();
      }
      case 'RelayNode': {
        return Templates.renderRelayLabels(id);
      }
      case 'Explorer': {
        return Templates.renderExplorerLabels(id);
      }
      default: {
        return [];
      }
    }
  }

  public static parseExternalBlockAddress(raw: string): [string, number] {
    const [address, port] = raw.includes(':') ? raw.split(':') : [raw, constants.BLOCK_NODE_PORT];
    return [address, +port];
  }

  public static parseBlockNodePriorityMapping(rawString: string, nodes: ConsensusNode[]): Record<NodeAlias, number> {
    const mapping: Record<NodeAlias, number> = {};

    const isDefault: boolean = !rawString || rawString.split(',').length === 0;

    const nodeAliasesToPriorityMapping: string[] = isDefault
      ? nodes.map((node): NodeAlias => node.name)
      : rawString.split(',');

    for (const data of nodeAliasesToPriorityMapping) {
      // eslint-disable-next-line prefer-const
      let [nodeAlias, priority] = data.split('=') as [NodeAlias, number | undefined];

      mapping[nodeAlias] = +priority || 1;
    }

    return mapping;
  }

  /**
   * @param rawString - the raw string from the unparsed [flags.blockNodeMapping, flags.externalBlockNodeMapping]
   * @param fallbackBlockNodeIds - either block node IDs or external block node IDs
   */
  public static parseConsensusNodePriorityMapping(
    rawString: string,
    fallbackBlockNodeIds: ComponentId[],
  ): PriorityMapping[] {
    // if no nodes are specified use one and set highest priority to first block node
    const useDefault: boolean = typeof rawString !== 'string' || rawString.length === 0;

    if (useDefault) {
      const mapping: PriorityMapping[] = [];

      for (const [index, blockNodeId] of fallbackBlockNodeIds.entries()) {
        // set higher priority to first node
        mapping.push([blockNodeId, index === 0 ? 2 : 1]);
      }

      return mapping;
    }

    // Figure out if any priority is explicitly specified
    const hasPriority: boolean = rawString.includes('=');

    const mapping: PriorityMapping[] = [];

    for (const [index, data] of rawString.split(',').entries()) {
      // use specified priority if set
      if (data.includes('=')) {
        const [blockNodeId, priority] = data.split('=');
        mapping.push([+blockNodeId, +priority]);
      }

      // if any node has priority specified, default all unset to 1
      else if (hasPriority) {
        mapping.push([+data, 1]);
      }

      // if no explicit priority is specified, set higher priority to first node
      else {
        mapping.push([+data, index === 0 ? 2 : 1]);
      }
    }

    return mapping;
  }
}

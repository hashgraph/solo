// SPDX-License-Identifier: Apache-2.0

import crypto from 'node:crypto';
import fs, {type Stats} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {format} from 'node:util';
import {SoloErrors} from './errors/solo-errors.js';
import {Templates} from './templates.js';
import {SubprocessEnvironment} from './subprocess-environment.js';
import {SubprocessCommandProfile} from './subprocess-command-profile.js';
import * as constants from './constants.js';
import {PathEx} from '../business/utils/path-ex.js';
import {PrivateKey, ServiceEndpoint, type Long} from '@hiero-ledger/sdk';
import {type AnyYargs, type AnyListrContext, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type CommandFlag} from '../types/flag-types.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type Duration} from './time/duration.js';
import {type NodeAddConfigClass} from '../commands/node/config-interfaces/node-add-config-class.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {type Optional} from '../types/index.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import chalk from 'chalk';
import {type ConfigManager} from './config-manager.js';
import {Flags as flags} from '../commands/flags.js';
import {type Realm, type Shard} from './../types/index.js';
import {execFileSync} from 'node:child_process';
import yaml from 'yaml';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../integration/kube/k8.js';
import {BlockNodesJsonWrapper} from './block-nodes-json-wrapper.js';
import {K8Helper} from '../business/utils/k8-helper.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import * as versions from '../../version.js';
import {type ResolveGossipFqdnRestrictedOptions} from './resolve-gossip-fqdn-restricted-options.js';

type AddLoadContext = AnyListrContext & {
  config: NodeAddConfigClass;
  signingCertDer: Uint8Array;
  gossipEndpoints: ServiceEndpoint[];
  grpcServiceEndpoints: ServiceEndpoint[];
  adminKey: PrivateKey;
  tlsCertHash: unknown;
  upgradeZipHash: unknown;
  newNode: unknown;
};

type AddLoadContextData = {
  signingCertDer: string;
  gossipEndpoints: string[];
  grpcServiceEndpoints: string[];
  adminKey: string;
  newNode: {name: NodeAlias};
  existingNodeAliases: NodeAliases;
  tlsCertHash: unknown;
  upgradeZipHash: unknown;
};

export class Helpers {
  public static readonly KIND_CONTEXT_PREFIX: string = 'kind-';

  public static getBlockStreamModeForConsensusVersion(
    consensusNodeVersion: SemanticVersion<string> | string | undefined,
    blockNodeIntegrationEnabled: boolean,
    tssEnabled: boolean = true,
  ): string {
    const version: SemanticVersion<string> = new SemanticVersion<string>(
      consensusNodeVersion?.toString() || versions.HEDERA_PLATFORM_VERSION,
    );

    if (version.greaterThanOrEqual(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS)) {
      if (!blockNodeIntegrationEnabled || !tssEnabled) {
        return 'RECORDS';
      }

      // CN >= v0.74.0 defaults to BLOCKS (pure block-node streaming, no MinIO record streams).
      // Keep BLOCK_STREAM_STREAM_MODE as a legacy override for explicit compatibility testing.
      return constants.getEnvironmentVariable('BLOCK_STREAM_STREAM_MODE') ?? 'BLOCKS';
    }

    return constants.BLOCK_STREAM_STREAM_MODE;
  }

  public static resolveBlockStreamModeForConsensusVersion(
    existingStreamMode: string | undefined,
    consensusNodeVersion?: SemanticVersion<string> | string,
    blockNodeIntegrationEnabled: boolean = false,
    streamWrappedRecordBlocksEnabled: boolean = false,
    tssEnabled: boolean = true,
  ): string {
    const version: SemanticVersion<string> = new SemanticVersion<string>(
      consensusNodeVersion?.toString() || versions.HEDERA_PLATFORM_VERSION,
    );

    if (blockNodeIntegrationEnabled && tssEnabled) {
      // Preserve the current stream mode only when it is already the correct mode for the
      // consensus version. CN 0.74+ with block nodes must use pure block streaming by default.
      if (
        existingStreamMode === 'BLOCKS' ||
        (existingStreamMode === 'BOTH' &&
          (version.lessThan(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS) || streamWrappedRecordBlocksEnabled))
      ) {
        return existingStreamMode;
      }
    } else if (existingStreamMode === 'BOTH' || existingStreamMode === 'RECORDS') {
      // Without block nodes we must keep using record streams/MinIO. Preserve BOTH for
      // upgraded pre-0.74 networks and preserve RECORDS for existing record-only networks.
      return existingStreamMode;
    }

    return Helpers.getBlockStreamModeForConsensusVersion(consensusNodeVersion, blockNodeIntegrationEnabled, tssEnabled);
  }

  public static parseBlockStreamMode(applicationPropertiesText: string): string | undefined {
    const match: RegExpMatchArray | null = applicationPropertiesText.match(
      /^\s*blockStream\.streamMode\s*=\s*(\S+)\s*$/m,
    );
    return match?.[1];
  }

  public static parseStreamWrappedRecordBlocks(applicationPropertiesText: string): boolean {
    const match: RegExpMatchArray | null = applicationPropertiesText.match(
      /^\s*blockStream\.streamWrappedRecordBlocks\s*=\s*(\S+)\s*$/m,
    );
    return match?.[1] === 'true';
  }

  public static updateBlockStreamPropertiesForMode(
    lines: string[],
    streamMode: string,
    writerMode: string = constants.BLOCK_STREAM_WRITER_MODE,
  ): void {
    Helpers.upsertApplicationProperty(lines, 'blockStream.streamMode', streamMode);
    Helpers.upsertApplicationProperty(lines, 'blockStream.writerMode', writerMode);

    if (streamMode === 'BLOCKS') {
      Helpers.upsertApplicationProperty(lines, 'blockStream.streamWrappedRecordBlocks', 'false');
    }
  }

  public static upsertApplicationProperty(lines: string[], key: string, value: string): void {
    const propertyPrefix: string = `${key}=`;
    let propertyUpdated: boolean = false;

    for (let index: number = 0; index < lines.length; index++) {
      if (!lines[index].startsWith(propertyPrefix)) {
        continue;
      }

      if (propertyUpdated) {
        lines.splice(index, 1);
        index--;
      } else {
        lines[index] = `${key}=${value}`;
        propertyUpdated = true;
      }
    }

    if (!propertyUpdated) {
      lines.push(`${key}=${value}`);
    }
  }

  public static ensureWrappedRecordBlocksDisabled(lines: string[], streamMode: string): void {
    if (streamMode === 'BOTH') {
      Helpers.upsertApplicationProperty(lines, 'blockStream.streamWrappedRecordBlocks', 'false');
    }
  }

  public static sleep(duration: Duration): Promise<void> {
    return new Promise<void>((resolve: (value: PromiseLike<void> | void) => void): void => {
      setTimeout(resolve, duration.toMillis());
    });
  }

  public static parseNodeAliases(
    input: string,
    consensusNodes?: ConsensusNode[],
    configManager?: ConfigManager,
  ): NodeAliases {
    let nodeAliases: NodeAlias[] = splitFlagInput(input, ',') as NodeAliases;
    if (nodeAliases.length === 0) {
      nodeAliases = consensusNodes?.map((node: {name: string}): NodeAlias => {
        return node.name as NodeAlias;
      });
      configManager?.setFlag(flags.nodeAliasesUnparsed, nodeAliases.join(','));

      if (!nodeAliases || nodeAliases.length === 0) {
        return [];
      }
    }
    return nodeAliases;
  }

  public static splitFlagInput(input: string, separator: string = ','): string[] {
    if (!input) {
      return [];
    } else if (typeof input !== 'string') {
      throw new SoloErrors.validation.invalidCommaSeparatedString(input);
    }

    return input
      .split(separator)
      .map((s): string => s.trim())
      .filter(Boolean);
  }

  public static parseGossipFqdnRestricted(applicationPropertiesText: string): boolean | undefined {
    const match: RegExpMatchArray | null = applicationPropertiesText.match(
      /^\s*nodes\.gossipFqdnRestricted\s*=\s*(true|false)\s*$/m,
    );
    if (match?.[1]) {
      return match[1].toLowerCase() === 'true';
    }
    return undefined;
  }

  public static parseNumericApplicationProperty(
    applicationPropertiesText: string,
    propertyKey: string,
  ): number | undefined {
    const escapedPropertyKey: string = propertyKey.replaceAll('.', String.raw`\.`);
    const match: RegExpMatchArray | null = applicationPropertiesText.match(
      new RegExp(String.raw`^\s*${escapedPropertyKey}\s*=\s*(\d+)\s*$`, 'm'),
    );
    return match ? Number(match[1]) : undefined;
  }

  public static readGossipFqdnRestrictedFromFile(filePath: string): boolean | undefined {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const applicationPropertiesContent: string = fs.readFileSync(filePath, 'utf8');
    return parseGossipFqdnRestricted(applicationPropertiesContent);
  }

  public static async resolveGossipFqdnRestricted(options: ResolveGossipFqdnRestrictedOptions): Promise<boolean> {
    const {k8, namespace, stagingDir, cacheDir, resourcesDir, applicationPropertiesPath} = options;

    // 1. K8s configMap
    if (k8 && namespace) {
      try {
        const configMap: ConfigMap = await k8
          .configMaps()
          .read(namespace, constants.NETWORK_NODE_SHARED_DATA_CONFIG_MAP_NAME);
        const configMapProperties: string | undefined = configMap.data?.[constants.APPLICATION_PROPERTIES];
        if (configMapProperties) {
          const parsed: boolean | undefined = parseGossipFqdnRestricted(configMapProperties);
          if (parsed !== undefined) {
            return parsed;
          }
        }
      } catch {
        // Ignore errors and continue to next source.
      }
    }

    // 2. Explicit application.properties path.
    if (applicationPropertiesPath) {
      const parsedFromApplicationPropertiesPath: boolean | undefined =
        readGossipFqdnRestrictedFromFile(applicationPropertiesPath);
      if (parsedFromApplicationPropertiesPath !== undefined) {
        return parsedFromApplicationPropertiesPath;
      }
    }

    // 3. Staged application.properties
    if (stagingDir) {
      const stagedPath: string = PathEx.join(stagingDir, 'templates', constants.APPLICATION_PROPERTIES);
      const parsedFromStaging: boolean | undefined = readGossipFqdnRestrictedFromFile(stagedPath);
      if (parsedFromStaging !== undefined) {
        return parsedFromStaging;
      }
    }

    // 4. Cache template
    if (cacheDir) {
      const cachePath: string = PathEx.join(cacheDir, 'templates', constants.APPLICATION_PROPERTIES);
      const parsedFromCache: boolean | undefined = readGossipFqdnRestrictedFromFile(cachePath);
      if (parsedFromCache !== undefined) {
        return parsedFromCache;
      }
    }

    // 5. Repo template
    if (resourcesDir) {
      const repoPath: string = PathEx.join(resourcesDir, 'templates', constants.APPLICATION_PROPERTIES);
      const parsedFromRepo: boolean | undefined = readGossipFqdnRestrictedFromFile(repoPath);
      if (parsedFromRepo !== undefined) {
        return parsedFromRepo;
      }
    }

    return true;
  }

  /**
   * @param arr - The array to be cloned
   * @returns a new array with the same elements as the input array
   */
  public static cloneArray<T>(array: T[]): T[] {
    return structuredClone(array);
  }

  public static getTemporaryDirectory(): string {
    return fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-'));
  }

  public static createBackupDirectory(
    destinationDirectory: string,
    prefix: string = 'backup',
    currentDate: Date = new Date(),
  ): string {
    const dateDirectory: string = format(
      '%s%s%s_%s%s%s',
      currentDate.getFullYear(),
      currentDate.getMonth().toString().padStart(2, '0'),
      currentDate.getDate().toString().padStart(2, '0'),
      currentDate.getHours().toString().padStart(2, '0'),
      currentDate.getMinutes().toString().padStart(2, '0'),
      currentDate.getSeconds().toString().padStart(2, '0'),
    );

    const backupDirectory: string = PathEx.join(destinationDirectory, prefix, dateDirectory);
    if (!fs.existsSync(backupDirectory)) {
      fs.mkdirSync(backupDirectory, {recursive: true});
    }

    return backupDirectory;
  }

  public static makeBackup(fileMap: Map<string, string> = new Map<string, string>(), removeOld: boolean = true): void {
    for (const entry of fileMap) {
      const sourcePath: string = entry[0];
      const destinationPath: string = entry[1];
      if (fs.existsSync(sourcePath)) {
        fs.cpSync(sourcePath, destinationPath);
        if (removeOld) {
          fs.rmSync(sourcePath);
        }
      }
    }
  }

  public static backupOldTlsKeys(
    nodeAliases: NodeAliases,
    keysDirectory: string,
    currentDate: Date = new Date(),
    directoryPrefix: string = 'tls',
  ): string {
    const backupDirectory: string = createBackupDirectory(keysDirectory, `unused-${directoryPrefix}`, currentDate);

    const fileMap: Map<string, string> = new Map<string, string>();
    for (const nodeAlias of nodeAliases) {
      const sourcePath: string = PathEx.join(keysDirectory, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
      const destinationPath: string = PathEx.join(backupDirectory, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
      fileMap.set(sourcePath, destinationPath);
    }

    makeBackup(fileMap, true);

    return backupDirectory;
  }

  public static backupOldPemKeys(
    nodeAliases: NodeAliases,
    keysDirectory: string,
    currentDate: Date = new Date(),
    directoryPrefix: string = 'gossip-pem',
  ): string {
    const backupDirectory: string = createBackupDirectory(keysDirectory, `unused-${directoryPrefix}`, currentDate);

    const fileMap: Map<string, string> = new Map<string, string>();
    for (const nodeAlias of nodeAliases) {
      const sourcePath: string = PathEx.join(keysDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
      const destinationPath: string = PathEx.join(backupDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
      fileMap.set(sourcePath, destinationPath);
    }

    makeBackup(fileMap, true);

    return backupDirectory;
  }

  public static getEnvironmentValue(environmentVariableArray: string[], name: string): string {
    const kvPair: string = environmentVariableArray.find((v): boolean => v.startsWith(`${name}=`));
    return kvPair ? kvPair.split('=', 2)[1] : undefined;
  }

  public static parseIpAddressToUint8Array(ipAddress: string): Uint8Array<ArrayBuffer> {
    const parts: string[] = ipAddress.split('.');
    const uint8Array: Uint8Array<ArrayBuffer> = new Uint8Array(4);

    for (let index: number = 0; index < 4; index++) {
      uint8Array[index] = Number.parseInt(parts[index], 10);
    }

    return uint8Array;
  }

  /** If the basename of the src did not match expected basename, rename it first, then copy to destination */
  public static renameAndCopyFile(
    sourceFilePath: string,
    expectedBaseName: string,
    destinationDirectory: string,
  ): void {
    const sourceDirectory: string = path.dirname(sourceFilePath);
    if (path.basename(sourceFilePath) !== expectedBaseName) {
      fs.renameSync(sourceFilePath, PathEx.join(sourceDirectory, expectedBaseName));
    }
    // copy public key and private key to key directory
    fs.copyFile(
      PathEx.joinWithRealPath(sourceDirectory, expectedBaseName),
      PathEx.join(destinationDirectory, expectedBaseName),
      (error): void => {
        if (error) {
          throw new SoloErrors.system.fileCopyFailed(error);
        }
      },
    );
  }

  /**
   * Returns an object that can be written to a file without data loss.
   * Contains fields needed for adding a new node through separate commands
   * @param ctx
   * @returns file writable object
   */
  public static addSaveContextParser(context_: AnyListrContext): Record<string, string> {
    const exportedContext: Record<string, string> = {} as Record<string, string>;

    const config: NodeAddConfigClass = context_.config as NodeAddConfigClass;
    const exportedFields: string[] = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

    exportedContext.signingCertDer = context_.signingCertDer.toString();
    exportedContext.gossipEndpoints = context_.gossipEndpoints.map(
      (endpoint: unknown): `${string}:${string}` =>
        `${(endpoint as ServiceEndpoint)._domainName}:${(endpoint as ServiceEndpoint)._port}`,
    );
    exportedContext.grpcServiceEndpoints = context_.grpcServiceEndpoints.map(
      (endpoint: unknown): `${string}:${string}` =>
        `${(endpoint as ServiceEndpoint)._domainName}:${(endpoint as ServiceEndpoint)._port}`,
    );
    exportedContext.adminKey = context_.adminKey.toString();
    // @ts-expect-error - existingNodeAliases may not be defined on config
    exportedContext.existingNodeAliases = config.existingNodeAliases;

    for (const property of exportedFields) {
      exportedContext[property] = context_[property];
    }
    return exportedContext;
  }

  /**
   * Initializes objects in the context from a provided string
   * Contains fields needed for adding a new node through separate commands
   * @param ctx - accumulator object
   * @param ctxData - data in string format
   * @returns file writable object
   */
  public static addLoadContextParser(context_: AddLoadContext, contextData: AddLoadContextData): void {
    const config: NodeAddConfigClass = context_.config;
    context_.signingCertDer = new Uint8Array(
      contextData.signingCertDer.split(',').map((value: string): number => Number.parseInt(value, 10)),
    );
    context_.gossipEndpoints = prepareEndpoints(
      context_.config.endpointType,
      contextData.gossipEndpoints,
      constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
    );
    context_.grpcServiceEndpoints = prepareEndpoints(
      context_.config.endpointType,
      contextData.grpcServiceEndpoints,
      constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
    );
    context_.adminKey = PrivateKey.fromStringED25519(contextData.adminKey);
    config.nodeAlias = contextData.newNode.name;
    config.existingNodeAliases = contextData.existingNodeAliases;
    config.allNodeAliases = [...config.existingNodeAliases, contextData.newNode.name];
    config.newNodeAliases = [contextData.newNode.name];

    const fieldsToImport: Array<'tlsCertHash' | 'upgradeZipHash' | 'newNode'> = [
      'tlsCertHash',
      'upgradeZipHash',
      'newNode',
    ];

    for (const property of fieldsToImport) {
      context_[property] = contextData[property];
    }
  }

  public static prepareEndpoints(
    endpointType: string,
    endpoints: string[],
    defaultPort: number | string,
  ): ServiceEndpoint[] {
    const returnValue: ServiceEndpoint[] = [];
    for (const endpoint of endpoints) {
      const parts: string[] = endpoint.split(':');

      let url: string = '';
      let port: number | string = defaultPort;

      if (parts.length === 2) {
        url = parts[0].trim();
        port = +parts[1].trim();
      } else if (parts.length === 1) {
        url = parts[0];
      } else {
        throw new SoloErrors.validation.invalidEndpointFormat(endpoint);
      }

      if (endpointType.toUpperCase() === constants.ENDPOINT_TYPE_IP) {
        returnValue.push(
          new ServiceEndpoint({
            port: +port,
            ipAddressV4: parseIpAddressToUint8Array(url),
          }),
        );
      } else {
        returnValue.push(
          new ServiceEndpoint({
            port: +port,
            domainName: url,
          }),
        );
      }
    }

    return returnValue;
  }

  /** Adds all the types of flags as properties on the provided argv object */
  public static addFlagsToArgv(
    argv: AnyYargs,
    flags: {
      required: CommandFlag[];
      optional: CommandFlag[];
    },
  ): AnyYargs {
    argv.required = flags.required;
    argv.optional = flags.optional;

    return argv;
  }

  public static resolveValidJsonFilePath(filePath: string, defaultPath?: string): string {
    if (!filePath) {
      if (defaultPath) {
        return resolveValidJsonFilePath(defaultPath);
      }

      return '';
    }

    const resolvedFilePath: string = PathEx.realPathSync(filePath);

    if (!fs.existsSync(resolvedFilePath)) {
      if (defaultPath) {
        return resolveValidJsonFilePath(defaultPath);
      }

      throw new SoloErrors.system.fileNotFound(filePath);
    }

    // If the file is empty (or size cannot be determined) then fallback on the default values
    const throttleInfo: Stats = fs.statSync(resolvedFilePath);
    if (throttleInfo.size === 0 && defaultPath) {
      return resolveValidJsonFilePath(defaultPath);
    } else if (throttleInfo.size === 0) {
      throw new SoloErrors.system.fileEmpty(filePath);
    }

    try {
      // Ensure the file contains valid JSON data
      JSON.parse(fs.readFileSync(resolvedFilePath, 'utf8'));
      return resolvedFilePath;
    } catch {
      // Fallback to the default values if an error occurs due to invalid JSON data or unable to read the file size
      if (defaultPath) {
        return resolveValidJsonFilePath(defaultPath);
      }

      throw new SoloErrors.system.fileInvalidJson(filePath);
    }
  }

  /**
   * @param nodeAlias
   * @param consensusNodes
   * @returns context of the node
   */
  public static extractContextFromConsensusNodes(
    nodeAlias: NodeAlias,
    consensusNodes: ConsensusNode[],
  ): Optional<string> {
    if (!consensusNodes) {
      return undefined;
    }
    if (consensusNodes.length === 0) {
      return undefined;
    }
    const consensusNode: ConsensusNode = consensusNodes.find((node): boolean => node.name === nodeAlias);
    return consensusNode ? consensusNode.context : undefined;
  }

  public static isKindContext(context: string | undefined): boolean {
    return !!context?.startsWith(Helpers.KIND_CONTEXT_PREFIX);
  }

  public static hasMultipleKubernetesContexts(consensusNodes: ConsensusNode[]): boolean {
    const contexts: Set<string> = new Set(consensusNodes.map((node: ConsensusNode): string => node.context));
    return contexts.size > 1;
  }

  public static requiresRsaBootstrap(consensusNodeVersion: string, streamMode: string): boolean {
    const version: SemanticVersion<string> = new SemanticVersion<string>(consensusNodeVersion);
    if (version.lessThan(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS)) {
      return false;
    }
    return streamMode === 'BLOCKS' || streamMode === 'BOTH';
  }

  public static buildRsaAddressBookJson(consensusNodes: ConsensusNode[], keysDirectory: string): Optional<string> {
    const nodeAddresses: Array<{RSAPubKey: string; nodeId: number}> = [];
    for (const consensusNode of consensusNodes) {
      const publicKeyFile: string = PathEx.join(
        keysDirectory,
        Templates.renderGossipPemPublicKeyFile(consensusNode.name),
      );
      if (!fs.existsSync(publicKeyFile)) {
        return undefined;
      }
      const certPem: string = fs.readFileSync(publicKeyFile, 'utf8');
      const spkiDer: Buffer = new crypto.X509Certificate(certPem).publicKey.export({
        format: 'der',
        type: 'spki',
      }) as Buffer;
      nodeAddresses.push({
        RSAPubKey: spkiDer.toString('hex'),
        nodeId: Templates.nodeIdFromNodeAlias(consensusNode.name),
      });
    }
    return JSON.stringify({
      addressBooks: [{addressBook: {nodeAddress: nodeAddresses}, startBlock: '0', endBlock: '-1'}],
    });
  }

  /**
   * Check if the namespace exists in the context of given consensus nodes
   * @param consensusNodes
   * @param k8Factory
   * @param namespace
   */
  public static async checkNamespace(
    consensusNodes: ConsensusNode[],
    k8Factory: K8Factory,
    namespace: NamespaceName,
  ): Promise<void> {
    for (const consensusNode of consensusNodes) {
      const k8: K8 = k8Factory.getK8(consensusNode.context);
      if (!(await k8.namespaces().has(namespace))) {
        throw new SoloErrors.system.namespaceNotFound(namespace.name);
      }
    }
  }

  /**
   * Show a banner with the chart name and version
   * @param logger
   * @param chartName The name of the chart
   * @param version The version of the chart
   * @param type The action that was performed such as 'Installed' or 'Upgraded'
   */
  // TODO convert usages to leverage the logger.addMessageGroupMessage()
  public static showVersionBanner(
    logger: SoloLogger,
    chartName: string,
    version: string,
    type: 'Installed' | 'Upgraded' = 'Installed',
  ): void {
    logger.showUser(chalk.cyan(` - ${type} ${chartName} chart, version:`, chalk.yellow(version)));
  }

  /**
   * Check if the input is a valid IPv4 address
   * @param input
   * @returns true if the input is a valid IPv4 address, false otherwise
   */
  public static isIpV4Address(input: string): boolean {
    const ipv4Regex: RegExp =
      /^(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)$/;
    return ipv4Regex.test(input);
  }

  /**
   * Convert an IPv4 address to a base64 string
   * @param ipv4 The IPv4 address to convert
   * @returns The base64 encoded string representation of the IPv4 address
   */
  public static ipV4ToBase64(ipv4: string): string {
    // Split the IPv4 address into its octets
    const octets: number[] = ipv4.split('.').map((octet): number => {
      const number_: number = Number.parseInt(octet, 10);
      // eslint-disable-next-line unicorn/prefer-number-properties
      if (isNaN(number_) || number_ < 0 || number_ > 255) {
        throw new Error(`Invalid IPv4 address: ${ipv4}`);
      }
      return number_;
    });

    if (octets.length !== 4) {
      throw new Error(`Invalid IPv4 address: ${ipv4}`);
    }

    // Convert the octets to a Uint8Array
    const uint8Array: Uint8Array<ArrayBuffer> = new Uint8Array(octets);

    // Base64 encode the byte array
    return btoa(String.fromCodePoint(...uint8Array));
  }

  public static entityId(shard: Shard, realm: Realm, number: Long | number | string): string {
    return `${shard}.${realm}.${number}`;
  }

  public static async withTimeout<T>(
    promise: Promise<T>,
    duration: Duration,
    errorMessage: string = 'Timeout',
  ): Promise<T> {
    return Promise.race([promise, Helpers.throwAfter(duration, errorMessage)]);
  }

  private static async throwAfter(duration: Duration, message: string = 'Timeout'): Promise<never> {
    await sleep(duration);
    throw new SoloErrors.system.timeout(message);
  }

  /**
   * Checks if a Docker image with the given name and tag exists locally.
   * @param imageName The name of the Docker image (e.g., "block-node-server").
   * @param imageTag The tag of the Docker image (e.g., "0.12.0").
   * @returns True if the image exists, false otherwise.
   */
  public static checkDockerImageExists(imageName: string, imageTag: string): boolean {
    const fullImageName: string = `${imageName}:${imageTag}`;
    try {
      const output: string = execFileSync('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], {
        shell: false,
        encoding: 'utf8',
        stdio: 'pipe',
        env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.CONTAINER_ENGINE),
      });
      return output
        .split(/\r?\n/)
        .map((line: string): string => line.trim())
        .includes(fullImageName);
    } catch (error) {
      // grep exits 1 when no lines match — image simply not found, not an error
      if (error?.status === 1) {
        return false;
      }
      if (!constants.SOLO_SILENT_MODE) {
        console.error(`Error checking Docker image ${fullImageName}:`, error.message);
      }
      return false;
    }
  }

  public static createDirectoryIfNotExists(file: string): void {
    const directory: string = path.dirname(file);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {recursive: true});
    }
  }

  /**
   * Best-effort extraction of the deployment names recorded in a remote-config ConfigMap.
   * Tolerates both the current (array) and legacy (map keyed by cluster name) cluster layouts.
   */
  public static extractRemoteConfigDeploymentNames(remoteConfig: ConfigMap): string[] {
    const deploymentNames: string[] = [];
    try {
      const remoteConfigData: unknown = yaml.parse(remoteConfig.data?.[constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]);
      let clustersData: unknown = undefined;
      if (typeof remoteConfigData === 'object' && remoteConfigData !== null && 'clusters' in remoteConfigData) {
        clustersData = (remoteConfigData as Record<string, unknown>).clusters;
      }
      const clustersArray: unknown[] = [];

      if (Array.isArray(clustersData)) {
        clustersArray.push(...clustersData);
      } else if (typeof clustersData === 'object' && clustersData !== null) {
        clustersArray.push(...Object.values(clustersData));
      }

      for (const clusterData of clustersArray) {
        if (typeof clusterData === 'object' && clusterData !== null && 'deployment' in clusterData) {
          const deployment: unknown = (clusterData as Record<string, unknown>).deployment;
          if (typeof deployment === 'string' && deployment.length > 0) {
            deploymentNames.push(deployment);
          }
        }
      }
    } catch {
      // best-effort: treat absent or unparseable remote-config data as containing no deployments
    }
    return deploymentNames;
  }

  public static remoteConfigsToDeploymentsTable(remoteConfigs: ConfigMap[]): string[] {
    const rows: string[] = [];
    if (remoteConfigs.length > 0) {
      rows.push('Namespace : deployment');
      for (const remoteConfig of remoteConfigs) {
        for (const deployment of Helpers.extractRemoteConfigDeploymentNames(remoteConfig)) {
          rows.push(`${remoteConfig.namespace.name} : ${deployment}`);
        }
      }
    }
    return rows;
  }

  /**
   * @param consensusNode - the targeted consensus node
   * @param logger
   * @param k8Factory
   */
  public static async createAndCopyBlockNodeJsonFileForConsensusNode(
    consensusNode: ConsensusNode,
    logger: SoloLogger,
    k8Factory: K8Factory,
    allowEmpty: boolean = false,
    consensusNodeVersion?: SemanticVersion<string> | string,
    tssEnabled: boolean = true,
  ): Promise<void> {
    const {
      nodeId,
      context,
      name: nodeAlias,
      blockNodeMap,
      externalBlockNodeMap,
      namespace: namespaceNameAsString,
    } = consensusNode;

    const namespace: NamespaceName = NamespaceName.of(namespaceNameAsString);

    const blockNodesJsonData: string = new BlockNodesJsonWrapper(blockNodeMap, externalBlockNodeMap).toJSON();

    const parsedBlockNodesJson: {nodes: unknown[]} = JSON.parse(blockNodesJsonData) as {nodes: unknown[]};
    if (!allowEmpty && parsedBlockNodesJson.nodes.length === 0) {
      throw new SoloErrors.system.blockNodesJsonEmpty(nodeAlias);
    }

    const blockNodesJsonFilename: string = `${constants.BLOCK_NODES_JSON_FILE.replace('.json', '')}-${nodeId}.json`;
    const blockNodesJsonPath: string = PathEx.join(constants.SOLO_CACHE_DIR, blockNodesJsonFilename);

    fs.writeFileSync(blockNodesJsonPath, JSON.stringify(parsedBlockNodesJson, undefined, 2));

    // Check if the file exists before copying
    if (!fs.existsSync(blockNodesJsonPath)) {
      logger.warn(`Block nodes JSON file not found: ${blockNodesJsonPath}`);
      return;
    }

    const k8: K8 = k8Factory.getK8(context);

    await k8
      .pods()
      .waitForReadyStatus(namespace, Templates.renderNodeLabelsFromNodeAlias(nodeAlias), 120, 1000, undefined, true);

    const container: Container = await new K8Helper(context).getConsensusNodeRootContainer(namespace, nodeAlias);

    await container.execContainer('pwd');

    const targetDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/config`;

    await container.execContainer(`mkdir -p ${targetDirectory}`);

    // Copy the file and rename it to block-nodes.json in the destination
    await container.copyTo(blockNodesJsonPath, targetDirectory);

    // If using node-specific files, rename the copied file to the standard name
    const sourceFilename: string = path.basename(blockNodesJsonPath);
    await container.execContainer(
      `mv ${targetDirectory}/${sourceFilename} ${targetDirectory}/${constants.BLOCK_NODES_JSON_FILE}`,
    );
    await container.execContainer([
      'bash',
      '-c',
      `chown hedera:hedera ${targetDirectory}/${constants.BLOCK_NODES_JSON_FILE} 2>/dev/null || true`,
    ]);

    const applicationPropertiesFilePath: string = `${constants.HEDERA_HAPI_PATH}/data/config/${constants.APPLICATION_PROPERTIES}`;

    const applicationPropertiesData: string = await container.execContainer(`cat ${applicationPropertiesFilePath}`);

    const lines: string[] = applicationPropertiesData.split('\n');

    const blockStreamMode: string = Helpers.resolveBlockStreamModeForConsensusVersion(
      Helpers.parseBlockStreamMode(applicationPropertiesData),
      consensusNodeVersion,
      true,
      Helpers.parseStreamWrappedRecordBlocks(applicationPropertiesData),
      tssEnabled,
    );
    Helpers.updateBlockStreamPropertiesForMode(lines, blockStreamMode);

    // streamMode=BOTH (used by performance tests) produces both native block-stream blocks
    // (BLOCK_HEADER) and Wrapped Record Blocks (ROUND_HEADER). The mirror importer rejects
    // ROUND_HEADER; its rapid retries trigger the block node's HTTP/2 rapid-reset protection,
    // cutting off block ingestion. Disable WRBs only when BOTH mode is active.
    Helpers.ensureWrappedRecordBlocksDisabled(lines, blockStreamMode);

    const updatedApplicationPropertiesData: string = lines.join('\n');
    if (updatedApplicationPropertiesData !== applicationPropertiesData) {
      await k8.configMaps().update(namespace, 'network-node-data-config-cm', {
        [constants.APPLICATION_PROPERTIES]: updatedApplicationPropertiesData,
      });
    }

    const configName: string = `network-${nodeAlias}-data-config-cm`;
    const configMapExists: boolean = await k8.configMaps().exists(namespace, configName);

    await (configMapExists
      ? k8.configMaps().update(namespace, configName, {'block-nodes.json': blockNodesJsonData})
      : k8.configMaps().create(namespace, configName, {}, {'block-nodes.json': blockNodesJsonData}));

    logger.debug(`Copied block-nodes configuration to consensus node ${consensusNode.name}`);

    const updatedApplicationPropertiesFilePath: string = PathEx.join(
      constants.SOLO_CACHE_DIR,
      constants.APPLICATION_PROPERTIES,
    );

    if (updatedApplicationPropertiesData !== applicationPropertiesData) {
      fs.writeFileSync(updatedApplicationPropertiesFilePath, updatedApplicationPropertiesData);
      await container.copyTo(updatedApplicationPropertiesFilePath, targetDirectory);
      await container.execContainer([
        'bash',
        '-c',
        `chown hedera:hedera ${targetDirectory}/${constants.APPLICATION_PROPERTIES} 2>/dev/null || true`,
      ]);
    }
  }
}

export const sleep: typeof Helpers.sleep = Helpers.sleep;
export const parseNodeAliases: typeof Helpers.parseNodeAliases = Helpers.parseNodeAliases;
export const splitFlagInput: typeof Helpers.splitFlagInput = Helpers.splitFlagInput;
export const parseGossipFqdnRestricted: typeof Helpers.parseGossipFqdnRestricted = Helpers.parseGossipFqdnRestricted;
export const readGossipFqdnRestrictedFromFile: typeof Helpers.readGossipFqdnRestrictedFromFile =
  Helpers.readGossipFqdnRestrictedFromFile;
export const resolveGossipFqdnRestricted: typeof Helpers.resolveGossipFqdnRestricted =
  Helpers.resolveGossipFqdnRestricted;
export const cloneArray: typeof Helpers.cloneArray = Helpers.cloneArray;
export const getTemporaryDirectory: typeof Helpers.getTemporaryDirectory = Helpers.getTemporaryDirectory;
export const createBackupDirectory: typeof Helpers.createBackupDirectory = Helpers.createBackupDirectory;
export const makeBackup: typeof Helpers.makeBackup = Helpers.makeBackup;
export const backupOldTlsKeys: typeof Helpers.backupOldTlsKeys = Helpers.backupOldTlsKeys;
export const backupOldPemKeys: typeof Helpers.backupOldPemKeys = Helpers.backupOldPemKeys;
export const getEnvironmentValue: typeof Helpers.getEnvironmentValue = Helpers.getEnvironmentValue;
export const parseIpAddressToUint8Array: typeof Helpers.parseIpAddressToUint8Array = Helpers.parseIpAddressToUint8Array;
export const renameAndCopyFile: typeof Helpers.renameAndCopyFile = Helpers.renameAndCopyFile;
export const addSaveContextParser: typeof Helpers.addSaveContextParser = Helpers.addSaveContextParser;
export const addLoadContextParser: typeof Helpers.addLoadContextParser = Helpers.addLoadContextParser;
export const prepareEndpoints: typeof Helpers.prepareEndpoints = Helpers.prepareEndpoints;
export const addFlagsToArgv: typeof Helpers.addFlagsToArgv = Helpers.addFlagsToArgv;
export const resolveValidJsonFilePath: typeof Helpers.resolveValidJsonFilePath = Helpers.resolveValidJsonFilePath;
export const extractContextFromConsensusNodes: typeof Helpers.extractContextFromConsensusNodes =
  Helpers.extractContextFromConsensusNodes;
export const checkNamespace: typeof Helpers.checkNamespace = Helpers.checkNamespace;
export const showVersionBanner: typeof Helpers.showVersionBanner = Helpers.showVersionBanner;
export const isIpV4Address: typeof Helpers.isIpV4Address = Helpers.isIpV4Address;
export const ipV4ToBase64: typeof Helpers.ipV4ToBase64 = Helpers.ipV4ToBase64;
export const entityId: typeof Helpers.entityId = Helpers.entityId;
export const withTimeout: typeof Helpers.withTimeout = Helpers.withTimeout;
export const checkDockerImageExists: typeof Helpers.checkDockerImageExists = Helpers.checkDockerImageExists;
export const createDirectoryIfNotExists: typeof Helpers.createDirectoryIfNotExists = Helpers.createDirectoryIfNotExists;
export const remoteConfigsToDeploymentsTable: typeof Helpers.remoteConfigsToDeploymentsTable =
  Helpers.remoteConfigsToDeploymentsTable;
export const createAndCopyBlockNodeJsonFileForConsensusNode: typeof Helpers.createAndCopyBlockNodeJsonFileForConsensusNode =
  Helpers.createAndCopyBlockNodeJsonFileForConsensusNode;

// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';
import {SoloError} from './errors/solo-error.js';
import * as semver from 'semver';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {PrivateKey, ServiceEndpoint, type Long} from '@hashgraph/sdk';
import {type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type CommandFlag} from '../types/flag-types.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type Duration} from './time/duration.js';
import {type NodeAddConfigClass} from '../commands/node/config-interfaces/node-add-config-class.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {type Optional} from '../types/index.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type K8} from '../integration/kube/k8.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import chalk from 'chalk';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConfigManager} from './config-manager.js';
import {Flags as flags} from '../commands/flags.js';
import {type Realm, type Shard} from './config/remote/types.js';
import {type Container} from '../integration/kube/resources/container/container.js';

export function getInternalAddress(
  releaseVersion: semver.SemVer | string,
  namespaceName: NamespaceName,
  nodeAlias: NodeAlias,
) {
  //? Explanation: for v0.59.x the internal IP address is set to 127.0.0.1 to avoid an ISS
  let internalIp = '';

  // for versions that satisfy 0.58.5+
  // @ts-expect-error TS2353: Object literal may only specify known properties
  if (semver.gte(releaseVersion, '0.58.5', {includePrerelease: true})) {
    internalIp = '127.0.0.1';
  }
  // versions less than 0.58.5
  else {
    internalIp = Templates.renderFullyQualifiedNetworkPodName(namespaceName, nodeAlias);
  }

  return internalIp;
}

export async function getExternalAddress(
  consensusNode: ConsensusNode,
  k8: K8,
  useLoadBalancer: boolean,
): Promise<string> {
  if (useLoadBalancer) {
    return resolveLoadBalancerAddress(consensusNode, k8);
  }

  return consensusNode.fullyQualifiedDomainName;
}

async function resolveLoadBalancerAddress(consensusNode: ConsensusNode, k8: K8): Promise<string> {
  const ns = NamespaceName.of(consensusNode.namespace);
  const serviceList = await k8
    .services()
    .list(ns, [`solo.hedera.com/node-id=${consensusNode.nodeId},solo.hedera.com/type=network-node-svc`]);

  if (serviceList && serviceList.length > 0) {
    const svc = serviceList[0];

    if (!svc.metadata.name.startsWith('network-node')) {
      throw new SoloError(`Service found is not a network node service: ${svc.metadata.name}`);
    }

    if (svc.status?.loadBalancer?.ingress && svc.status.loadBalancer.ingress.length > 0) {
      for (let index = 0; index < svc.status.loadBalancer.ingress.length; index++) {
        const ingress = svc.status.loadBalancer.ingress[index];
        if (ingress.hostname) {
          return ingress.hostname;
        } else if (ingress.ip) {
          return ingress.ip;
        }
      }
    }
  }

  return consensusNode.fullyQualifiedDomainName;
}

export function sleep(duration: Duration) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, duration.toMillis());
  });
}

export function parseNodeAliases(
  input: string,
  consensusNodes?: ConsensusNode[],
  configManager?: ConfigManager,
): NodeAliases {
  let nodeAliases: NodeAlias[] = splitFlagInput(input, ',') as NodeAliases;
  if (nodeAliases.length === 0) {
    nodeAliases = consensusNodes?.map((node: {name: string}) => {
      return node.name as NodeAlias;
    });
    configManager?.setFlag(flags.nodeAliasesUnparsed, nodeAliases.join(','));

    if (!nodeAliases || nodeAliases.length === 0) {
      return [];
    }
  }
  return nodeAliases;
}

export function splitFlagInput(input: string, separator = ',') {
  if (!input) {
    return [];
  } else if (typeof input !== 'string') {
    throw new SoloError(`input [input='${input}'] is not a comma separated string`);
  }

  return input
    .split(separator)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * @param arr - The array to be cloned
 * @returns a new array with the same elements as the input array
 */
export function cloneArray<T>(array: T[]): T[] {
  return structuredClone(array);
}

export function getTemporaryDirectory() {
  return fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-'));
}

export function createBackupDirectory(destinationDirectory: string, prefix = 'backup', currentDate = new Date()) {
  const dateDirectory = util.format(
    '%s%s%s_%s%s%s',
    currentDate.getFullYear(),
    currentDate.getMonth().toString().padStart(2, '0'),
    currentDate.getDate().toString().padStart(2, '0'),
    currentDate.getHours().toString().padStart(2, '0'),
    currentDate.getMinutes().toString().padStart(2, '0'),
    currentDate.getSeconds().toString().padStart(2, '0'),
  );

  const backupDirectory = PathEx.join(destinationDirectory, prefix, dateDirectory);
  if (!fs.existsSync(backupDirectory)) {
    fs.mkdirSync(backupDirectory, {recursive: true});
  }

  return backupDirectory;
}

export function makeBackup(fileMap = new Map<string, string>(), removeOld = true) {
  for (const entry of fileMap) {
    const sourcePath = entry[0];
    const destinationPath = entry[1];
    if (fs.existsSync(sourcePath)) {
      fs.cpSync(sourcePath, destinationPath);
      if (removeOld) {
        fs.rmSync(sourcePath);
      }
    }
  }
}

export function backupOldTlsKeys(
  nodeAliases: NodeAliases,
  keysDirectory: string,
  currentDate = new Date(),
  directoryPrefix = 'tls',
) {
  const backupDirectory = createBackupDirectory(keysDirectory, `unused-${directoryPrefix}`, currentDate);

  const fileMap = new Map<string, string>();
  for (const nodeAlias of nodeAliases) {
    const sourcePath = PathEx.join(keysDirectory, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
    const destinationPath = PathEx.join(backupDirectory, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
    fileMap.set(sourcePath, destinationPath);
  }

  makeBackup(fileMap, true);

  return backupDirectory;
}

export function backupOldPemKeys(
  nodeAliases: NodeAliases,
  keysDirectory: string,
  currentDate = new Date(),
  directoryPrefix = 'gossip-pem',
) {
  const backupDirectory = createBackupDirectory(keysDirectory, `unused-${directoryPrefix}`, currentDate);

  const fileMap = new Map<string, string>();
  for (const nodeAlias of nodeAliases) {
    const sourcePath = PathEx.join(keysDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    const destinationPath = PathEx.join(backupDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    fileMap.set(sourcePath, destinationPath);
  }

  makeBackup(fileMap, true);

  return backupDirectory;
}

export function isNumeric(string_: string) {
  if (typeof string_ !== 'string') {
    return false;
  } // we only process strings!
  return (
    !Number.isNaN(Number.parseInt(string_)) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !Number.isNaN(Number.parseFloat(string_))
  ); // ...and ensure strings of whitespace fail
}

export function getEnvironmentValue(environmentVariableArray: string[], name: string) {
  const kvPair = environmentVariableArray.find(v => v.startsWith(`${name}=`));
  return kvPair ? kvPair.split('=')[1] : null;
}

export function parseIpAddressToUint8Array(ipAddress: string) {
  const parts = ipAddress.split('.');
  const uint8Array = new Uint8Array(4);

  for (let index = 0; index < 4; index++) {
    uint8Array[index] = Number.parseInt(parts[index], 10);
  }

  return uint8Array;
}

/** If the basename of the src did not match expected basename, rename it first, then copy to destination */
export function renameAndCopyFile(
  sourceFilePath: string,
  expectedBaseName: string,
  destinationDirectory: string,
  logger: SoloLogger,
) {
  const sourceDirectory = path.dirname(sourceFilePath);
  if (path.basename(sourceFilePath) !== expectedBaseName) {
    fs.renameSync(sourceFilePath, PathEx.join(sourceDirectory, expectedBaseName));
  }
  // copy public key and private key to key directory
  fs.copyFile(
    PathEx.joinWithRealPath(sourceDirectory, expectedBaseName),
    PathEx.join(destinationDirectory, expectedBaseName),
    error => {
      if (error) {
        throw new SoloError(`Error copying file: ${error.message}`);
      }
    },
  );
}

/**
 * Add debug options to valuesArg used by helm chart
 * @param valuesArg the valuesArg to update
 * @param debugNodeAlias the node ID to attach the debugger to
 * @param index the index of extraEnv to add the debug options to
 * @returns updated valuesArg
 */
export function addDebugOptions(valuesArgument: string, debugNodeAlias: NodeAlias, index = 0) {
  if (debugNodeAlias) {
    const nodeId = Templates.nodeIdFromNodeAlias(debugNodeAlias);
    valuesArgument += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].name=JAVA_OPTS"`;
    valuesArgument += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].value=-agentlib:jdwp=transport=dt_socket\\,server=y\\,suspend=y\\,address=*:${constants.JVM_DEBUG_PORT}"`;
  }
  return valuesArgument;
}

/**
 * Returns an object that can be written to a file without data loss.
 * Contains fields needed for adding a new node through separate commands
 * @param ctx
 * @returns file writable object
 */
export function addSaveContextParser(context_: any) {
  const exportedContext = {} as Record<string, string>;

  const config = context_.config as NodeAddConfigClass;
  const exportedFields = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  exportedContext.signingCertDer = context_.signingCertDer.toString();
  exportedContext.gossipEndpoints = context_.gossipEndpoints.map((ep: any) => `${ep.getDomainName}:${ep.getPort}`);
  exportedContext.grpcServiceEndpoints = context_.grpcServiceEndpoints.map(
    (ep: any) => `${ep.getDomainName}:${ep.getPort}`,
  );
  exportedContext.adminKey = context_.adminKey.toString();
  // @ts-ignore
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
export function addLoadContextParser(context_: any, contextData: any) {
  const config: any = context_.config;
  context_.signingCertDer = new Uint8Array(contextData.signingCertDer.split(','));
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

  const fieldsToImport = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  for (const property of fieldsToImport) {
    context_[property] = contextData[property];
  }
}

export function prepareEndpoints(endpointType: string, endpoints: string[], defaultPort: number | string) {
  const returnValue: ServiceEndpoint[] = [];
  for (const endpoint of endpoints) {
    const parts = endpoint.split(':');

    let url = '';
    let port = defaultPort;

    if (parts.length === 2) {
      url = parts[0].trim();
      port = +parts[1].trim();
    } else if (parts.length === 1) {
      url = parts[0];
    } else {
      throw new SoloError(`incorrect endpoint format. expected url:port, found ${endpoint}`);
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
export function addFlagsToArgv(
  argv: any,
  flags: {
    required: CommandFlag[];
    optional: CommandFlag[];
  },
) {
  argv.required = flags.required;
  argv.optional = flags.optional;

  return argv;
}

export function resolveValidJsonFilePath(filePath: string, defaultPath?: string): string {
  if (!filePath) {
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath, null);
    }

    return '';
  }

  const resolvedFilePath = PathEx.realPathSync(filePath);

  if (!fs.existsSync(resolvedFilePath)) {
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath, null);
    }

    throw new SoloError(`File does not exist: ${filePath}`);
  }

  // If the file is empty (or size cannot be determined) then fallback on the default values
  const throttleInfo = fs.statSync(resolvedFilePath);
  if (throttleInfo.size === 0 && defaultPath) {
    return resolveValidJsonFilePath(defaultPath, null);
  } else if (throttleInfo.size === 0) {
    throw new SoloError(`File is empty: ${filePath}`);
  }

  try {
    // Ensure the file contains valid JSON data
    JSON.parse(fs.readFileSync(resolvedFilePath, 'utf8'));
    return resolvedFilePath;
  } catch {
    // Fallback to the default values if an error occurs due to invalid JSON data or unable to read the file size
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath, null);
    }

    throw new SoloError(`Invalid JSON data in file: ${filePath}`);
  }
}

export function prepareValuesFiles(valuesFile: string) {
  let valuesArgument = '';
  if (valuesFile) {
    const valuesFiles = valuesFile.split(',');
    for (const vf of valuesFiles) {
      const vfp = PathEx.resolve(vf);
      valuesArgument += ` --values ${vfp}`;
    }
  }

  return valuesArgument;
}

export function populateHelmArguments(valuesMapping: Record<string, string | boolean | number>): string {
  let valuesArgument = '';

  for (const [key, value] of Object.entries(valuesMapping)) {
    valuesArgument += ` --set ${key}=${value}`;
  }

  return valuesArgument;
}

/**
 * @param nodeAlias
 * @param consensusNodes
 * @returns context of the node
 */
export function extractContextFromConsensusNodes(
  nodeAlias: NodeAlias,
  consensusNodes?: ConsensusNode[],
): Optional<string> {
  if (!consensusNodes) {
    return undefined;
  }
  if (consensusNodes.length === 0) {
    return undefined;
  }
  const consensusNode = consensusNodes.find(node => node.name === nodeAlias);
  return consensusNode ? consensusNode.context : undefined;
}

/**
 * Check if the namespace exists in the context of given consensus nodes
 * @param consensusNodes
 * @param k8Factory
 * @param namespace
 */
export async function checkNamespace(consensusNodes: ConsensusNode[], k8Factory: K8Factory, namespace: NamespaceName) {
  for (const consensusNode of consensusNodes) {
    const k8 = k8Factory.getK8(consensusNode.context);
    if (!(await k8.namespaces().has(namespace))) {
      throw new SoloError(`namespace ${namespace} does not exist in context ${consensusNode.context}`);
    }
  }
}

/**
 * Print a message and pad both sides with asterisks to make it stand out
 * @param message The message to print
 * @param totalWidth The total width of the padded message
 */
function printPaddedMessage(message: string, totalWidth: number): string {
  // If the message is longer than or equal to totalWidth, return it as is
  if (message.length >= totalWidth) {
    return message;
  }

  // Calculate the total padding needed (excluding the message length)
  const totalPadding = totalWidth - message.length;

  // Split the padding between left and right (favoring left if odd)
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;

  // Construct the padded string
  return '*'.repeat(leftPadding) + message + '*'.repeat(rightPadding);
}

/**
 * Show a banner with the chart name and version
 * @param logger
 * @param chartName The name of the chart
 * @param version The version of the chart
 * @param type The action that was performed such as 'Installed' or 'Upgraded'
 */
export function showVersionBanner(logger: SoloLogger, chartName: string, version: string, type: string = 'Installed') {
  logger.showUser(chalk.cyan(printPaddedMessage(` ${type} ${chartName} chart `, 80)));
  logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(version));
  logger.showUser(chalk.cyan(printPaddedMessage('', 80)));
}

/**
 * Check if the input is a valid IPv4 address
 * @param input
 * @returns true if the input is a valid IPv4 address, false otherwise
 */
export function isIPv4Address(input: string): boolean {
  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)$/;
  return ipv4Regex.test(input);
}

/**
 * Convert an IPv4 address to a base64 string
 * @param ipv4 The IPv4 address to convert
 * @returns The base64 encoded string representation of the IPv4 address
 */
export function ipv4ToBase64(ipv4: string): string {
  // Split the IPv4 address into its octets
  const octets: number[] = ipv4.split('.').map(octet => {
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

/** Get the Apple Silicon chip type */
export async function getProcessorType(container: Container): Promise<string> {
  try {
    return container.execContainer('uname -p');
  } catch {
    return 'unknown';
  }
}

export async function requiresJavaSveFix(container: Container) {
  const chipSet = await getProcessorType(container);
  return chipSet.includes('aarch') || chipSet.includes('arm');
}

export function entityId(shard: Shard, realm: Realm, number: Long | number | string): string {
  return `${shard}.${realm}.${number}`;
}

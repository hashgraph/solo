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
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import {SoloError} from './errors.js';
import * as semver from 'semver';
import {Templates} from './templates.js';
import {ROOT_DIR} from './constants.js';
import * as constants from './constants.js';
import {PrivateKey, ServiceEndpoint} from '@hashgraph/sdk';
import {type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type CommandFlag} from '../types/flag_types.js';
import {type SoloLogger} from './logging.js';
import {type Duration} from './time/duration.js';
import {type NodeAddConfigClass} from '../commands/node/configs.js';

export function sleep(duration: Duration) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, duration.toMillis());
  });
}

export function parseNodeAliases(input: string): NodeAliases {
  return splitFlagInput(input, ',') as NodeAliases;
}

export function splitFlagInput(input: string, separator = ',') {
  if (typeof input !== 'string') {
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
export function cloneArray<T>(arr: T[]): T[] {
  return JSON.parse(JSON.stringify(arr));
}

/** load package.json */
export function loadPackageJSON(): any {
  try {
    const raw = fs.readFileSync(path.join(ROOT_DIR, 'package.json'));
    return JSON.parse(raw.toString());
  } catch (e: Error | any) {
    throw new SoloError('failed to load package.json', e);
  }
}

export function packageVersion(): string {
  const packageJson = loadPackageJSON();
  return packageJson.version;
}

/**
 * Return the required root image for a platform version
 * @param releaseTag - platform version
 */
export function getRootImageRepository(releaseTag: string) {
  // @ts-ignore
  const releaseVersion = semver.parse(releaseTag, {includePrerelease: true}) as Semver;
  if (releaseVersion.minor < 46) {
    return 'hashgraph/solo-containers/ubi8-init-java17';
  }

  return 'hashgraph/solo-containers/ubi8-init-java21';
}

export function getTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'));
}

export function createBackupDir(destDir: string, prefix = 'backup', curDate = new Date()) {
  const dateDir = util.format(
    '%s%s%s_%s%s%s',
    curDate.getFullYear(),
    curDate.getMonth().toString().padStart(2, '0'),
    curDate.getDate().toString().padStart(2, '0'),
    curDate.getHours().toString().padStart(2, '0'),
    curDate.getMinutes().toString().padStart(2, '0'),
    curDate.getSeconds().toString().padStart(2, '0'),
  );

  const backupDir = path.join(destDir, prefix, dateDir);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, {recursive: true});
  }

  return backupDir;
}

export function makeBackup(fileMap = new Map<string, string>(), removeOld = true) {
  for (const entry of fileMap) {
    const srcPath = entry[0];
    const destPath = entry[1];
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath);
      if (removeOld) {
        fs.rmSync(srcPath);
      }
    }
  }
}

export function backupOldTlsKeys(nodeAliases: NodeAliases, keysDir: string, curDate = new Date(), dirPrefix = 'tls') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate);

  const fileMap = new Map<string, string>();
  for (const nodeAlias of nodeAliases) {
    const srcPath = path.join(keysDir, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
    const destPath = path.join(backupDir, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
    fileMap.set(srcPath, destPath);
  }

  makeBackup(fileMap, true);

  return backupDir;
}

export function backupOldPemKeys(
  nodeAliases: NodeAliases,
  keysDir: string,
  curDate = new Date(),
  dirPrefix = 'gossip-pem',
) {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate);

  const fileMap = new Map<string, string>();
  for (const nodeAlias of nodeAliases) {
    const srcPath = path.join(keysDir, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    const destPath = path.join(backupDir, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    fileMap.set(srcPath, destPath);
  }

  makeBackup(fileMap, true);

  return backupDir;
}

export function isNumeric(str: string) {
  if (typeof str !== 'string') return false; // we only process strings!
  return (
    !isNaN(str as any) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

/**
 * Validate a path provided by the user to prevent path traversal attacks
 * @param input - the input provided by the user
 * @returns a validated path
 */
export function validatePath(input: string) {
  if (input.indexOf('\0') !== -1) {
    throw new SoloError(`access denied for path: ${input}`);
  }
  return input;
}

/**
 * Create a map of node aliases to account IDs
 * @param nodeAliases
 * @returns the map of node IDs to account IDs
 */
export function getNodeAccountMap(nodeAliases: NodeAliases) {
  const accountMap = new Map<NodeAlias, string>();
  const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm;
  const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard;
  let accountId = constants.HEDERA_NODE_ACCOUNT_ID_START.num;

  nodeAliases.forEach(nodeAlias => {
    const nodeAccount = `${realm}.${shard}.${accountId}`;
    accountId = accountId.add(1);
    accountMap.set(nodeAlias, nodeAccount);
  });
  return accountMap;
}

export function getEnvValue(envVarArray: string[], name: string) {
  const kvPair = envVarArray.find(v => v.startsWith(`${name}=`));
  return kvPair ? kvPair.split('=')[1] : null;
}

export function parseIpAddressToUint8Array(ipAddress: string) {
  const parts = ipAddress.split('.');
  const uint8Array = new Uint8Array(4);

  for (let i = 0; i < 4; i++) {
    uint8Array[i] = parseInt(parts[i], 10);
  }

  return uint8Array;
}

/** If the basename of the src did not match expected basename, rename it first, then copy to destination */
export function renameAndCopyFile(srcFilePath: string, expectedBaseName: string, destDir: string, logger: SoloLogger) {
  const srcDir = path.dirname(srcFilePath);
  if (path.basename(srcFilePath) !== expectedBaseName) {
    fs.renameSync(srcFilePath, path.join(srcDir, expectedBaseName));
  }
  // copy public key and private key to key directory
  fs.copyFile(path.join(srcDir, expectedBaseName), path.join(destDir, expectedBaseName), err => {
    if (err) {
      // @ts-ignore
      logger.error(`Error copying file: ${err.message}`);
      throw new SoloError(`Error copying file: ${err.message}`);
    }
  });
}

/**
 * Add debug options to valuesArg used by helm chart
 * @param valuesArg the valuesArg to update
 * @param debugNodeAlias the node ID to attach the debugger to
 * @param index the index of extraEnv to add the debug options to
 * @returns updated valuesArg
 */
export function addDebugOptions(valuesArg: string, debugNodeAlias: NodeAlias, index = 0) {
  if (debugNodeAlias) {
    const nodeId = Templates.nodeIdFromNodeAlias(debugNodeAlias) - 1;
    valuesArg += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].name=JAVA_OPTS"`;
    valuesArg += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].value=-agentlib:jdwp=transport=dt_socket\\,server=y\\,suspend=y\\,address=*:${constants.JVM_DEBUG_PORT}"`;
  }
  return valuesArg;
}

/**
 * Returns an object that can be written to a file without data loss.
 * Contains fields needed for adding a new node through separate commands
 * @param ctx
 * @returns file writable object
 */
export function addSaveContextParser(ctx: any) {
  const exportedCtx = {} as Record<string, string>;

  const config = ctx.config as NodeAddConfigClass;
  const exportedFields = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  exportedCtx.signingCertDer = ctx.signingCertDer.toString();
  exportedCtx.gossipEndpoints = ctx.gossipEndpoints.map((ep: any) => `${ep.getDomainName}:${ep.getPort}`);
  exportedCtx.grpcServiceEndpoints = ctx.grpcServiceEndpoints.map((ep: any) => `${ep.getDomainName}:${ep.getPort}`);
  exportedCtx.adminKey = ctx.adminKey.toString();
  // @ts-ignore
  exportedCtx.existingNodeAliases = config.existingNodeAliases;

  for (const prop of exportedFields) {
    exportedCtx[prop] = ctx[prop];
  }
  return exportedCtx;
}

/**
 * Initializes objects in the context from a provided string
 * Contains fields needed for adding a new node through separate commands
 * @param ctx - accumulator object
 * @param ctxData - data in string format
 * @returns file writable object
 */
export function addLoadContextParser(ctx: any, ctxData: any) {
  const config: any = ctx.config;
  ctx.signingCertDer = new Uint8Array(ctxData.signingCertDer.split(','));
  ctx.gossipEndpoints = prepareEndpoints(
    ctx.config.endpointType,
    ctxData.gossipEndpoints,
    constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
  );
  ctx.grpcServiceEndpoints = prepareEndpoints(
    ctx.config.endpointType,
    ctxData.grpcServiceEndpoints,
    constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
  );
  ctx.adminKey = PrivateKey.fromStringED25519(ctxData.adminKey);
  config.nodeAlias = ctxData.newNode.name;
  config.existingNodeAliases = ctxData.existingNodeAliases;
  config.allNodeAliases = [...config.existingNodeAliases, ctxData.newNode.name];

  const fieldsToImport = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  for (const prop of fieldsToImport) {
    ctx[prop] = ctxData[prop];
  }
}

export function prepareEndpoints(endpointType: string, endpoints: string[], defaultPort: number | string) {
  const ret: ServiceEndpoint[] = [];
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
      ret.push(
        new ServiceEndpoint({
          port: +port,
          ipAddressV4: parseIpAddressToUint8Array(url),
        }),
      );
    } else {
      ret.push(
        new ServiceEndpoint({
          port: +port,
          domainName: url,
        }),
      );
    }
  }

  return ret;
}

/** Adds all the types of flags as properties on the provided argv object */
export function addFlagsToArgv(
  argv: any,
  flags: {
    requiredFlags: CommandFlag[];
    requiredFlagsWithDisabledPrompt: CommandFlag[];
    optionalFlags: CommandFlag[];
  },
) {
  argv.requiredFlags = flags.requiredFlags;
  argv.requiredFlagsWithDisabledPrompt = flags.requiredFlagsWithDisabledPrompt;
  argv.optionalFlags = flags.optionalFlags;

  return argv;
}
